/* Demo dataset — deterministic port of the design prototype's February 2026
 * journal, emitted as RoundTrip[] so it flows through buildMonth() exactly
 * like live Hyperliquid data. */
import type { RoundTrip } from './hyperliquid'

export const DEMO_WALLET = '0x31ca8395cf837de08b24da3f660e77761dfb974b'
export const DEMO_FILL_COUNT = 322
export const DEMO_MONTH_KEY = '2026-02'

interface DaySpec {
  dnum: number
  trades: number
  pnl: number
  winRate: number
  assets: string[]
  tag: string
  sess: string
}

const DAYS: DaySpec[] = [
  { dnum: 2, trades: 8, pnl: 1240, winRate: 62, assets: ['ES', 'NQ'], tag: 'breakout', sess: 'NY Open' },
  { dnum: 3, trades: 12, pnl: -680, winRate: 41, assets: ['BTC', 'ETH'], tag: 'FOMO', sess: 'Asia (Nikkei)' },
  { dnum: 4, trades: 5, pnl: 430, winRate: 80, assets: ['NQ'], tag: 'A+ setup', sess: 'London' },
  { dnum: 5, trades: 15, pnl: 2180, winRate: 66, assets: ['ES', 'BTC', 'AAPL'], tag: 'news', sess: 'NY Open' },
  { dnum: 6, trades: 9, pnl: -320, winRate: 44, assets: ['NQ', 'NVDA'], tag: 'reversal', sess: 'NY PM' },
  { dnum: 7, trades: 3, pnl: 150, winRate: 66, assets: ['BTC'], tag: 'scalp', sess: 'Asia (Nikkei)' },
  { dnum: 9, trades: 11, pnl: 890, winRate: 54, assets: ['ES', 'NQ'], tag: 'breakout', sess: 'NY Open' },
  { dnum: 10, trades: 7, pnl: -1450, winRate: 28, assets: ['BTC', 'ETH'], tag: 'FOMO', sess: 'London' },
  { dnum: 11, trades: 6, pnl: 610, winRate: 66, assets: ['AAPL', 'NVDA'], tag: 'A+ setup', sess: 'NY Open' },
  { dnum: 12, trades: 14, pnl: 1720, winRate: 60, assets: ['ES', 'NQ', 'BTC'], tag: 'news', sess: 'NY Open' },
  { dnum: 13, trades: 10, pnl: 340, winRate: 50, assets: ['NQ'], tag: 'scalp', sess: 'NY PM' },
  { dnum: 16, trades: 9, pnl: -540, winRate: 44, assets: ['ES'], tag: 'reversal', sess: 'NY Open' },
  { dnum: 17, trades: 13, pnl: 1960, winRate: 69, assets: ['BTC', 'ETH', 'NQ'], tag: 'breakout', sess: 'Asia (Nikkei)' },
  { dnum: 18, trades: 8, pnl: 720, winRate: 62, assets: ['AAPL'], tag: 'A+ setup', sess: 'NY Open' },
  { dnum: 19, trades: 15, pnl: -2240, winRate: 33, assets: ['NQ', 'ES'], tag: 'FOMO', sess: 'London' },
  { dnum: 20, trades: 6, pnl: 480, winRate: 66, assets: ['NVDA'], tag: 'news', sess: 'NY PM' },
  { dnum: 21, trades: 4, pnl: 210, winRate: 75, assets: ['BTC'], tag: 'scalp', sess: 'Asia (Nikkei)' },
  { dnum: 23, trades: 10, pnl: 1130, winRate: 60, assets: ['ES', 'NQ'], tag: 'breakout', sess: 'NY Open' },
  { dnum: 24, trades: 12, pnl: 640, winRate: 58, assets: ['BTC', 'ETH'], tag: 'scalp', sess: 'London' },
  { dnum: 25, trades: 7, pnl: -390, winRate: 42, assets: ['AAPL', 'NVDA'], tag: 'reversal', sess: 'NY Open' },
  { dnum: 26, trades: 14, pnl: 2560, winRate: 71, assets: ['ES', 'NQ', 'BTC'], tag: 'A+ setup', sess: 'NY Open' },
  { dnum: 27, trades: 9, pnl: 820, winRate: 55, assets: ['NQ'], tag: 'news', sess: 'NY PM' },
]

