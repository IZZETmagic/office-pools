// =============================================================
// READING A SEASON — the plain query, with no opinion about caching
// =============================================================
// Split out of `season.ts` on 2026-09-02, for two reasons that turned out to be
// the same reason.
//
// 1. `season.ts` carries `import 'server-only'`, because it needs `next/cache`.
//    That marker throws under `tsx` and `vitest` as well as in the browser, so a
//    verification script could not exercise the real reader at all.
//
// 2. More importantly, the three reads had ended up written TWICE — once here
//    and once inline in `readLeaguePoolView`'s uncached branch. Two copies of
//    the same query is two things to keep in step, and this codebase has a
//    written record of what that costs (the reveal rule lived in three places;
//    103 records the bill).
//
// So: this module is the ONE copy of the query. It takes a client rather than
// making one, holds no server-only import, and can therefore be reached from
// anywhere — the cached path, the uncached path, a script, a test.
//
// ⚠ Caching lives in `season.ts` and nowhere else. Adding `next/cache` here
// would put `revalidateTag` back in the client bundle through `read.ts`, which
// is the build failure this arrangement exists to prevent.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MatchweekRow, LeagueSeasonView } from './read'

export type SeasonClubRow = {
  club_id: string
  name: string
  short_name: string
  abbreviation: string
  crest_url: string | null
}

export type SeasonFixtureRow = {
  fixture_id: string
  matchweek_id: string
  fixture_number: number
  home_club_id: string
  away_club_id: string
  kickoff_at: string
  venue: string | null
  status: string
  /**
   * The feed's own words for an abnormal state — `postponed`, `cancelled`,
   * `suspended`, `abandoned`. Read because `getMatchStatusBadge` keys on it on
   * BOTH surfaces, and without it a postponed fixture renders its original
   * kickoff time as though the game were still on.
   */
  status_detail: string | null
  /** Set when the kickoff has MOVED (L11). The badge reads it as "Delayed". */
  original_kickoff_at: string | null
  home_goals: number | null
  away_goals: number | null
  is_completed: boolean
  live_minute: number | null
  live_period: string | null
  live_added: number | null
}

/** Re-exported so callers have one place to import it from. Declared in
 *  `read.ts` because that file is the shared one — see the header. */
export type { LeagueSeasonView }

/**
 * The three reads, unchanged in what they select — only in who runs them and
 * how often.
 *
 * ⚠ `throwOnError` is not optional here. `unstable_cache` caches whatever the
 * function returns, so swallowing a PostgREST error and returning `[]` would
 * cache an empty season for the TTL and render every pool on it as having no
 * fixtures. A thrown error is not cached; the next request simply retries. Same
 * reasoning as `getPoolDataCached`'s `throwOnFetchError`.
 */
export async function readLeagueSeasonUncached(
  admin: SupabaseClient,
  seasonId: string,
): Promise<LeagueSeasonView> {
  const { data: clubs, error: clubErr } = await admin
    .from('league_clubs')
    .select('club_id, name, short_name, abbreviation, crest_url')
    .eq('season_id', seasonId)
    .order('name', { ascending: true })
    .range(0, 999)
  if (clubErr) throw new Error(`league_clubs: ${clubErr.message}`)

  const { data: mws, error: mwErr } = await admin
    .from('league_matchweeks')
    .select('matchweek_id, matchweek_number, fixture_count, completed_fixture_count, lock_at, first_kickoff_at, ranks_snapshot_at')
    .eq('season_id', seasonId)
    .order('matchweek_number', { ascending: true })
    .range(0, 999)
  if (mwErr) throw new Error(`league_matchweeks: ${mwErr.message}`)

  // Paged, and it has to be: 380 fixtures is inside PostgREST's 1,000-row cap
  // today, and a two-season-per-row competition or a bigger league is not.
  const fixtures: SeasonFixtureRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('league_fixtures')
      .select('fixture_id, matchweek_id, fixture_number, home_club_id, away_club_id, kickoff_at, venue, status, status_detail, original_kickoff_at, home_goals, away_goals, is_completed, live_minute, live_period, live_added')
      .eq('season_id', seasonId)
      .order('fixture_number', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(`league_fixtures: ${error.message}`)
    const page = (data ?? []) as unknown as SeasonFixtureRow[]
    fixtures.push(...page)
    if (page.length < 1000) break
  }

  return {
    clubs: (clubs ?? []) as unknown as SeasonClubRow[],
    matchweeks: (mws ?? []) as unknown as MatchweekRow[],
    fixtures,
  }
}
