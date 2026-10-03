// Needs you — a card leaves the moment it is done (Ryan, 2026-10-02).
//
// The list is the SERVER's answer (lib/activity/needsYou.ts + lib/crews/needs.ts on the web side),
// and it stays the server's answer: done cards are REMOVED from the held list, not hidden behind an
// overlay (see project_rn_live_match_cards — an overlay shadows the fresher fetch that follows it).
//
// The one thing this adds is a guard against the obvious race: a fetch that STARTED before a card
// was settled can come back still holding it. Each settled id carries the moment it left; a fetch
// that started earlier than that can't bring it back, and once a fetch that started later has
// landed, the server is authoritative again and the mark is dropped.
//
// PURE — tested in __tests__/needsYouState.test.ts.

import type { NeedsYouItem } from './api';

/** Soonest deadline first; cards with no deadline after every card with one. Mirrors the server. */
export function sortNeeds(items: NeedsYouItem[]): NeedsYouItem[] {
  return [...items].sort((a, b) => {
    if (a.deadline_at === b.deadline_at) return 0;
    if (a.deadline_at === null) return 1;
    if (b.deadline_at === null) return -1;
    return a.deadline_at < b.deadline_at ? -1 : 1;
  });
}

/** Id → when it was settled here (ms). */
export type Settled = Map<string, number>;

/** Take the matching cards out now. Returns what's left, what left, and the updated marks. */
export function settle(
  current: NeedsYouItem[],
  match: (n: NeedsYouItem) => boolean,
  settled: Settled,
  now: number,
): { needs: NeedsYouItem[]; removed: NeedsYouItem[]; settled: Settled } {
  const removed = current.filter(match);
  if (removed.length === 0) return { needs: current, removed, settled };
  const next = new Map(settled);
  for (const n of removed) next.set(n.id, now);
  const gone = new Set(removed.map((n) => n.id));
  return { needs: current.filter((n) => !gone.has(n.id)), removed, settled: next };
}

/** Put cards back — the action behind them failed. Their marks go too. */
export function restore(
  current: NeedsYouItem[],
  items: NeedsYouItem[],
  settled: Settled,
): { needs: NeedsYouItem[]; settled: Settled } {
  if (items.length === 0) return { needs: current, settled };
  const back = new Set(items.map((n) => n.id));
  const next = new Map(settled);
  for (const id of back) next.delete(id);
  return { needs: sortNeeds([...current.filter((n) => !back.has(n.id)), ...items]), settled: next };
}

/**
 * A fetch's answer. Anything settled AFTER the fetch started stays gone; every mark the fetch
 * postdates is dropped, because its answer already reflects that action.
 */
export function applyFetched(
  fetched: NeedsYouItem[],
  settled: Settled,
  fetchStartedAt: number,
): { needs: NeedsYouItem[]; settled: Settled } {
  const next = new Map<string, number>();
  for (const [id, at] of settled) if (at > fetchStartedAt) next.set(id, at);
  return { needs: fetched.filter((n) => !next.has(n.id)), settled: next };
}
