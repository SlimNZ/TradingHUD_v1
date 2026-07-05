/* ============================================================================
 * hyperliquid.ts — data contract + formatter (TS port of hyperliquid-adapter.js)
 * ----------------------------------------------------------------------------
 * Raw Hyperliquid fills are grouped into round-trip trades once (groupFills),
 * then rolled up into a JournalMonth per calendar month (buildMonth) so the
 * UI can page between months without refetching.
 *
 * Fills are public — POST https://api.hyperliquid.xyz/info
 *   { "type": "userFills", "user": "0x<MAIN account address>" }
 * Use the master/main account address, NOT an agent/API wallet (agent
 * wallets return an empty result).
 * ==========================================================================*/

export interface RawFill {
  coin: string
  px: string
  sz: string
  side: 'B' | 'A'
  time: number
  dir: string
  closedPnl: string
  fee: string
  startPosition: string
}

export interface Trade {
  time: string // "09:32" in the journal timezone
  session: string
  asset: string
  dir: 'LONG' | 'SHORT'
  entry: number
  exit: number
  size: number
  pnl: number // net of fees (price P&L minus fee)
  gross?: number // price P&L before fees (set by buildMonth; absent on raw RoundTrips)
  fee: number
  partial?: boolean // true = scale-out of a position that stayed open past this day
  tp: number | null // not present in fills; populate from trigger orders if fetched
  sl: number | null
}

/**
 * One day's realized slice of a round-trip trade, keyed to the calendar day
 * the P&L was realized (the day the closing fills happened). A position
 * closed within one day yields a single segment; a position scaled out over
 * N days yields N segments whose pnl sums to the trade's total.
 */
export interface RoundTrip extends Trade {
  iso: string // "2026-02-26"
  monthKey: string // "2026-02"
  dayNum: number
}

export interface Day {
  date: string
  dayNum: number
  pnl: number // net trade P&L (of fees) + funding for the day
  tradePnl: number // net trade P&L only (of fees), excluding funding
  funding: number // funding paid(-)/received(+) that day
  trades: number
  winRate: number
  assets: string[]
  tag: string | null
  session: string
  trades_list: Trade[]
}

export interface JournalMonth {
  wallet: string | null
  month: string // "February 2026"
  monthKey: string // "2026-02"
  timezone: string
  summary: {
    netPnl: number // total incl funding
    tradePnl: number // net trade P&L only (of fees), excluding funding
    funding: number // total funding paid(-)/received(+) for the month
    trades: number
    winRate: number
    bestDay: { date: string; pnl: number } | null
    worstDay: { date: string; pnl: number } | null
    cumulative: number[]
  }
  days: Day[]
}

/** Funding payment bucketed by calendar day (in the journal tz). */
export interface FundingEntry {
  time: number // ms
  coin: string
  usdc: number // payment: negative = paid, positive = received
}

// ---- Session bucketing ----------------------------------------------------
// Sessions are US/global MARKET windows defined in Eastern time, independent
// of the calendar-day timezone (a NZ trader still trades "the NY open"). So
// session is always classified from ET, even when days are bucketed in NZT.
export const SESSION_TZ = 'America/New_York'
const SESSIONS = [
  { name: 'London', start: 180, end: 360 }, // 03:00–06:00 ET
  { name: 'NY Open', start: 570, end: 690 }, // 09:30–11:30 ET
  { name: 'NY PM', start: 780, end: 960 }, // 13:00–16:00 ET
  { name: 'Asia (Nikkei)', start: 1140, end: 1320 }, // 19:00–22:00 ET
]

export function sessionForMinutes(min: number): string {
  for (const s of SESSIONS) if (min >= s.start && min < s.end) return s.name
  return 'Off-hours'
}

// Normalize Hyperliquid coin symbols to display tickers.
export function displayAsset(coin: string, spotNames?: Record<string, string>): string {
  if (!coin) return '?'
  if (coin.startsWith('@')) return spotNames?.[coin] ?? coin // spot index -> base token
  if (coin.includes(':')) return coin.split(':').pop() as string // HIP-3 "dex:SYM"
  return coin
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

interface DayBucket {
  pnl: number
  fee: number
  exitNotional: number
  exitSize: number
  firstCloseMs: number | null
}

interface OpenTrade {
  coin: string
  dirLong: boolean
  firstMs: number
  entryNotional: number
  entrySize: number
  days: Map<string, DayBucket> // iso -> that day's realized activity, in order
}

function tzParts(ms: number, tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(new Date(ms))
    .reduce<Record<string, string>>((o, x) => ((o[x.type] = x.value), o), {})
  return {
    iso: `${p.year}-${p.month}-${p.day}`,
    dayNum: parseInt(p.day, 10),
    hhmm: `${p.hour}:${p.minute}`,
    minutes: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10),
  }
}

