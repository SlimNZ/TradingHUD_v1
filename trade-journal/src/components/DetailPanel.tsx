import { useEffect, useRef, useState } from 'react'
import type { Day, Trade } from '../lib/hyperliquid'
import { money, price, usd } from '../lib/format'
import { dayNoteKey, tradeNoteKey, SETUP_SUGGESTIONS } from '../lib/notes'
import type { Grade, MetaMap, NoteMap, TradeMeta } from '../lib/notes'

const GRADES: Grade[] = ['A', 'B', 'C']

function TradeMetaControls({
  meta,
  onSave,
}: {
  meta: TradeMeta | undefined
  onSave: (patch: Partial<TradeMeta>) => void
}) {
  return (
    <div className="tmeta">
      <div className="grade-row">
        <span className="tmeta-label">Grade</span>
        {GRADES.map((g) => (
          <button
            key={g}
            className={`grade-pill ${meta?.grade === g ? 'on g' + g : ''}`}
            onClick={() => onSave({ grade: meta?.grade === g ? undefined : g })}
          >
            {g}
          </button>
        ))}
        <label className="plan-check">
          <input
            type="checkbox"
            checked={!!meta?.followedPlan}
            onChange={(e) => onSave({ followedPlan: e.target.checked })}
          />
          Followed plan
        </label>
      </div>
      <input
        className="setup-input"
        list="tj-setups"
        placeholder="setup (e.g. breakout)"
        defaultValue={meta?.setup ?? ''}
        onBlur={(e) => {
          if ((e.target.value.trim() || '') !== (meta?.setup ?? '')) onSave({ setup: e.target.value })
        }}
      />
    </div>
  )
}

function dateLong(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  const dow = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(d)
  const md = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(d)
  return `${dow} · ${md}`
}

/** Inline note editor: click to edit, auto-saves on blur, Esc cancels. */
function NoteEditor({
  value,
  placeholder,
  addLabel,
  onSave,
}: {
  value: string | undefined
  placeholder: string
  addLabel: string
  onSave: (text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  useEffect(() => {
    if (editing && ref.current) {
      const el = ref.current
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing])

  if (editing) {
    return (
      <textarea
        ref={ref}
        className="note-input"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onSave(draft)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value ?? '')
            setEditing(false)
          }
        }}
      />
    )
  }
  if (value) {
    return (
      <div className="note-text" onClick={() => setEditing(true)} title="Click to edit">
        {value}
      </div>
    )
  }
  return (
    <button className="note-add" onClick={() => setEditing(true)}>
      {addLabel}
    </button>
  )
}

function TradeCard({
  t,
  note,
  meta,
  onSaveNote,
  onSaveMeta,
}: {
  t: Trade
  note: string | undefined
  meta: TradeMeta | undefined
  onSaveNote: (text: string) => void
  onSaveMeta: (patch: Partial<TradeMeta>) => void
}) {
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
          {t.time} NZT
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
      <TradeMetaControls meta={meta} onSave={onSaveMeta} />
      <div className="tnote">
        <NoteEditor
          value={note}
          onSave={onSaveNote}
          addLabel="＋ Add note"
          placeholder="Setup & trigger · execution · mistake · lesson…"
        />
      </div>
    </div>
  )
}

export function DetailPanel({
  day,
  notes,
  meta,
  onSaveNote,
  onSaveMeta,
  onClose,
}: {
  day: Day
  notes: NoteMap
  meta: MetaMap
  onSaveNote: (key: string, text: string) => void
  onSaveMeta: (key: string, patch: Partial<TradeMeta>) => void
  onClose: () => void
}) {
  const wins = day.trades_list.filter((t) => t.pnl >= 0).length
  const losses = day.trades - wins
  return (
    <aside className="panel">
      <datalist id="tj-setups">
        {SETUP_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
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
        <div className="day-note">
          <div className="day-note-label">Daily review</div>
          <NoteEditor
            value={notes[dayNoteKey(day.date)]}
            onSave={(text) => onSaveNote(dayNoteKey(day.date), text)}
            addLabel="＋ Add daily review"
            placeholder="Market context · what I did well · what to improve · rules followed/broken · plan for tomorrow…"
          />
        </div>
      </div>
      {day.trades_list.length ? (
        <div className="panel-list">
          {day.trades_list.map((t, i) => (
            <TradeCard
              t={t}
              key={i}
              note={notes[tradeNoteKey(day.date, t)]}
              meta={meta[tradeNoteKey(day.date, t)]}
              onSaveNote={(text) => onSaveNote(tradeNoteKey(day.date, t), text)}
              onSaveMeta={(patch) => onSaveMeta(tradeNoteKey(day.date, t), patch)}
            />
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
