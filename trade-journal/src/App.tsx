import { useMemo, useState } from 'react'
import {
  availableMonths,
  buildFinancialYear,
  buildMonth,
  fetchOpenPositions,
  fetchSpotMeta,
  fetchUserFills,
  fetchUserFunding,
  fundingByDay,
  groupFills,
} from './lib/hyperliquid'
import type { FundingEntry, OpenPositions, RoundTrip } from './lib/hyperliquid'
import { loadMeta, loadNotes, persistMeta, persistNotes } from './lib/notes'
import type { MetaMap, NoteMap, TradeMeta } from './lib/notes'
import { StatsPanel } from './components/StatsPanel'
import { PositionsPanel } from './components/PositionsPanel'
import { RiskPanel } from './components/RiskPanel'
import { loadRiskConfig, saveRiskConfig } from './lib/risk'
import type { RiskConfig } from './lib/risk'
import { DEMO_FILL_COUNT, DEMO_WALLET, demoTags, demoTrips } from './lib/demo'
import { ConnectGate } from './components/ConnectGate'
import { LeftStats } from './components/LeftStats'
import { CalendarGrid } from './components/CalendarGrid'
import { DetailPanel } from './components/DetailPanel'

// Calendar days + trade times are bucketed in NZ time (handles NZDT/NZST);
// trading sessions are still classified in ET inside the data layer.
const TZ = 'Pacific/Auckland'

const stepMonth = (key: string, delta: number): string => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

