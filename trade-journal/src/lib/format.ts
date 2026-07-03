/** "+$1,240" / "-$680"; keeps cents only for sub-$100 amounts. */
export function money(n: number): string {
  const abs = Math.abs(n)
  const body =
    abs >= 100
      ? Math.round(abs).toLocaleString('en-US')
      : abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n < 0 ? '-$' : '+$') + body
}

/** Price at 3 decimal places; sub-0.1 prices keep 4 significant digits. */
export function price(n: number): string {
  const abs = Math.abs(n)
  if (abs === 0) return '0'
  if (abs >= 0.1) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  }
  const dp = Math.min(10, 3 - Math.floor(Math.log10(abs)))
  return n.toLocaleString('en-US', { maximumFractionDigits: dp })
}

/** Position size expressed in USDC notional, e.g. "$1,254,301". */
export function usd(n: number): string {
  const abs = Math.abs(n)
  const dp = abs >= 100 ? 0 : 2
  return '$' + abs.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

export function shortWallet(w: string): string {
  return w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w
}

/** "just now", "3m ago", "2h ago" */
export function ago(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}
