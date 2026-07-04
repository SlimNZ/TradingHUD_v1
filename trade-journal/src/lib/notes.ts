/* Local, per-wallet journal notes. Stored in localStorage (no backend), keyed
 * by a stable trade/day identity so notes survive re-fetches and reloads.
 * Notes are keyed to the wallet, so switching wallets shows the right set. */
import type { Trade } from './hyperliquid'

const storeKey = (wallet: string) => `tj:notes:${wallet.toLowerCase()}`
const metaStoreKey = (wallet: string) => `tj:meta:${wallet.toLowerCase()}`

export type NoteMap = Record<string, string>

/** Structured per-trade review fields (all optional). */
export type Grade = 'A' | 'B' | 'C'
export interface TradeMeta {
  grade?: Grade
  followedPlan?: boolean
  setup?: string
}
export type MetaMap = Record<string, TradeMeta>

/** Common setup labels offered as suggestions (free text still allowed). */
export const SETUP_SUGGESTIONS = [
  'breakout',
  'reversal',
  'trend pullback',
  'range',
  'scalp',
  'news',
  'A+ setup',
]

export function loadNotes(wallet: string): NoteMap {
  try {
    return JSON.parse(localStorage.getItem(storeKey(wallet)) || '{}')
  } catch {
    return {}
  }
}

export function persistNotes(wallet: string, notes: NoteMap): void {
  try {
    localStorage.setItem(storeKey(wallet), JSON.stringify(notes))
  } catch {
    // storage full / disabled — notes stay in-memory for the session
  }
}

export function loadMeta(wallet: string): MetaMap {
  try {
    return JSON.parse(localStorage.getItem(metaStoreKey(wallet)) || '{}')
  } catch {
    return {}
  }
}

export function persistMeta(wallet: string, meta: MetaMap): void {
  try {
    localStorage.setItem(metaStoreKey(wallet), JSON.stringify(meta))
  } catch {
    // storage full / disabled — meta stays in-memory for the session
  }
}

/**
 * Stable identity for a trade's note. Uses day + time + asset + direction,
 * which is deterministic across re-fetches for a completed trade. Two trades
 * with the same asset, direction, and minute on one day would share a note
 * (rare); good enough for a personal journal.
 */
export function tradeNoteKey(iso: string, t: Trade): string {
  return `t|${iso}|${t.time}|${t.asset}|${t.dir}`
}

/** Day-level review note key. */
export function dayNoteKey(iso: string): string {
  return `d|${iso}`
}