/**
 * Group a flat list of fills into per-day realized trade segments.
 * A trade opens when the position leaves flat and completes when it returns
 * to flat. Its P&L is booked on the day(s) the closing fills actually
 * happened — a position scaled out across N days emits N segments (earlier
 * ones flagged `partial`), matching how Hyperliquid attributes realized P&L.
 * A fill that flips the position (long -> short in one print) completes the
 * current trade and opens a new one with the remainder.
 * Positions still open at the end of the data emit their realized-to-date
 * segments too (all flagged `partial`), so day totals always reconcile with
 * the sum of fill closedPnl.
 */
export function groupFills(
  rawFills: RawFill[],
  tz: string,
  spotNames?: Record<string, string>,
): RoundTrip[] {
  const fills = [...rawFills].sort((a, b) => a.time - b.time)
  const open: Record<string, OpenTrade> = {}
  const trips: RoundTrip[] = []

  const bucketFor = (t: OpenTrade, iso: string): DayBucket => {
    let b = t.days.get(iso)
    if (!b) {
      b = { pnl: 0, fee: 0, exitNotional: 0, exitSize: 0, firstCloseMs: null }
      t.days.set(iso, b)
    }
    return b
  }

  // Emit one segment per day that realized P&L. Fees from days with only
  // opening fills roll into the first realized segment so the trade's total
  // fee is preserved. stillOpen = position not yet flat: every segment is
  // partial, and fee carry stays with the live trade for its final segment.
  const emitSegments = (t: OpenTrade, stillOpen: boolean) => {
    const entry = t.entrySize ? t.entryNotional / t.entrySize : 0
    const realized = [...t.days.entries()].filter(
      ([, b]) => b.exitSize > 0 || Math.abs(b.pnl) > 1e-9,
    )
    if (!realized.length) return
    let openOnlyFees = 0
    if (!stillOpen) {
      for (const [, b] of t.days) {
        if (!(b.exitSize > 0 || Math.abs(b.pnl) > 1e-9)) openOnlyFees += b.fee
      }
    }
    realized.forEach(([iso, b], i) => {
      const ms = b.firstCloseMs ?? t.firstMs
      const p = tzParts(ms, tz) // display day/time in the journal tz
      trips.push({
        iso,
        monthKey: iso.slice(0, 7),
        dayNum: parseInt(iso.slice(8), 10),
        time: p.hhmm,
        session: sessionForMinutes(tzParts(ms, SESSION_TZ).minutes), // classify in ET
        asset: displayAsset(t.coin, spotNames),
        dir: t.dirLong ? 'LONG' : 'SHORT',
        entry,
        exit: b.exitSize ? b.exitNotional / b.exitSize : 0,
        size: round4(b.exitSize),
        pnl: round2(b.pnl),
        fee: round2(b.fee + (i === 0 ? openOnlyFees : 0)),
        partial: stillOpen || i < realized.length - 1,
        tp: null,
        sl: null,
      })
    })
  }

  for (const f of fills) {
    const px = parseFloat(f.px)
    const sz = parseFloat(f.sz)
    const fee = parseFloat(f.fee || '0')
    const pnl = parseFloat(f.closedPnl || '0')
    const isBuy = f.side === 'B'
    const startPos = parseFloat(f.startPosition || '0')
    const signed = isBuy ? sz : -sz
    const endPos = startPos + signed
    const eps = Math.max(1e-9, sz * 1e-6)
    const wasFlat = Math.abs(startPos) < eps
    const increasing = wasFlat || startPos > 0 === signed > 0
    const flips = !wasFlat && Math.abs(endPos) > eps && startPos > 0 !== endPos > 0
    const iso = tzParts(f.time, tz).iso

    let t = open[f.coin]
    if (!t) {
      // First fill we see for this coin. If it reduces a position opened
      // before our data window, the trade direction is opposite the fill.
      t = open[f.coin] = {
        coin: f.coin,
        dirLong: increasing ? isBuy : !isBuy,
        firstMs: f.time,
        entryNotional: 0,
        entrySize: 0,
        days: new Map(),
      }
    }

    if (flips) {
      // Split the fill: |startPos| closes the current trade, the remainder
      // opens a new one in the opposite direction. Fees pro-rata.
      const closeSz = Math.abs(startPos)
      const openSz = Math.abs(endPos)
      const b = bucketFor(t, iso)
      b.exitNotional += px * closeSz
      b.exitSize += closeSz
      b.pnl += pnl
      b.fee += fee * (closeSz / sz)
      if (b.firstCloseMs == null) b.firstCloseMs = f.time
      emitSegments(t, false)
      const next: OpenTrade = {
        coin: f.coin,
        dirLong: endPos > 0,
        firstMs: f.time,
        entryNotional: px * openSz,
        entrySize: openSz,
        days: new Map(),
      }
      bucketFor(next, iso).fee += fee * (openSz / sz)
      open[f.coin] = next
      continue
    }

    const b = bucketFor(t, iso)
    b.fee += fee
    b.pnl += pnl
    if (increasing) {
      t.entryNotional += px * sz
      t.entrySize += sz
      if (wasFlat) {
        t.dirLong = isBuy
        t.firstMs = f.time
      }
    } else {
      b.exitNotional += px * sz
      b.exitSize += sz
      if (b.firstCloseMs == null) b.firstCloseMs = f.time
    }

    if (Math.abs(endPos) < eps) {
      emitSegments(t, false)
      delete open[f.coin]
    }
  }
  // Positions still open at the end of the window: emit what they've
  // realized so far (all partial) so day totals reconcile with fills.
  for (const t of Object.values(open)) emitSegments(t, true)
  return trips
}

