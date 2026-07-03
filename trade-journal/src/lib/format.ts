/** "+$1,240" / "-$680"; keeps cents only for sub-$100 amounts. */
export function money(n: number): string {
  const abs = Math.abs(n)
  const body =
    abs >= 100
      ? Math.round(abs).toLocaleString('en-US')
      : abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n < 0 ? '-$' : '+$') + body
}

/** Price with decimals scaled to magnitude (BTC 98,000 vs sub-cent alts). */
export function price(n: number): string {
  const abs = Math.abs(n)
  const dp = abs >= 1000 ? 1 : abs >= 10 ? 2 : abs >= 0.1 ? 4 : 6
  return n.toLocaleString('en-US', { maximumFractionDigits: dp })
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
