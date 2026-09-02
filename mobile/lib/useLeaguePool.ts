// =============================================================
// THE FIRST HOOK ON THE CONTRACT
// =============================================================
// `GET /api/pools/:id/league` (Decision 12), read through React Query.
//
// ## Why this is the shape every league hook should copy
//
// Mobile's 34 existing hooks are hand-rolled `useState`/`useEffect`, and they
// read tables directly — ~110 `.from()` calls. **That pattern cannot work for a
// league at all**, and the reason is worth stating once here so nobody
// rediscovers it: migration 050 closed four tables to clients on purpose
// (`league_match_scores`, `league_entry_totals`, `league_fixture_state`,
// `league_score_events`) — RLS on, zero policies.
//
// RLS with no policy is not a 403. PostgREST returns `[]` with `error: null`,
// so the read "succeeds", the map is empty, and the screen renders a confident
// zero. That bug was found FOUR TIMES IN ONE AFTERNOON on 2026-08-30 — on the
// web, where the pattern is better understood than it would be in a new RN
// file. `denyAllTables.guard.test.ts` exists because of it.
//
// So: league data comes over the contract, never from a table. There is nothing
// to copy from the World Cup hooks here.
//
// ## ⚠ IT DOES NOT POLL, AND MUST NOT
//
// The payload is the season — 165.7 kB on the Premier League, measured. It is
// what a screen needs when it OPENS. Live scores arrive on the
// `pool:{id}:leaderboard` broadcast and are applied from the payload with no
// fetch, exactly as web does it (migration 125).
//
// A `refetchInterval` here would cost 165 kB per tick per viewer and would be
// the single most expensive line in the mobile app. If a number needs to move
// while the screen is open, it belongs in the broadcast — not in a timer.
// =============================================================

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './api'

/** ⚠ Mirrors the route's response. Widening one without the other is how two
 *  surfaces start disagreeing — the route is the contract, this is the copy. */
export type LeaguePoolPayload = {
  pool: {
    pool_id: string
    pool_name: string
    league_mode: 'pickem' | 'showdown' | 'last_man_standing' | 'table' | null
    /**
     * ⚠ NULL IS NOT "RESULTS". A pool created before migration 077 carries NULL,
     * and the engine reads NULL as **Scores** — deliberately, byte for byte
     * (066). Three web copy sites once read it the other way and told members
     * they were playing one game while being scored at another. If this needs a
     * default, `depth === 'results'` is the polarity that agrees with the
     * engine; never `depth === 'scores'`.
     */
    league_depth: 'results' | 'scores' | null
    league_table_lock_at: string | null
  }
  season: {
    teams: unknown[]
    matches: unknown[]
    matchweekCount: number
    openMatchweekNumber: number | null
    inPlayMatchweekNumber: number | null
    sealedMatchweekNumber: number | null
    sealedOpensAfterMatchweek: number | null
  }
  you: {
    entries: Array<{
      entry_id: string
      entry_name: string
      /** The engine's STORED totals. Never recomputed on a client. */
      totals: {
        totalPoints: number
        rank: number | null
        duelPoints: number
        correct: number
        roundsWon: number
      } | null
      predictions: unknown[]
      /** fixture_id → 'home' | 'draw' | 'away'. An object, not a Map — JSON. */
      outcomes: Record<string, 'home' | 'draw' | 'away'>
      submissions: unknown[]
    }>
  }
}

export function leaguePoolQueryKey(poolId: string) {
  return ['league-pool', poolId] as const
}

export function useLeaguePool(poolId: string | null | undefined) {
  return useQuery({
    queryKey: leaguePoolQueryKey(poolId ?? ''),
    queryFn: () => apiFetch<LeaguePoolPayload>(`/api/pools/${poolId}/league`),
    enabled: Boolean(poolId),
    // ⚠ NO `refetchInterval`. See the header — the broadcast owns what moves.
    // The inherited 30s staleTime is what makes a tab switch free; it is not a
    // freshness mechanism for scores.
  })
}
