import type { FinancialYearSummary, JournalMonth, OpenPositions } from '../lib/hyperliquid'
import { money, shortWallet, ago, usd } from '../lib/format'
import { computeExposure } from '../lib/risk'
import type { RiskConfig } from '../lib/risk'

const SESSION_LEGEND = [
  { color: '#e0b64a', label: 'NY Open · 09:30 ET' },
  { color: '#5aa9e6', label: 'London · 03:00 ET' },
  { color: '#c084fc', label: 'Asia (Nikkei) · 19:00 ET' },
  { color: '#8b929c', label: 'NY PM · 13:00 ET' },
]

function Sparkline({ values }: { values: number[] }) {
  const W = 216
  const H = 66
  const pad = 6
  if (!values.length) return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} />
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const range = max - min || 1
  const points = values
    .map((v, i) => {
      const x = pad + (i / Math.max(values.length - 1, 1)) * (W - 2 * pad)
      const y = H - pad - ((v - min) / range) * (H - 2 * pad)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const up = values[values.length - 1] >= 0
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        stroke={up ? '#34d399' : '#f87171'}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface Props {
  journal: JournalMonth
  fySummary: FinancialYearSummary | null
  positions: OpenPositions | null
  riskConfig: RiskConfig
  fillCount: number
  syncedAt: number
  refreshing: boolean
  onChangeWallet: () => void
  onRefresh: () => void
  onOpenRisk: () => void
  onOpenRules: () => void
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fyRange = (fy: FinancialYearSummary['fy']) => {
  const s = fy.startMonth.split('-').map(Number)
  const e = fy.endMonth.split('-').map(Number)
  return `${MONTH_ABBR[s[1] - 1]} ${s[0]} – ${MONTH_ABBR[e[1] - 1]} ${e[0]}`
}

// Live perp notional vs your cap: green under 75%, amber to 100%, red over.
function ExposureMeter({
  positions,
  cap,
  onClick,
}: {
  positions: OpenPositions
  cap: number
  onClick: () => void
}) {
  const ex = computeExposure(positions)
  const ratio = cap > 0 ? ex.totalPerp / cap : 0
  const pct = Math.round(ratio * 100)
  const tone = ratio > 1 ? 'over' : ratio > 0.75 ? 'warn' : 'ok'
  return (
    <button className={`exposure exposure-${tone}`} onClick={onClick} title="Open risk tools">
      <div className="exposure-head">
        <span className="klabel">Exposure · perp notional</span>
        <span className="exposure-pct mono">{pct}%</span>
      </div>
      <div className="exposure-bar">
        <div className="exposure-fill" style={{ width: `${Math.min(100, pct)}%` }} />
        {ratio > 1 && <div className="exposure-over-flag" />}
      </div>
      <div className="exposure-nums mono">
        {usd(ex.totalPerp)} / {usd(cap)}
      </div>
      {(ex.crypto > 0 || ex.other > 0) && (
        <div className="exposure-buckets mono">
          <span>crypto {usd(ex.crypto)}</span>
          {ex.other > 0 && (
            <>
              <span className="sep">·</span>
              <span>other {usd(ex.other)}</span>
            </>
          )}
        </div>
      )}
    </button>
  )
}

export function LeftStats({
  journal,
  fySummary,
  positions,
  riskConfig,
  fillCount,
  syncedAt,
  refreshing,
  onChangeWallet,
  onRefresh,
  onOpenRisk,
  onOpenRules,
}: Props) {
  const s = journal.summary
  return (
    <aside className="left">
      <div>
        <div className="left-title">TRADE JOURNAL</div>
        <div className="left-month">{journal.month}</div>
        <button className="rules-link" onClick={onOpenRules}>
          📋 Trading rules
        </button>
      </div>

      <div className="source-card">
        <div className="klabel">Source</div>
        <div className="source-live">
          <span className="source-dot" />
          <span className="source-name">Hyperliquid</span>
        </div>
        <div className="source-wallet">{journal.wallet ? shortWallet(journal.wallet) : '—'}</div>
        <div className="source-sync">
          Synced {ago(syncedAt)} · {fillCount} fills
        </div>
        <div className="source-btns">
          <button className="source-btn" onClick={onChangeWallet}>
            Change wallet
          </button>
          <button className="source-btn" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {positions && (
        <ExposureMeter positions={positions} cap={riskConfig.portfolioCap} onClick={onOpenRisk} />
      )}

      <div>
        <div className="klabel" style={{ marginBottom: 7 }}>
          Net P&L · Month
        </div>
        <div className={`mono netpnl ${s.netPnl >= 0 ? 'grn' : 'red'}`}>{money(s.netPnl)}</div>
        <div className="mono netpnl-breakdown">
          <span>trades {money(s.tradePnl)}</span>
          <span className="sep">·</span>
          <span>funding {money(s.funding)}</span>
        </div>
      </div>

      {fySummary && (
        <div className="fy-card">
          <div className="fy-head">
            <span className="klabel">NZ {fySummary.fy.label}</span>
            <span className="fy-range">{fyRange(fySummary.fy)}</span>
          </div>
          <div className={`mono fy-net ${fySummary.netPnl >= 0 ? 'grn' : 'red'}`}>
            {money(fySummary.netPnl)}
          </div>
          <div className="mono netpnl-breakdown">
            <span>trades {money(fySummary.tradePnl)}</span>
            <span className="sep">·</span>
            <span>funding {money(fySummary.funding)}</span>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="klabel">Trades</div>
          <div className="mono stat-val">{s.trades}</div>
        </div>
        <div className="stat-tile">
          <div className="klabel">Win rate</div>
          <div className="mono stat-val">{s.winRate}%</div>
        </div>
        <div className="stat-tile">
          <div className="klabel">Best day</div>
          <div className={`mono stat-val sm ${!s.bestDay || s.bestDay.pnl >= 0 ? 'grn' : 'red'}`}>
            {s.bestDay ? money(s.bestDay.pnl) : '—'}
          </div>
          <div className="mono stat-sub">{s.bestDay?.date ?? ''}</div>
        </div>
        <div className="stat-tile">
          <div className="klabel">Worst day</div>
          <div className={`mono stat-val sm ${!s.worstDay || s.worstDay.pnl >= 0 ? 'grn' : 'red'}`}>
            {s.worstDay ? money(s.worstDay.pnl) : '—'}
          </div>
          <div className="mono stat-sub">{s.worstDay?.date ?? ''}</div>
        </div>
      </div>

      <div>
        <div className="klabel" style={{ marginBottom: 8 }}>
          Cumulative P&L
        </div>
        <Sparkline values={s.cumulative} />
      </div>

      <div className="sessions">
        <div className="klabel" style={{ marginBottom: 8 }}>
          Sessions
        </div>
        <div className="sess-rows">
          {SESSION_LEGEND.map((x) => (
            <div className="sess-row" key={x.label}>
              <span className="sess-swatch" style={{ background: x.color }} />
              {x.label}
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
