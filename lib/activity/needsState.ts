// Needs you, on the web — a card leaves the moment it is done (Ryan, 2026-10-02).
//
// The web's copy of mobile/lib/needsYouState.ts (the app is left as it is). The list is the
// SERVER's answer, and stays it: a done card is REMOVED from the held list, never hidden behind an
// overlay that would shadow the fresher fetch after it. The one thing added is a guard against the
// race: a fetch that STARTED before a card was settled can come back still holding it. Each settled
// id carries the moment it left; a fetch that started earlier can't bring it back, and once a fetch
// that started later has landed, the server is authoritative again and the mark is dropped.
//
// PURE — tested in __tests__/needsState.test.ts.

import { sortNeeds, type NeedItem } from './needsYou'

/** Id → when it was settled here (ms). */
export type Settled = Map<string, number>

/** Take the matching cards out now. Returns what's left, what left, and the updated marks. */
export function settle(
  current: NeedItem[],
  match: (n: NeedItem) => boolean,
  settled: Settled,
  now: number,
): { needs: NeedItem[]; removed: NeedItem[]; settled: Settled } {
  const removed = current.filter(match)
  if (removed.length === 0) return { needs: current, removed, settled }
  const next = new Map(settled)
  for (const n of removed) next.set(n.id, now)
  const gone = new Set(removed.map((n) => n.id))
  return { needs: current.filter((n) => !gone.has(n.id)), removed, settled: next }
}

/** Put cards back — the action behind them failed. Their marks go too. */
export function restore(
  current: NeedItem[],
  items: NeedItem[],
  settled: Settled,
): { needs: NeedItem[]; settled: Settled } {
  if (items.length === 0) return { needs: current, settled }
  const back = new Set(items.map((n) => n.id))
  const next = new Map(settled)
  for (const id of back) next.delete(id)
  return { needs: sortNeeds([...current.filter((n) => !back.has(n.id)), ...items]), settled: next }
}

/**
 * A fetch's answer. Anything settled AFTER the fetch started stays gone; every mark the fetch
 * postdates is dropped, because its answer already reflects that action.
 */
export function applyFetched(
  fetched: NeedItem[],
  settled: Settled,
  fetchStartedAt: number,
): { needs: NeedItem[]; settled: Settled } {
  const next = new Map<string, number>()
  for (const [id, at] of settled) if (at > fetchStartedAt) next.set(id, at)
  return { needs: fetched.filter((n) => !next.has(n.id)), settled: next }
}