/** Sorted list of "YYYY-MM" keys that contain a trade or any funding. */
export function availableMonths(trips: RoundTrip[], funding: FundingEntry[] = [], tz = 'America/New_York'): string[] {
  const keys = new Set(trips.map((t) => t.monthKey))
  for (const f of funding) keys.add(tzParts(f.time, tz).iso.slice(0, 7))
  return [...keys].sort()
}

/**
 * NZ financial year for a "YYYY-MM" month key. The NZ tax year runs
 * 1 Apr – 31 Mar and is named by the year it ends: Apr 2025–Mar 2026 = FY2026.
 * fyEndMonth defaults to 3 (March); pass another to reuse for other regimes.
 */
export interface FinancialYear {
  label: string // "FY2026"
  endYear: number // 2026
  startMonth: string // "2025-04"
  endMonth: string // "2026-03"
}
export function financialYearOf(monthKey: string, fyEndMonth = 3): FinancialYear {
  const [y, m] = monthKey.split('-').map(Number)
  const endYear = m > fyEndMonth ? y + 1 : y
  const p2 = (n: number) => String(n).padStart(2, '0')
  return {
    label: `FY${endYear}`,
    endYear,
    startMonth: `${endYear - 1}-${p2(fyEndMonth + 1)}`,
    endMonth: `${endYear}-${p2(fyEndMonth)}`,
  }
}

export interface FinancialYearSummary {
  fy: FinancialYear
  netPnl: number // trades (net of fees) + funding
  tradePnl: number
  funding: number
  trades: number
}

/** Sum a financial year's totals across every month it contains. */
export function buildFinancialYear(
  trips: RoundTrip[],
  monthKey: string,
  opts: BuildMonthOpts = {},
): FinancialYearSummary {
  const fy = financialYearOf(monthKey)
  const funding = opts.funding ?? {}
  const monthsInFy = new Set<string>()
  for (const t of trips) if (t.monthKey >= fy.startMonth && t.monthKey <= fy.endMonth) monthsInFy.add(t.monthKey)
  for (const iso of Object.keys(funding)) {
    const mk = iso.slice(0, 7)
    if (mk >= fy.startMonth && mk <= fy.endMonth && Math.abs(funding[iso]) > 1e-9) monthsInFy.add(mk)
  }
  let netPnl = 0, tradePnl = 0, fundingTot = 0, trades = 0
  for (const mk of monthsInFy) {
    const m = buildMonth(trips, mk, opts)
    netPnl += m.summary.netPnl
    tradePnl += m.summary.tradePnl
    fundingTot += m.summary.funding
    trades += m.summary.trades
  }
  return {
    fy,
    netPnl: Math.round(netPnl * 100) / 100,
    tradePnl: Math.round(tradePnl * 100) / 100,
    funding: Math.round(fundingTot * 100) / 100,
    trades,
  }
}

