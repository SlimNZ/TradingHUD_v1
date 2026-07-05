/* Risk tooling: a personal portfolio/risk config plus the math behind the
 * exposure meter and position-size calculator. Config is global (same across
 * wallets — it's your risk appetite) and stored in localStorage. */
import type { OpenPositions } from './hyperliquid'

const CFG_KEY = 'tj:riskcfg'

export interface RiskConfig {
  portfolioCap: number // max total notional you're willing to run (USD)
  riskPct: number // max loss per trade, % of portfolioCap
}

export const DEFAULT_RISK: RiskConfig = { portfolioCap: 295000, riskPct: 1 }

export function loadRiskConfig(): RiskConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(CFG_KEY) || '{}')
    return {
      portfolioCap: Number(raw.portfolioCap) > 0 ? Number(raw.portfolioCap) : DEFAULT_RISK.portfolioCap,
      riskPct: Number(raw.riskPct) > 0 ? Number(raw.riskPct) : DEFAULT_RISK.riskPct,
    }
  } catch {
    return { ...DEFAULT_RISK }
  }
}

export function saveRiskConfig(cfg: RiskConfig): void {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
  } catch {
    // ignore — config stays in memory for the session
  }
}

/** Correlated-risk bucket. HIP-3 builder perps (dex:SYM, e.g. xyz:SILVER) are
 * equities/commodities → "Other"; everything else is crypto beta. */
export function classifyBucket(coin: string): 'Crypto' | 'Other' {
  return coin.includes(':') ? 'Other' : 'Crypto'
}

export interface Exposure {
  totalPerp: number // total perp notional (leverage exposure)
  crypto: number // crypto-beta bucket notional
  other: number // non-crypto (HIP-3/equities/commodities) notional
  spot: number // spot holdings value (context, not leverage)
}

export function computeExposure(positions: OpenPositions): Exposure {
  let crypto = 0
  let other = 0
  for (const p of positions.perps) {
    if (classifyBucket(p.coin) === 'Crypto') crypto += p.positionValue
    else other += p.positionValue
  }
  return { totalPerp: crypto + other, crypto, other, spot: positions.spotValue }
}

export interface SizeResult {
  stopDistance: number // |entry - stop| in price
  stopPct: number // stop distance as % of entry
  size: number // position size in base units
  notional: number // size * entry (USD)
}

/**
 * Position size from a fixed dollar risk and a stop: size = risk / stopDist.
 * Returns null if inputs are incoherent (non-positive entry, or stop == entry).
 */
export function sizeFromRisk(entry: number, stop: number, riskDollars: number): SizeResult | null {
  const stopDistance = Math.abs(entry - stop)
  if (!(entry > 0) || !(stopDistance > 0) || !(riskDollars > 0)) return null
  const size = riskDollars / stopDistance
  const notional = size * entry
  return { stopDistance, stopPct: (stopDistance / entry) * 100, size, notional }
}
