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
  pnl: number
  fee: number
  tp: number | null // not present in fills; populate from trigger orders if fetched
  sl: number | null
}

/** A completed round-trip trade, keyed to the calendar day it was opened. */
export interface RoundTrip extends Trade {
  iso: string // "2026-02-26"
  monthKey: string // "2026-02"
  dayNum: number
}

export interface Day {
  date: string
  dayNum: number
  pnl: number
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
    netPnl: number
    trades: number
    winRate: number
    bestDay: { date: string; pnl: number } | null
    worstDay: { date: string; pnl: number } | null
    cumulative: number[]
  }
  days: Day[]
}

// ---- Session bucketing (windows in target tz, minutes-from-midnight) ------
const SESSIONS = [
  { name: 'London', start: 180, end: 360 }, // 03:00–06:00
  { name: 'NY Open', start: 570, end: 690 }, // 09:30–11:30
  { name: 'NY PM', start: 780, end: 960 }, // 13:00–16:00
  { name: 'Asia (Nikkei)', start: 1140, end: 1320 }, // 19:00–22:00
]

export function sessionForMinutes(min: number): string {
  for (const s of SESSIONS) if (min >= s.start && min < s.end) return s.name
  return 'Off-hours'
}

// Normalize Hyperliquid coin symbols to display tickers.
export function displayAsset(coin: string): string {
  if (!coin) return '?'
  if (coin.startsWith('@')) return coin // spot indices; map via spotMeta if desired
  if (coin.includes(':')) return coin.split(':').pop() as string // HIP-3 "dex:SYM"
  return coin
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000

interface OpenTrade {
  coin: string
  dirLong: boolean
  firstMs: number
  entryNotional: number
  entrySize: number
  exitNotional: number
  exitSize: number
  pnl: number
  fee: number
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
 * Group a flat list of fills into completed round-trip trades.
 * A trade opens when the position leaves flat and closes when it returns to
 * flat. A fill that flips the position (long -> short in one print) closes
 * the current trade and opens a new one with the remainder.
 */
export function groupFills(rawFills: RawFill[], tz: string): RoundTrip[] {
  const fills = [...rawFills].sort((a, b) => a.time - b.time)
  const open: Record<string, OpenTrade> = {}
  const trips: RoundTrip[] = []

  const close = (t: OpenTrade) => {
    const p0 = tzParts(t.firstMs, tz)
    trips.push({
      iso: p0.iso,
      monthKey: p0.iso.slice(0, 7),
      dayNum: p0.dayNum,
      time: p0.hhmm,
      session: sessionForMinutes(p0.minutes),
      asset: displayAsset(t.coin),
      dir: t.dirLong ? 'LONG' : 'SHORT',
      entry: t.entrySize ? t.entryNotional / t.entrySize : 0,
      exit: t.exitSize ? t.exitNotional / t.exitSize : 0,
      size: round4(Math.max(t.entrySize, t.exitSize)),
      pnl: round2(t.pnl),
      fee: round2(t.fee),
      tp: null,
      sl: null,
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
        exitNotional: 0,
        exitSize: 0,
        pnl: 0,
        fee: 0,
      }
    }

    if (flips) {
      // Split the fill: |startPos| closes the current trade, the remainder
      // opens a new one in the opposite direction. Fees pro-rata.
      const closeSz = Math.abs(startPos)
      const openSz = Math.abs(endPos)
      t.exitNotional += px * closeSz
      t.exitSize += closeSz
      t.pnl += pnl
      t.fee += fee * (closeSz / sz)
      close(t)
      open[f.coin] = {
        coin: f.coin,
        dirLong: endPos > 0,
        firstMs: f.time,
        entryNotional: px * openSz,
        entrySize: openSz,
        exitNotional: 0,
        exitSize: 0,
        pnl: 0,
        fee: fee * (openSz / sz),
      }
      continue
    }

    t.fee += fee
    t.pnl += pnl
    if (increasing) {
      t.entryNotional += px * sz
      t.entrySize += sz
      if (wasFlat) {
        t.dirLong = isBuy
        t.firstMs = f.time
      }
    } else {
      t.exitNotional += px * sz
      t.exitSize += sz
    }

    if (Math.abs(endPos) < eps) {
      close(t)
      delete open[f.coin]
    }
  }
  // Trades still open (position not back to flat) are intentionally dropped —
  // the journal shows realized round trips only.
  return trips
}

/** Sorted list of "YYYY-MM" keys that contain at least one trade. */
export function availableMonths(trips: RoundTrip[]): string[] {
  return [...new Set(trips.map((t) => t.monthKey))].sort()
}

export interface BuildMonthOpts {
  wallet?: string | null
  timezone?: string
  tags?: Record<string, string> // iso date -> label, e.g. from user storage
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
      pnl: number
      wins: number
      trades: number
      assets: Set<string>
      sessions: Record<string, number>
      trades_list: Trade[]
    }
  > = {}
  for (const t of trips) {
    const d =
      byDay[t.iso] ||
      (byDay[t.iso] = {
        date: t.iso,
        dayNum: t.dayNum,
        pnl: 0,
        wins: 0,
        trades: 0,
        assets: new Set(),
        sessions: {},
        trades_list: [],
      })
    d.pnl += t.pnl
    d.trades += 1
    if (t.pnl >= 0) d.wins += 1
    d.assets.add(t.asset)
    d.sessions[t.session] = (d.sessions[t.session] || 0) + 1
    d.trades_list.push({
      time: t.time,
      session: t.session,
      asset: t.asset,
      dir: t.dir,
      entry: round2(t.entry),
      exit: round2(t.exit),
      size: round4(t.size),
      pnl: round2(t.pnl),
      fee: round2(t.fee),
      tp: t.tp,
      sl: t.sl,
    })
  }

  const days: Day[] = Object.values(byDay)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date,
      dayNum: d.dayNum,
      pnl: round2(d.pnl),
      trades: d.trades,
      winRate: Math.round((d.wins / d.trades) * 100),
      assets: [...d.assets],
      tag: opts.tags?.[d.date] ?? null,
      session: Object.entries(d.sessions).sort((a, b) => b[1] - a[1])[0][0],
      trades_list: d.trades_list,
    }))

  let net = 0
  let tCount = 0
  let wins = 0
  let best: Day | null = null
  let worst: Day | null = null
  const cumulative: number[] = []
  for (const d of days) {
    net += d.pnl
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