/** Sum funding payments per calendar day (iso date in the journal tz). */
export function fundingByDay(funding: FundingEntry[], tz: string): Record<string, number> {
  const map: Record<string, number> = {}
  for (const f of funding) {
    const iso = tzParts(f.time, tz).iso
    map[iso] = (map[iso] || 0) + f.usdc
  }
  return map
}

export interface BuildMonthOpts {
  wallet?: string | null
  timezone?: string
  tags?: Record<string, string> // iso date -> label, e.g. from user storage
  funding?: Record<string, number> // iso date -> net funding that day (from fundingByDay)
}

/** Roll round-trip trades up into the JournalMonth payload the UI consumes. */
export function buildMonth(
  all: RoundTrip[],
  monthKey: string,
  opts: BuildMonthOpts = {},
): JournalMonth {
  const tz = opts.timezone || 'America/New_York'
  const trips = all
    .filter((t) => t.monthKey === monthKey)
    .sort((a, b) => a.iso.localeCompare(b.iso) || a.time.localeCompare(b.time))

  const byDay: Record<
    string,
    {
      date: string
      dayNum: number
      tradePnl: number
      wins: number
      trades: number
      assets: Set<string>
      sessions: Record<string, number>
      trades_list: Trade[]
    }
  > = {}
  const dayOf = (iso: string) =>
    byDay[iso] ||
    (byDay[iso] = {
      date: iso,
      dayNum: parseInt(iso.slice(8), 10),
      tradePnl: 0,
      wins: 0,
      trades: 0,
      assets: new Set(),
      sessions: {},
      trades_list: [],
    })

  for (const t of trips) {
    const d = dayOf(t.iso)
    const net = t.pnl - t.fee // fees are baked into every trade total
    d.tradePnl += net
    d.trades += 1
    if (net >= 0) d.wins += 1
    d.assets.add(t.asset)
    d.sessions[t.session] = (d.sessions[t.session] || 0) + 1
    d.trades_list.push({
      time: t.time,
      session: t.session,
      asset: t.asset,
      dir: t.dir,
      entry: t.entry, // full precision — the UI formats per magnitude
      exit: t.exit,
      size: round4(t.size),
      pnl: round2(net),
      gross: round2(t.pnl),
      fee: round2(t.fee),
      partial: t.partial,
      tp: t.tp,
      sl: t.sl,
    })
  }

  // Funding for this month — creates a day entry even with no trades so it
  // reconciles into the totals (funding accrues while positions are open).
  const funding = opts.funding ?? {}
  const fundByIso: Record<string, number> = {}
  for (const [iso, amt] of Object.entries(funding)) {
    if (iso.slice(0, 7) !== monthKey) continue
    fundByIso[iso] = amt
    if (Math.abs(amt) > 1e-9) dayOf(iso) // materialize funding-only days
  }

  const days: Day[] = Object.values(byDay)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const fund = round2(fundByIso[d.date] || 0)
      const tradePnl = round2(d.tradePnl)
      return {
        date: d.date,
        dayNum: d.dayNum,
        pnl: round2(tradePnl + fund),
        tradePnl,
        funding: fund,
        trades: d.trades,
        winRate: d.trades ? Math.round((d.wins / d.trades) * 100) : 0,
        assets: [...d.assets],
        tag: opts.tags?.[d.date] ?? null,
        session: d.trades
          ? Object.entries(d.sessions).sort((a, b) => b[1] - a[1])[0][0]
          : 'Funding',
        trades_list: d.trades_list,
      }
    })

  let net = 0
  let tradeNet = 0
  let fundNet = 0
  let tCount = 0
  let wins = 0
  let best: Day | null = null
  let worst: Day | null = null
  const cumulative: number[] = []
  for (const d of days) {
    net += d.pnl
    tradeNet += d.tradePnl
    fundNet += d.funding
    tCount += d.trades
    wins += d.trades_list.filter((t) => t.pnl >= 0).length
    cumulative.push(round2(net))
    if (!best || d.pnl > best.pnl) best = d
    if (!worst || d.pnl < worst.pnl) worst = d
  }

  const [y, m] = monthKey.split('-').map(Number)
  const monthName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, 15)))
  const shortDate = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(
      new Date(iso + 'T12:00:00Z'),
    )

  return {
    wallet: opts.wallet ?? null,
    month: monthName,
    monthKey,
    timezone: tz,
    summary: {
      netPnl: round2(net),
      tradePnl: round2(tradeNet),
      funding: round2(fundNet),
      trades: tCount,
      winRate: tCount ? Math.round((wins / tCount) * 100) : 0,
      bestDay: best ? { date: shortDate(best.date), pnl: best.pnl } : null,
      worstDay: worst ? { date: shortDate(worst.date), pnl: worst.pnl } : null,
      cumulative,
    },
    days,
  }
}

