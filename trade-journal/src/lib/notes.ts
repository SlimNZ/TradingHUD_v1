/* Local, per-wallet journal notes. Stored in localStorage (no backend), keyed
 * by a stable trade/day identity so notes survive re-fetches and reloads.
 * Notes are keyed to the wallet, so switching wallets shows the right set. */
import type { Trade } from './hyperliquid'

const storeKey = (wallet: string) => `tj:notes:${wallet.toLowerCase()}`

export type NoteMap = Record<string, string>

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
