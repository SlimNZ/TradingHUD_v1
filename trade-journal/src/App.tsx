import { useMemo, useState } from 'react'
import {
  availableMonths,
  buildFinancialYear,
  buildMonth,
  fetchSpotMeta,
  fetchUserFills,
  fetchUserFunding,
  fundingByDay,
  groupFills,
} from './lib/hyperliquid'
import type { FundingEntry, RoundTrip } from './lib/hyperliquid'
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
  fillCount: number
  syncedAt: number
  isDemo: boolean
  tags: Record<string, string>
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [monthKey, setMonthKey] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadWallet = async (wallet: string): Promise<Session> => {
    const w = wallet.trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(w)) {
      throw new Error('That does not look like a wallet address (expected 0x + 40 hex characters).')
    }
    const [fills, spotNames, funding] = await Promise.all([
      fetchUserFills(w),
      fetchSpotMeta(),
      fetchUserFunding(w),
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
      fillCount: DEMO_FILL_COUNT,
      syncedAt: Date.now(),
      isDemo: true,
      tags: demoTags(),
    })
    setMonthKey('2026-02')
    setSelected(null)
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
        fillCount={session.fillCount}
        syncedAt={session.syncedAt}
        refreshing={refreshing}
        onChangeWallet={disconnect}
        onRefresh={refresh}
      />
      <CalendarGrid
        journal={journal}
        selected={selected}
        onSelect={setSelected}
        onPrevMonth={() => goMonth(-1)}
        onNextMonth={() => goMonth(1)}
        canPrev={canPrev}
        canNext={canNext}
      />
      {selectedDay && <DetailPanel day={selectedDay} onClose={() => setSelected(null)} />}
    </div>
  )
}
