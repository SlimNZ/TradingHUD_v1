import type { OpenPositions } from '../lib/hyperliquid'
import { money, price, usd } from '../lib/format'

export function PositionsPanel({
  positions,
  syncedAt,
  onClose,
}: {
  positions: OpenPositions
  syncedAt: number
  onClose: () => void
}) {
  const { perps, spot } = positions
  const hasAny = perps.length > 0 || spot.length > 0
  return (
    <div className="stats-overlay" onClick={onClose}>
      <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
        <div className="stats-head">
          <div>
            <div className="stats-title">Open positions</div>
            <div className="stats-sub">live · unrealized excludes fees & funding</div>
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Close positions">
            ✕
          </button>
        </div>

        <div className="pos-summary">
          <div className="pos-sum-tile">
            <div className="klabel">Unrealized P&L</div>
            <div className={`mono pos-sum-val ${positions.totalUnrealized >= 0 ? 'grn' : 'red'}`}>
              {money(positions.totalUnrealized)}
            </div>
          </div>
          <div className="pos-sum-tile">
            <div className="klabel">Perp acct value</div>
            <div className="mono pos-sum-val sm">{usd(positions.accountValue)}</div>
          </div>
          <div className="pos-sum-tile">
            <div className="klabel">Spot holdings</div>
            <div className="mono pos-sum-val sm">{usd(positions.spotValue)}</div>
          </div>
        </div>

        {!hasAny && <div className="stats-empty">No open positions right now.</div>}

        {perps.length > 0 && (
          <div className="stats-block">
            <div className="stats-block-title">Perps ({perps.length})</div>
            <div className="pos-list">
              {perps.map((p) => (
                <div className="pos-card" key={p.coin}>
                  <div className="pos-row1">
                    <span className={`tdir ${p.dir === 'LONG' ? 'long' : 'short'}`}>{p.dir}</span>
                    <span className="tasset">{p.coin}</span>
                    <span className="pos-lev">{p.leverage}×</span>
                    <span className={`pos-upnl mono ${p.unrealizedPnl >= 0 ? 'grn' : 'red'}`}>
                      {money(p.unrealizedPnl)}
                      <span className="pos-roe"> ({p.roe >= 0 ? '+' : ''}{(p.roe * 100).toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="pos-grid mono">
                    <span>size {p.size.toLocaleString('en-US')}</span>
                    <span>entry {price(p.entryPx)}</span>
                    <span>mark {price(p.markPx)}</span>
                    <span>value {usd(p.positionValue)}</span>
                    <span className="red">liq {p.liquidationPx ? price(p.liquidationPx) : '—'}</span>
                    <span className={p.fundingSinceOpen >= 0 ? 'grn' : 'red'}>
                      funding {money(p.fundingSinceOpen)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {spot.length > 0 && (
          <div className="stats-block">
            <div className="stats-block-title">Spot holdings ({spot.length})</div>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Cost</th>
                  <th>Value</th>
                  <th>Unrealized</th>
                </tr>
              </thead>
              <tbody>
                {spot.map((h) => (
                  <tr key={h.coin}>
                    <td className="lbl">{h.coin}</td>
                    <td>{h.entryNtl > 0.01 ? usd(h.entryNtl) : '—'}</td>
                    <td>{usd(h.currentValue)}</td>
                    <td className={h.unrealizedPnl == null ? '' : h.unrealizedPnl >= 0 ? 'grn' : 'red'}>
                      {h.unrealizedPnl == null ? 'no basis' : money(h.unrealizedPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {positions.hiddenSpotDust > 0 && (
              <div className="stats-empty" style={{ marginTop: 8 }}>
                {positions.hiddenSpotDust} dust holding{positions.hiddenSpotDust === 1 ? '' : 's'} under $1
                hidden. “no basis” = bridged/deposited with no recorded cost, so it isn’t counted as
                unrealized P&L.
              </div>
            )}
          </div>
        )}

        <div className="stats-foot">
          Synced {new Date(syncedAt).toLocaleTimeString()}. Unrealized P&L is live mark-to-market and
          not part of the realized journal — it lands on the calendar when you close.
        </div>
      </div>
    </div>
  )
}