interface Session {
  wallet: string
  trips: RoundTrip[]
  funding: FundingEntry[]
  fundByDay: Record<string, number>
  positions: OpenPositions | null
  fillCount: number
  syncedAt: number
  isDemo: boolean
  tags: Record<string, string>
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [notes, setNotes] = useState<NoteMap>({})
  const [meta, setMeta] = useState<MetaMap>({})
  const [monthKey, setMonthKey] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [showStats, setShowStats] = useState(false)
  const [showPositions, setShowPositions] = useState(false)
  const [showRisk, setShowRisk] = useState(false)
  const [riskConfig, setRiskConfig] = useState<RiskConfig>(() => loadRiskConfig())
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadWallet = async (wallet: string): Promise<Session> => {
    const w = wallet.trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(w)) {
      throw new Error('That does not look like a wallet address (expected 0x + 40 hex characters).')
    }
    const [fills, spotNames, funding, positions] = await Promise.all([
      fetchUserFills(w),
      fetchSpotMeta(),
      fetchUserFunding(w),
      fetchOpenPositions(w).catch(() => null), // non-fatal: journal still loads
    ])
    if (!fills.length) {
      throw new Error(
        'No fills found for this address. Make sure it is your MAIN account address — agent/API wallets return empty results.',
      )
    }
    const trips = groupFills(fills, TZ, spotNames)
    if (!trips.length) {
      throw new Error('Fills were found, but no completed round-trip trades yet.')
    }
    return {
      wallet: w,
      trips,
      funding,
      fundByDay: fundingByDay(funding, TZ),
      positions,
      fillCount: fills.length,
      syncedAt: Date.now(),
      isDemo: false,
      tags: {},
    }
  }

  const connect = async (wallet: string) => {
    setError(null)
    setLoading(true)
    try {
      const s = await loadWallet(wallet)
      setSession(s)
      setNotes(loadNotes(s.wallet))
      setMeta(loadMeta(s.wallet))
      const months = availableMonths(s.trips, s.funding, TZ)
      setMonthKey(months[months.length - 1])
      setSelected(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const demo = () => {
    setError(null)
    setSession({
      wallet: DEMO_WALLET,
      trips: demoTrips(),
      funding: [],
      fundByDay: {},
      positions: null,
      fillCount: DEMO_FILL_COUNT,
      syncedAt: Date.now(),
      isDemo: true,
      tags: demoTags(),
    })
    setNotes(loadNotes(DEMO_WALLET))
    setMeta(loadMeta(DEMO_WALLET))
    setMonthKey('2026-02')
    setSelected(null)
  }

  const saveNote = (key: string, text: string) => {
    if (!session) return
    setNotes((prev) => {
      const next = { ...prev }
      if (text.trim()) next[key] = text
      else delete next[key]
      persistNotes(session.wallet, next)
      return next
    })
  }

  const saveMeta = (key: string, patch: Partial<TradeMeta>) => {
    if (!session) return
    setMeta((prev) => {
      const merged = { ...prev[key], ...patch }
      // drop empty fields so an all-empty entry doesn't linger
      const cleaned: TradeMeta = {}
      if (merged.grade) cleaned.grade = merged.grade
      if (merged.followedPlan !== undefined) cleaned.followedPlan = merged.followedPlan
      if (merged.setup && merged.setup.trim()) cleaned.setup = merged.setup.trim()
      const next = { ...prev }
      if (Object.keys(cleaned).length) next[key] = cleaned
      else delete next[key]
      persistMeta(session.wallet, next)
      return next
    })
  }

  const refresh = async () => {
    if (!session || session.isDemo || refreshing) return
    setRefreshing(true)
    try {
      const s = await loadWallet(session.wallet)
      setSession(s)
      // keep the current month if it still has activity, else jump to latest
      const months = availableMonths(s.trips, s.funding, TZ)
      if (!months.includes(monthKey)) setMonthKey(months[months.length - 1])
    } catch {
      // keep showing the last good data on a failed refresh
    } finally {
      setRefreshing(false)
    }
  }

  const disconnect = () => {
    setSession(null)
    setSelected(null)
    setError(null)
  }

  const saveRisk = (cfg: RiskConfig) => {
    setRiskConfig(cfg)
    saveRiskConfig(cfg)
  }

  const journal = useMemo(
    () =>
      session && monthKey
        ? buildMonth(session.trips, monthKey, {
            wallet: session.wallet,
            timezone: TZ,
            tags: session.tags,
            funding: session.fundByDay,
          })
        : null,
    [session, monthKey],
  )

  const fySummary = useMemo(
    () =>
      session && monthKey
        ? buildFinancialYear(session.trips, monthKey, { timezone: TZ, funding: session.fundByDay })
        : null,
    [session, monthKey],
  )

  const months = useMemo(
    () => (session ? availableMonths(session.trips, session.funding, TZ) : []),
    [session],
  )
  const canPrev = months.length > 0 && monthKey > months[0]
  const canNext = months.length > 0 && monthKey < months[months.length - 1]

  const goMonth = (delta: number) => {
    setMonthKey((k) => stepMonth(k, delta))
    setSelected(null)
  }

  if (!session || !journal) {
    return <ConnectGate loading={loading} error={error} onConnect={connect} onDemo={demo} />
  }

  const selectedDay = selected != null ? journal.days.find((d) => d.dayNum === selected) : undefined

  return (
    <div className="app">
      <LeftStats
        journal={journal}
        fySummary={fySummary}
        positions={session.positions}
        riskConfig={riskConfig}
        fillCount={session.fillCount}
        syncedAt={session.syncedAt}
        refreshing={refreshing}
        onChangeWallet={disconnect}
        onRefresh={refresh}
        onOpenRisk={() => setShowRisk(true)}
      />
      <CalendarGrid
        journal={journal}
        selected={selected}
        onSelect={setSelected}
        onPrevMonth={() => goMonth(-1)}
        onNextMonth={() => goMonth(1)}
        canPrev={canPrev}
        canNext={canNext}
        onOpenStats={() => setShowStats(true)}
        onOpenPositions={() => setShowPositions(true)}
        onOpenRisk={() => setShowRisk(true)}
        positionCount={
          session.positions ? session.positions.perps.length + session.positions.spot.length : null
        }
      />
      {selectedDay && (
        <DetailPanel
          day={selectedDay}
          notes={notes}
          meta={meta}
          onSaveNote={saveNote}
          onSaveMeta={saveMeta}
          onClose={() => setSelected(null)}
        />
      )}
      {showStats && (
        <StatsPanel trips={session.trips} meta={meta} onClose={() => setShowStats(false)} />
      )}
      {showPositions && session.positions && (
        <PositionsPanel
          positions={session.positions}
          syncedAt={session.syncedAt}
          onClose={() => setShowPositions(false)}
        />
      )}
      {showRisk && (
        <RiskPanel
          config={riskConfig}
          positions={session.positions}
          onChange={saveRisk}
          onClose={() => setShowRisk(false)}
        />
      )}
    </div>
  )
}