const ASSET_CFG: Record<string, { price: number; dist: number; risk: number; base: number; szBig: boolean }> = {
  BTC: { price: 98000, dist: 1300, risk: 900, base: 520, szBig: false },
  ETH: { price: 3420, dist: 60, risk: 42, base: 340, szBig: false },
  ES: { price: 6120, dist: 22, risk: 14, base: 400, szBig: false },
  NQ: { price: 21500, dist: 80, risk: 48, base: 440, szBig: false },
  AAPL: { price: 232, dist: 3.4, risk: 2.1, base: 270, szBig: true },
  NVDA: { price: 178, dist: 4.2, risk: 2.6, base: 300, szBig: true },
}

function rng(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function sessWindow(s: string): [number, number] {
  if (s === 'NY Open') return [570, 690]
  if (s === 'London') return [180, 360]
  if (s === 'Asia (Nikkei)') return [1140, 1320]
  return [780, 960] // NY PM
}

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function demoTrips(): RoundTrip[] {
  const trips: RoundTrip[] = []
  for (const day of DAYS) {
    const r = rng(day.dnum * 97 + 13)
    const nWin = Math.max(0, Math.min(day.trades, Math.round((day.trades * day.winRate) / 100)))
    const flags = Array.from({ length: day.trades }, (_, i) => i < nWin)
    for (let i = flags.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[flags[i], flags[j]] = [flags[j], flags[i]]
    }
    const [a, b] = sessWindow(day.sess)
    const times = flags.map(() => Math.floor(a + r() * (b - a))).sort((x, y) => x - y)

    const raw = flags.map((win, i) => {
      const asset = day.assets[i % day.assets.length]
      const c = ASSET_CFG[asset]
      const long = r() < 0.55
      const entry = c.price * (1 + (r() - 0.5) * 0.012)
      const tp = long ? entry + c.dist : entry - c.dist
      const sl = long ? entry - c.risk : entry + c.risk
      const mag = c.base * (0.5 + r() * 1.1)
      const pnlRaw = win ? mag : -mag * 0.9
      const size = c.szBig ? Math.round(5000 / entry) : entry > 1000 ? Math.round((1 + r() * 3) * 10) / 10 : 2
      const exit = long ? entry + (win ? c.dist * 0.7 : -c.risk * 0.85) : entry - (win ? c.dist * 0.7 : -c.risk * 0.85)
      const fee = Math.max(0.05, entry * Math.min(size, 3) * 0.00035)
      const hasTargets = r() < 0.45
      return { asset, long, entry, exit, tp, sl, hasTargets, fee, pnlRaw, size, time: hhmm(times[i]) }
    })

    // Scale per-trade P&L so the day sums to the spec'd total.
    const sum = raw.reduce((s, x) => s + x.pnlRaw, 0)
    const factor = sum !== 0 && Math.sign(sum) === Math.sign(day.pnl) ? day.pnl / sum : 1
    const pnls = raw.map((x) => Math.round((x.pnlRaw * factor) / 5) * 5)
    let bi = 0
    pnls.forEach((p, i) => {
      if (Math.abs(p) > Math.abs(pnls[bi])) bi = i
    })
    pnls[bi] += day.pnl - pnls.reduce((s, p) => s + p, 0)

    const iso = `2026-02-${String(day.dnum).padStart(2, '0')}`
    raw.forEach((x, i) => {
      trips.push({
        iso,
        monthKey: DEMO_MONTH_KEY,
        dayNum: day.dnum,
        time: x.time,
        session: day.sess,
        asset: x.asset,
        dir: x.long ? 'LONG' : 'SHORT',
        entry: x.entry,
        exit: x.exit,
        size: x.size,
        pnl: pnls[i],
        fee: x.fee,
        tp: x.hasTargets ? x.tp : null,
        sl: x.hasTargets ? x.sl : null,
      })
    })
  }
  return trips
}

export function demoTags(): Record<string, string> {
  const tags: Record<string, string> = {}
  for (const d of DAYS) tags[`2026-02-${String(d.dnum).padStart(2, '0')}`] = d.tag
  return tags
}
