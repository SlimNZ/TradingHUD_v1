import { useMemo } from 'react'
import type { Day, JournalMonth } from '../lib/hyperliquid'
import { money } from '../lib/format'

const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A calendar slot: a traded Day, a day number with no trades, or a pad cell. */
type Slot = { kind: 'day'; day: Day } | { kind: 'empty'; dayNum: number } | { kind: 'blank' }

function buildWeeks(monthKey: string, days: Day[]): Slot[][] {
  const [y, m] = monthKey.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const byNum = new Map(days.map((d) => [d.dayNum, d]))
  const slots: Slot[] = []
  for (let i = 0; i < firstDow; i++) slots.push({ kind: 'blank' })
  for (let d = 1; d <= daysInMonth; d++) {
    const day = byNum.get(d)
    slots.push(day ? { kind: 'day', day } : { kind: 'empty', dayNum: d })
  }
  while (slots.length % 7) slots.push({ kind: 'blank' })
  const weeks: Slot[][] = []
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7))
  return weeks
}

function DayCell({ slot, selected, onSelect }: { slot: Slot; selected: boolean; onSelect: (dayNum: number) => void }) {
  if (slot.kind === 'blank') return <div className="cell blank" />
  if (slot.kind === 'empty')
    return (
      <div className="cell empty">
        <div className="dnum">{slot.dayNum}</div>
      </div>
    )
  const d = slot.day
  const klass = d.pnl >= 0 ? 'win' : 'loss'
  return (
    <div className={`cell ${klass} ${selected ? 'sel' : ''}`} onClick={() => onSelect(d.dayNum)}>
      <div className="dnum">{d.dayNum}</div>
      <div className="cpnl">{money(d.pnl)}</div>
      <div className="cmeta">
        {d.trades ? `${d.trades} trades · ${d.winRate}%` : 'funding only'}
      </div>
      <div className="chips">
        {d.assets.map((a) => (
          <span className="chip" key={a}>
            {a}
          </span>
        ))}
      </div>
      <div className="cfoot">
        {d.tag ? <span className="tag">{d.tag}</span> : <span />}
        <span className="sess">{d.session}</span>
      </div>
    </div>
  )
}

function WeeklyTotal({ idx, week }: { idx: number; week: Slot[] }) {
  let pnl = 0
  let trades = 0
  for (const s of week)
    if (s.kind === 'day') {
      pnl += s.day.pnl
      trades += s.day.trades
    }
  return (
    <div className="cell wtotal">
      <div className="wk-label">W{idx}</div>
      <div className={`mono wk-pnl ${pnl >= 0 ? 'grn' : 'red'}`}>{money(pnl)}</div>
      <div className="mono wk-trades">{trades} trades</div>
    </div>
  )
}

interface Props {
  journal: JournalMonth
  selected: number | null
  onSelect: (dayNum: number) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  canPrev: boolean
  canNext: boolean
  onOpenStats: () => void
  onOpenPositions: () => void
  onOpenRisk: () => void
  positionCount: number | null
}

export function CalendarGrid({
  journal,
  selected,
  onSelect,
  onPrevMonth,
  onNextMonth,
  canPrev,
  canNext,
  onOpenStats,
  onOpenPositions,
  onOpenRisk,
  positionCount,
}: Props) {
  const weeks = useMemo(() => buildWeeks(journal.monthKey, journal.days), [journal])
  return (
    <main className="center">
      <header className="cal-header">
        <div className="month-nav">
          <button className="nav-btn" onClick={onPrevMonth} disabled={!canPrev} aria-label="Previous month">
            ‹
          </button>
          <span className="month-label">{journal.month}</span>
          <button className="nav-btn" onClick={onNextMonth} disabled={!canNext} aria-label="Next month">
            ›
          </button>
        </div>
        {positionCount != null && (
          <button className="stats-btn" onClick={onOpenPositions}>
            ◆ Positions{positionCount > 0 ? ` (${positionCount})` : ''}
          </button>
        )}
        <button className="stats-btn" onClick={onOpenRisk}>
          ⚖ Risk
        </button>
        <button className="stats-btn" onClick={onOpenStats}>
          📊 Stats
        </button>
        <div className="cal-legend">
          <span className="item">
            <span className="sw" style={{ background: 'rgba(34,197,94,.5)' }} />
            profit
          </span>
          <span className="item">
            <span className="sw" style={{ background: 'rgba(248,113,113,.5)' }} />
            loss
          </span>
          <span className="sep">|</span>
          <span>tz: {journal.timezone}</span>
        </div>
      </header>
      <div className="cal-scroll">
        <div className="cal-grid">
          <div className="cal-row">
            {DOWS.map((wd) => (
              <div className="dow" key={wd}>
                {wd}
              </div>
            ))}
            <div className="dow week">Week</div>
          </div>
          {weeks.map((week, wi) => (
            <div className="cal-row" key={wi}>
              {week.map((slot, ci) => (
                <DayCell
                  key={ci}
                  slot={slot}
                  selected={slot.kind === 'day' && slot.day.dayNum === selected}
                  onSelect={onSelect}
                />
              ))}
              <WeeklyTotal idx={wi + 1} week={week} />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