// ---- Fetch -----------------------------------------------------------------
// Dev goes through the Vite proxy (see vite.config.ts); prod calls direct.
const INFO_URL = import.meta.env?.DEV ? '/hl-api/info' : 'https://api.hyperliquid.xyz/info'

const PAGE_SIZE = 2000 // API max per response; ~10k most recent fills reachable

async function infoRequest(body: object): Promise<unknown> {
  const res = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Hyperliquid request failed (HTTP ${res.status})`)
  return res.json()
}

interface RawFillWithId extends RawFill {
  tid: number
}

/**
 * Fetch all reachable fills for a wallet by paging userFillsByTime forward
 * (oldest first, ascending). aggregateByTime combines partial fills from the
 * same order crossing multiple book levels.
 */
export async function fetchUserFills(wallet: string): Promise<RawFill[]> {
  const seen = new Set<number>()
  const all: RawFillWithId[] = []
  let startTime = 0
  // 6 pages ≈ the API's full ~10k-fill lookback with headroom.
  for (let page = 0; page < 6; page++) {
    const batch = (await infoRequest({
      type: 'userFillsByTime',
      user: wallet,
      startTime,
      aggregateByTime: true,
    })) as RawFillWithId[]
    if (!Array.isArray(batch)) throw new Error('Unexpected response from Hyperliquid')
    for (const f of batch) {
      if (!seen.has(f.tid)) {
        seen.add(f.tid)
        all.push(f)
      }
    }
    if (batch.length < PAGE_SIZE) break
    // restart from the last fill's timestamp; tid dedupe handles the overlap
    startTime = batch[batch.length - 1].time
  }
  return all
}

interface FundingRow {
  time: number
  hash: string
  delta: { type: string; coin: string; usdc: string; szi: string; fundingRate: string }
}

/**
 * Fetch all funding payments for a wallet by paging userFunding forward.
 * Returns entries with usdc = payment (negative = paid, positive = received).
 * Funding is not in the fills feed; the journal folds these into P&L.
 */
export async function fetchUserFunding(wallet: string): Promise<FundingEntry[]> {
  const FUND_PAGE = 500 // this endpoint caps at 500 rows/response
  const seen = new Set<string>()
  const all: FundingEntry[] = []
  let startTime = 0
  // Funding accrues hourly; allow generous paging for multi-year histories.
  for (let page = 0; page < 60; page++) {
    const batch = (await infoRequest({ type: 'userFunding', user: wallet, startTime })) as FundingRow[]
    if (!Array.isArray(batch)) throw new Error('Unexpected funding response from Hyperliquid')
    for (const r of batch) {
      const key = `${r.time}|${r.delta.coin}|${r.delta.usdc}`
      if (seen.has(key)) continue
      seen.add(key)
      all.push({ time: r.time, coin: r.delta.coin, usdc: parseFloat(r.delta.usdc || '0') })
    }
    if (batch.length < FUND_PAGE) break
    startTime = batch[batch.length - 1].time
  }
  return all
}

interface SpotMeta {
  tokens: { name: string; index: number }[]
  universe: { name: string; tokens: [number, number] }[]
}

/**
 * Map spot pair indices ("@162") to their base token name for display.
 * Best-effort: returns an empty map on failure so fills still render as @N.
 */
export async function fetchSpotMeta(): Promise<Record<string, string>> {
  try {
    const meta = (await infoRequest({ type: 'spotMeta' })) as SpotMeta
    const tokenByIdx = new Map(meta.tokens.map((t) => [t.index, t.name]))
    const map: Record<string, string> = {}
    for (const u of meta.universe) {
      const base = tokenByIdx.get(u.tokens[0])
      if (base) map[u.name] = base
    }
    return map
  } catch {
    return {}
  }
}

// ---- Open positions (current holdings, unrealized) -------------------------
export interface PerpPosition {
  coin: string
  dir: 'LONG' | 'SHORT'
  size: number // absolute
  entryPx: number
  markPx: number
  positionValue: number
  unrealizedPnl: number
  roe: number // return on equity, fraction (0.10 = +10%)
  leverage: number
  liquidationPx: number | null
  fundingSinceOpen: number // cumulative funding since the position opened (neg = paid)
}

export interface SpotHolding {
  coin: string
  size: number
  entryNtl: number // cost basis (USD notional at entry); 0 = unknown (bridged/deposited)
  currentValue: number
  unrealizedPnl: number | null // null when cost basis is unknown
}

export interface OpenPositions {
  accountValue: number // perp account value (margin summary)
  perps: PerpPosition[]
  spot: SpotHolding[]
  totalUnrealized: number // perps + spot with a known cost basis
  spotValue: number // total current value of shown spot holdings
  hiddenSpotDust: number // count of sub-threshold spot holdings not shown
}

interface ClearinghouseState {
  marginSummary: { accountValue: string }
  assetPositions: {
    position: {
      coin: string
      szi: string
      leverage: { value: number }
      entryPx: string
      positionValue: string
      unrealizedPnl: string
      returnOnEquity: string
      liquidationPx: string | null
      cumFunding: { sinceOpen: string }
    }
  }[]
}
interface SpotState {
  balances: { coin: string; token: number; total: string; entryNtl: string }[]
}

const SPOT_DUST_USD = 1 // hide spot holdings worth less than this

/**
 * Fetch current open positions: perps (with unrealized P&L, leverage, liq
 * price) and spot holdings (cost basis vs live value). Excludes USDC cash and
 * sub-$1 spot dust. These are live account state, not part of the realized
 * journal.
 */
export async function fetchOpenPositions(wallet: string): Promise<OpenPositions> {
  const [ch, spotState, mids, meta] = (await Promise.all([
    infoRequest({ type: 'clearinghouseState', user: wallet }),
    infoRequest({ type: 'spotClearinghouseState', user: wallet }),
    infoRequest({ type: 'allMids' }),
    infoRequest({ type: 'spotMeta' }),
  ])) as [ClearinghouseState, SpotState, Record<string, string>, SpotMeta]

  const perps: PerpPosition[] = (ch.assetPositions ?? []).map(({ position: p }) => {
    const szi = parseFloat(p.szi)
    const liq = p.liquidationPx ? parseFloat(p.liquidationPx) : null
    return {
      coin: p.coin,
      dir: szi >= 0 ? 'LONG' : 'SHORT',
      size: Math.abs(szi),
      entryPx: parseFloat(p.entryPx),
      markPx: mids[p.coin] !== undefined ? parseFloat(mids[p.coin]) : 0,
      positionValue: parseFloat(p.positionValue),
      unrealizedPnl: parseFloat(p.unrealizedPnl),
      roe: parseFloat(p.returnOnEquity),
      leverage: p.leverage?.value ?? 0,
      liquidationPx: liq,
      fundingSinceOpen: parseFloat(p.cumFunding?.sinceOpen ?? '0'),
    }
  })

  // Spot: map each token to its USDC pair mid to value the holding.
  const pairByBase = new Map<number, string>()
  for (const u of meta.universe) pairByBase.set(u.tokens[0], u.name)

  const spot: SpotHolding[] = []
  let hiddenSpotDust = 0
  for (const b of spotState.balances ?? []) {
    if (b.coin === 'USDC') continue // cash, not a position
    const size = parseFloat(b.total)
    const pair = pairByBase.get(b.token)
    const mid = pair && mids[pair] !== undefined ? parseFloat(mids[pair]) : 0
    const currentValue = size * mid
    const entryNtl = parseFloat(b.entryNtl || '0')
    if (currentValue < SPOT_DUST_USD) {
      hiddenSpotDust += 1
      continue
    }
    // entryNtl of 0 = no recorded cost basis (bridged/deposited/airdropped);
    // don't claim its full value as profit — mark unrealized unknown.
    const unrealizedPnl = entryNtl > 0.01 ? currentValue - entryNtl : null
    spot.push({ coin: b.coin, size, entryNtl, currentValue, unrealizedPnl })
  }
  spot.sort((a, b) => b.currentValue - a.currentValue)

  const totalUnrealized =
    perps.reduce((s, p) => s + p.unrealizedPnl, 0) +
    spot.reduce((s, h) => s + (h.unrealizedPnl ?? 0), 0)
  const spotValue = spot.reduce((s, h) => s + h.currentValue, 0)

  return {
    accountValue: parseFloat(ch.marginSummary?.accountValue ?? '0'),
    perps,
    spot,
    totalUnrealized,
    spotValue,
    hiddenSpotDust,
  }
}
