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
    /**
     * What a fixture pays. Read from the same `pool_settings` columns the
     * engine COALESCEs against, so a screen cannot quote scoring nobody uses.
     *
     * ⚠⚠ AT RESULTS DEPTH A CORRECT TAP COSTS `exact`, NOT `result`. Migration
     * 066 charges a correct outcome at the pool's TOP price, because getting
     * the outcome right is the most that can be achieved there. The World Cup
     * screen printed `result` next to it and told members their pick was worth
     * half what it pays. Read the depth before reading these.
     */
    prices: { exact: number; goalDifference: number; result: number }
  }
  season: {
    teams: LeagueTeam[]
    matches: LeagueMatch[]
    /**
     * Every matchweek's clock. ⚠ `lock_at` is when PICKS CLOSE, an hour before
     * `first_kickoff_at` (migration 101) — never derive one from the other.
     *
     * ⚠ A matchweek whose `lock_at` has PASSED is one whose picks are revealed
     * pool-wide. That is the only test: the server's own reveal gate reads the
     * clock and nothing else, because a matchweek that has not opened yet also
     * carries the state string 'locked'.
     */
    matchweeks: LeagueMatchweek[]
    matchweekCount: number
    openMatchweekNumber: number | null
    inPlayMatchweekNumber: number | null
    sealedMatchweekNumber: number | null
    sealedOpensAfterMatchweek: number | null
  }
  you: {
    entries: {
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
      /** Scores depth. Empty at Results depth, where `outcomes` carries the pick. */
      predictions: LeaguePrediction[]
      /** fixture_id → 'home' | 'draw' | 'away'. An object, not a Map — JSON. */
      outcomes: Record<string, 'home' | 'draw' | 'away'>
      submissions: unknown[]
    }[]
  }
}

/**
 * A club, as the season contract sends it.
 *
 * ⚠⚠ THE FIELD NAMES ARE THE WORLD CUP'S AND THE MAPPING IS POSITIONAL. A league
 * fixture is drawn by components written for national teams, so `fixtureToMatch`
 * files the club NAME under `country_name`, its abbreviation under
 * `country_code` and its CREST under `flag_url`. Renaming them here would not
 * fail — it would silently render "TBD" with no crest, because the adapter
 * picks fields explicitly and anything it does not name arrives `undefined`.
 */
export type LeagueTeam = {
  team_id: string
  country_name: string
  country_code: string | null
  flag_url: string | null
  short_name?: string | null
}

/** One fixture. Same caveat as `LeagueTeam` — these are World Cup field names. */
export type LeagueMatch = {
  /** ⚠ The FIXTURE id. `league_predictions.fixture_id` joins on this. */
  match_id: string
  match_number: number
  /**
   * ⚠ THE MATCHWEEK NUMBER, under the World Cup's name for it. This is what
   * every matchweek filter on this screen keys on — there is no
   * `matchweek_number` field on a match.
   */
  round_number: number
  match_date: string | null
  status: string | null
  status_detail: string | null
  original_match_date: string | null
  home_team_id: string
  away_team_id: string
  home_score_ft: number | null
  away_score_ft: number | null
  is_completed: boolean
  home_team: LeagueTeam | null
  away_team: LeagueTeam | null
}

/** One matchweek's clock. */
export type LeagueMatchweek = {
  number: number
  /** When picks close. NULL for a matchweek with no fixtures scheduled yet. */
  lock_at: string | null
  first_kickoff_at: string | null
}

/**
 * One Scores-depth pick.
 *
 * ⚠⚠ THE KEY IS `match_id`, NOT `fixture_id`, AND THAT COST A WHOLE SCREEN.
 * The row in the database is keyed `fixture_id`, but `readLeaguePredictions`
 * maps it to `match_id` on the way out so a league pick can travel through the
 * World Cup's `ExistingPrediction` type. This copy said `fixture_id` for one
 * commit, so every lookup was `scores[undefined]` — no error, no empty array to
 * notice, just a picker that opened blank over ten saved scorelines.
 *
 * ⚠ Results-depth picks do NOT come through here. They arrive in `outcomes`,
 * keyed by fixture id, which is why Results looked fine while Scores did not —
 * the two halves of the same payload disagree about the name of one column.
 */
export type LeaguePrediction = {
  /** The FIXTURE this pick is for. Named `match_id` by the contract — see above. */
  match_id: string
  predicted_home_score: number | null
  predicted_away_score: number | null
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

// =============================================================
// EVERYBODY'S PICKS — and why this calls a route it does not own
// =============================================================
// `GET /api/pools/:id/bulk` is the World Cup's bulk read, and it already grew a
// league arm on the web: `readAllLeaguePredictions` for the rows, then
// `computeReveal` + `gatePoolPredictions` to strip everyone else's picks for
// any matchweek that has not locked.
//
// ⚠⚠ THAT GATE IS THE WHOLE FEATURE, AND IT IS WHY MOBILE CALLS THIS ROUTE
// RATHER THAN GETTING ITS OWN. The rule is: you may never see a pick for a week
// you can still change yourself. Building a second, mobile-shaped endpoint means
// a second implementation of that rule, and the LMS pass wrote the lesson down
// after re-implementing one policy in TypeScript because an admin client walked
// past it: *"One re-implementation of a policy is a liability; two is a matter
// of time."* The gate runs SERVER-SIDE and strips rows before they cross the
// wire — filtering here would ship every unlocked pick and merely hide it.
//
// ⚠ It also gates `outcomes` separately from `predictions`, which matters: a
// Results-depth pool stores a TAP, not a scoreline, so it would have leaked
// through a gate that only knew about scores.
//
// ## ⚠ It is fetched LAZILY, and that is a size decision
//
// The payload is every revealed pick in the pool — (entries × locked fixtures).
// Two locked matchweeks is ~200 rows today; a ten-person pool in May is ~3,800,
// plus `matchScores` that this screen does not use. So it is enabled only when a
// LOCKED matchweek is actually being looked at, which is never the common case
// of picking the open week. If it outgrows that, the fix is a matchweek
// parameter on the route — NOT a second reveal gate here.
// =============================================================

export type PoolBulkPayload = {
  predictions: {
    entry_id: string
    /** ⚠ The FIXTURE id for a league pool — `match_id` is the World Cup's name. */
    match_id: string
    predicted_home_score: number
    predicted_away_score: number
  }[]
  /** Results depth only; absent entirely for a Scores pool. */
  outcomes?: { entry_id: string; match_id: string; outcome: 'home' | 'draw' | 'away' }[]
}

export function leaguePicksQueryKey(poolId: string) {
  return ['league-pool-picks', poolId] as const
}

/**
 * Every pick in the pool that the viewer is ALLOWED to see.
 *
 * @param enabled pass `false` while no locked matchweek is on screen — see the
 *                size note above. It is not an optimisation, it is the reason
 *                this is safe to call from a phone at all.
 */
export function useLeaguePoolPicks(poolId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: leaguePicksQueryKey(poolId ?? ''),
    queryFn: () => apiFetch<PoolBulkPayload>(`/api/pools/${poolId}/bulk`),
    enabled: Boolean(poolId) && enabled,
  })
}
