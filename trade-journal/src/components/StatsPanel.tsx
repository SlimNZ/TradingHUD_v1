import { useMemo } from 'react'
import type { RoundTrip } from '../lib/hyperliquid'
import type { MetaMap } from '../lib/notes'
import { tradeNoteKey } from '../lib/notes'
import { money } from '../lib/format'

interface Bucket {
  label: string
  trades: number
  wins: number
  net: number
}

function summarize(
  trips: RoundTrip[],
  meta: MetaMap,
  keyOf: (t: RoundTrip, m: MetaMap[string] | undefined) => string | null,
): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const t of trips) {
    const m = meta[tradeNoteKey(t.iso, t)]
    const label = keyOf(t, m)
    if (label == null) continue
    const net = t.pnl - t.fee
    const b = map.get(label) || { label, trades: 0, wins: 0, net: 0 }
    b.trades += 1
    if (net >= 0) b.wins += 1
    b.net += net
    map.set(label, b)
  }
  return [...map.values()].sort((a, b) => b.net - a.net)
}

function Table({ title, rows, hint }: { title: string; rows: Bucket[]; hint: string }) {
  return (
    <div className="stats-block">
      <div className="stats-block-title">{title}</div>
      {rows.length ? (
        <table className="stats-table">
          <thead>
            <tr>
              <th>{title.split(' ')[1] ?? ''}</th>
              <th>Trades</th>
              <th>Win%</th>
              <th>Avg</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="lbl">{r.label}</td>
                <td>{r.trades}</td>
                <td>{Math.round((r.wins / r.trades) * 100)}%</td>
                <td className={r.net / r.trades >= 0 ? 'grn' : 'red'}>{money(r.net / r.trades)}</td>
                <td className={r.net >= 0 ? 'grn' : 'red'}>{money(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="stats-empty">{hint}</div>
      )}
    </div>
  )
}

export function StatsPanel({
  trips,
  meta,
  onClose,
}: {
  trips: RoundTrip[]
  meta: MetaMap
  onClose: () => void
}) {
  const bySetup = useMemo(() => summarize(trips, meta, (_t, m) => m?.setup?.trim() || null), [trips, meta])
  const bySession = useMemo(() => summarize(trips, meta, (t) => t.session), [trips, meta])
  const byGrade = useMemo(() => summarize(trips, meta, (_t, m) => (m?.grade ? `Grade ${m.grade}` : null)), [trips, meta])

  // Rule adherence: of trades where you recorded a plan verdict, how many followed it.
  const planned = useMemo(() => {
    let yes = 0
    let total = 0
    let followedNet = 0
    let brokeNet = 0
    for (const t of trips) {
      const m = meta[tradeNoteKey(t.iso, t)]
      if (m?.followedPlan === undefined) continue
      total += 1
      const net = t.pnl - t.fee
      if (m.followedPlan) {
        yes += 1
        followedNet += net
      } else {
        brokeNet += net
      }
    }
    return { yes, total, followedNet, brokeNet }
  }, [trips, meta])

  const reviewed = trips.reduce((n, t) => n + (meta[tradeNoteKey(t.iso, t)] ? 1 : 0), 0)

  return (
    <div className="stats-overlay" onClick={onClose}>
      <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
        <div className="stats-head">
          <div>
            <div className="stats-title">Journal stats</div>
            <div className="stats-sub">
              {reviewed} of {trips.length} trades reviewed · all-time
            </div>
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Close stats">
            ✕
          </button>
        </div>

        <div className="stats-adherence">
          <div className="klabel">Rule adherence</div>
          {planned.total ? (
            <>
              <div className="adherence-val">
                {Math.round((planned.yes / planned.total) * 100)}%
                <span className="adherence-sub">
                  {' '}
                  followed plan ({planned.yes}/{planned.total})
                </span>
              </div>
              <div className="adherence-split mono">
                <span>
                  followed <span className={planned.followedNet >= 0 ? 'grn' : 'red'}>{money(planned.followedNet)}</span>
                </span>
                <span className="sep">·</span>
                <span>
                  broke <span className={planned.brokeNet >= 0 ? 'grn' : 'red'}>{money(planned.brokeNet)}</span>
                </span>
              </div>
            </>
          ) : (
            <div className="stats-empty">Tick “Followed plan” on trades to track this.</div>
          )}
        </div>

        <Table title="By setup" rows={bySetup} hint="Tag trades with a setup to compare them." />
        <Table title="By session" rows={bySession} hint="No trades yet." />
        <Table title="By grade" rows={byGrade} hint="Grade trades A/B/C to compare them." />

        <div className="stats-foot">
          Avg = average net P&L per trade (expectancy). Net is after fees. Notes and grades are
          saved on this device only.
        </div>
      </div>
    </div>
  )
}
