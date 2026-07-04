import type { Day, Trade } from '../lib/hyperliquid'
import { money, price, usd } from '../lib/format'

function dateLong(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  const dow = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(d)
  const md = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(d)
  return `${dow} · ${md}`
}

function TradeCard({ t }: { t: Trade }) {
  const long = t.dir === 'LONG'
  // USDC notional of the quantity closed, at the trade's avg entry (cost
  // basis); falls back to exit when the entry predates the data window.
  const notional = t.size * (t.entry || t.exit)
  return (
    <div className="trade">
      <div className="trow1">
        <span className={`tdir ${long ? 'long' : 'short'}`}>{t.dir}</span>
        <span className="tasset">{t.asset}</span>
        {t.partial && (
          <span className="tag" title="Scale-out: the position stayed open past this day">
            partial
          </span>
        )}
        <span className="ttime">
          {t.time} ET
          <br />
          {t.session}
        </span>
      </div>
      <div className="tgrid">
        <div className="tg">
          <div className="kk">Entry</div>
          <div className="vv">{price(t.entry)}</div>
        </div>
        <div className="tg">
          <div className="kk">Exit</div>
          <div className="vv">{price(t.exit)}</div>
        </div>
        <div className="tg">
          <div className="kk">Size (USDC)</div>
          <div className="vv">{usd(notional)}</div>
        </div>
      </div>
      {t.tp != null && t.sl != null && (
        <div className="ttargets">
          <span>
            TP <span className="grn">{price(t.tp)}</span>
          </span>
          <span>
            SL <span className="red">{price(t.sl)}</span>
          </span>
        </div>
      )}
      <div className="tpnl">
        <span className="rr">
          {t.gross != null && <>gross {money(t.gross)} · </>}fee ${t.fee.toFixed(2)}
        </span>
        <span className={`amt ${t.pnl >= 0 ? 'grn' : 'red'}`}>{money(t.pnl)}</span>
      </div>
    </div>
  )
}

export function DetailPanel({ day, onClose }: { day: Day; onClose: () => void }) {
  const wins = day.trades_list.filter((t) => t.pnl >= 0).length
  const losses = day.trades - wins
  return (
    <aside className="panel">
      <div className="panel-head">
        <div className="panel-head-row">
          <div className="panel-date">{dateLong(day.date)}</div>
          <div className="panel-head-right">
            <span className="panel-src">Hyperliquid</span>
            <button className="panel-close" onClick={onClose} aria-label="Close panel">
              ✕
            </button>
          </div>
        </div>
        <div className={`mono panel-pnl ${day.pnl >= 0 ? 'grn' : 'red'}`}>{money(day.pnl)}</div>
        <div className="panel-meta">
          {day.trades} trades · {day.winRate}% win · {wins}W / {losses}L
        </div>
        {Math.abs(day.funding) >= 0.01 && (
          <div className="panel-meta">
            trades {money(day.tradePnl)} · funding{' '}
            <span className={day.funding >= 0 ? 'grn' : 'red'}>{money(day.funding)}</span>
          </div>
        )}
      </div>
      {day.trades_list.length ? (
        <div className="panel-list">
          {day.trades_list.map((t, i) => (
            <TradeCard t={t} key={i} />
          ))}
        </div>
      ) : (
        <div className="panel-empty">
          <div className="t1">{Math.abs(day.funding) >= 0.01 ? 'Funding only' : 'No trades logged'}</div>
          <div className="t2">
            {Math.abs(day.funding) >= 0.01 ? (
              <>
                No trades closed this day.
                <br />
                Funding {money(day.funding)} on open positions.
              </>
            ) : (
              <>
                Nothing synced for this day.
                <br />
                Pick a colored day to see fills.
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
