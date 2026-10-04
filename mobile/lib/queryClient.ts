// =============================================================
// THE MOBILE QUERY CACHE
// =============================================================
// Decided 2026-07-26 (*Decisions settled 2026-07-26 (infrastructure)* #2) and
// not started until now. Before this the app had **no client cache at all** —
// hand-rolled `useState`/`useEffect` in 34 hooks, with six surfaces refetching
// on `useFocusEffect`, so every tab switch re-ran a full load.
//
// What the dependency buys, and why each one matters here:
//
//   focus dedup        a tab switch stops re-running a load that just ran
//   TTL                a screen opened twice in ten seconds fetches once
//   background refetch stale data renders immediately, fresh data replaces it
//   request dedup      two components asking for the same thing make one call
//
// ⚠ IT IS PURE JS, so it reaches devices on an **OTA** — no store build. That
// matters for the sequencing: this can ship ahead of anything native.
//
// ## ⚠ THIS IS NOT A LICENCE TO POLL
//
// A cache makes a repeated fetch cheap, which is exactly how a codebase talks
// itself into fetching on a timer. The measured position is that reads are the
// bill — `SELECT predictions.*` alone was 111.3 DB-hours, 33% of all database
// time, and the top four statements were 76.4%.
//
// So the rule that came out of the World Cup still holds and this changes
// nothing about it: **live updates are pushed, not polled.** Scores arrive on
// the `pool:{id}:leaderboard` broadcast and are applied from the payload. This
// cache is for what a screen needs when it OPENS.
// =============================================================

import { AppState, type AppStateStatus } from 'react-native'
import { QueryClient, focusManager } from '@tanstack/react-query'

/**
 * ⚠ 30 seconds, and it is not a guess. It is the recorded staleness budget for
 * cached reads, chosen against the live-scores guarantee — the same number
 * `lib/league/season.ts` uses on the server. One budget, both tiers.
 */
export const MOBILE_STALE_TIME_MS = 30_000

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: MOBILE_STALE_TIME_MS,
        // Keep an unmounted screen's data around long enough that going
        // Pools → a pool → back is free. Longer than the stale time on
        // purpose: stale data still renders instantly while the refetch runs.
        gcTime: 5 * 60_000,
        // ⚠ FALSE. Remounting is not new information — it is navigation, and
        // this app navigates constantly. Focus (below) is the real signal.
        refetchOnMount: false,
        // ⚠ Retry ONCE. The default of three turns one bad network moment into
        // four requests per screen, which is the opposite of the point.
        retry: 1,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: { retry: 0 },
    },
  })
}

/**
 * The client this process is actually using.
 *
 * ⚠ A REGISTRY RATHER THAN A MODULE SINGLETON, on purpose. The client is created in
 * `app/_layout.tsx` through a `useState` lazy initialiser so a re-render cannot replace it, and
 * making it a module-level `const` instead would construct a cache at import time in every test
 * that touches this file. Teardown still needs to reach it, so the owner hands it over.
 */
let registered: QueryClient | null = null

/** Called once by the root layout, so {@link clearQueryCache} has something to empty. */
export function registerQueryClient(client: QueryClient): void {
  registered = client
}

/**
 * Drop every cached query. Called when the signed-in member changes — see `lib/sessionReset.ts`.
 *
 * ⚠⚠ `clear()`, NOT `invalidateQueries()`. Invalidating marks data stale but KEEPS it, so the
 * incoming member renders the outgoing member's pools, standings and names for as long as the
 * refetch takes. These keys are not all scoped by user id, so that data is not merely old — it is
 * someone else's.
 *
 * ⚠ A no-op before the root layout has mounted, which is the correct outcome: there is nothing
 * cached yet.
 */
export function clearQueryCache(): void {
  const client = registered
  if (!client) return
  // ⚠ CANCELLED BEFORE IT IS EMPTIED. Requests belonging to the outgoing
  // session are still in the air at this point — the same hole the avatar cache
  // had, where a response that left before the sign-out lands after it. It also
  // keeps a screen that is mid-unmount from firing a fresh 401 as the cache
  // empties under it.
  //
  // ⚠ Not awaited, and its rejection is swallowed: this is called from an
  // auth-state callback where a floating rejection has nowhere to go, and the
  // `clear()` below is what the correctness depends on.
  void client.cancelQueries().catch(() => {})
  client.clear()
}

/**
 * React Query's focus tracking is written for a browser's `window.focus`. In
 * React Native the equivalent is `AppState`, and without this wiring
 * `refetchOnWindowFocus` simply never fires — so a phone that has been in a
 * pocket for an hour would show hour-old data with no way to notice.
 *
 * ⚠ `active` ONLY. iOS reports `inactive` while the app-switcher is open or a
 * call banner is showing, and treating that as focus would refetch every time a
 * notification slid down.
 *
 * Returns the unsubscribe so a test — or a future root remount — can detach it.
 */
export function wireAppStateFocus(): () => void {
  const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active')
  })
  return () => sub.remove()
}
