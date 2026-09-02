// =============================================================
// THE SEASON — the one genuinely shared object in a league pool
// =============================================================
// Decision 12, 2026-09-02: *one read, two surfaces.* This is its foundation.
//
// `readLeaguePoolView` used to make three reads of its own — clubs, matchweeks,
// and every fixture of the season, paged — **on every league pool page load, per
// viewer, through RLS, outside any cache, whichever tab was open.** Measured in
// `drafts/2026-08-31_league_read_path_and_cost_review.md`:
//
//   league_fixtures, whole season   175 kB      one matchweek is 4.6 kB
//   league_matchweeks                 9.5 kB
//   league_standings                  8.3 kB
//   league_clubs                      3.9 kB
//
// ## ⚠ WHY THIS IS CACHEABLE WHEN THE POOL PAYLOAD IS NOT
//
// The 2026-07-26 caching decision — *CDN is never for pool detail; the median
// pool has one member, so there is nobody to share a cached object with* — is
// still right, and this does not contradict it. **It was a conclusion about a
// per-POOL object.** This is a per-SEASON one:
//
//   * identical for every viewer and every pool playing that season,
//   * ~197 kB all in, comfortably inside a shared cache,
//   * written by exactly one thing, `league_apply_fixture_sync`.
//
// Verified before building it, not assumed: `league_clubs`, `league_matchweeks`
// and `league_fixtures` all carry a single RLS policy of `USING (true)` —
// viewable by everyone, no per-viewer variation. That is what makes one cached
// copy correct for every reader, and it is also why the admin client is used
// below rather than the caller's: the rows are the same either way, so all the
// per-viewer RLS evaluation over 380 fixtures ever bought was cost.
//
// ⚠ IF THAT EVER STOPS BEING TRUE — if one of those tables gains a policy that
// filters by user — this cache becomes a leak: one viewer's copy would be
// served to another. That is a property of the DATABASE, not of this file, so
// it cannot be a unit test; `scripts/verify-league-season-cache.ts` asserts it
// against production and is the thing to run before trusting this.
//
// ## ⚠ INVALIDATION HANGS OFF THE SYNC'S OWN `changed` ARRAY, NOT A TTL
//
// A TTL alone is the wrong tool here and the reason is a product guarantee, not
// a preference: *the leaderboard must never lag* — live standings are the thing
// the swing-is-the-banter principle rests on. A TTL long enough to be worth
// having would serve a 0–0 through a goal.
//
// So `league_apply_fixture_sync` already returns exactly which fixtures moved,
// and the sync calls `invalidateLeagueSeason` when that array is non-empty. The
// short TTL below is a **backstop for a missed invalidation**, not the mechanism
// — the same posture `invalidatePoolCache` takes in `lib/poolData.ts`.
//
// ⚠ AND THE LIVE HALF SHOULD NOT DEPEND ON THIS AT ALL. Migration 125 already
// carries score, status and minute to open pages over the broadcast, applied
// straight from the payload with no fetch. This cache holds what a page needs
// on LOAD; the broadcast owns what moves while it is open. Caching what moves is
// how you serve a 0–0 through a goal.
// =============================================================

import { unstable_cache, revalidateTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import type { MatchweekRow } from './read'

/**
 * ⚠ Short, and a backstop rather than the mechanism. 30 seconds is the recorded
 * staleness budget for cached reads (*Decisions settled 2026-07-26
 * (infrastructure)* #1), chosen against the same live-scores guarantee. If an
 * invalidation is ever missed, this is the longest anything can be wrong.
 */
export const LEAGUE_SEASON_CACHE_TTL_SECONDS = 30

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
  home_goals: number | null
  away_goals: number | null
  is_completed: boolean
  live_minute: number | null
  live_period: string | null
  live_added: number | null
}

/** Everything about a season that is the same for every viewer. */
export type LeagueSeasonView = {
  clubs: SeasonClubRow[]
  matchweeks: MatchweekRow[]
  fixtures: SeasonFixtureRow[]
}

/**
 * One tag per season, so every pool playing it shares one cache entry and one
 * invalidation. Exported because the sync needs the same string, and two places
 * building it by hand is how a cache stops being invalidated.
 */
export function leagueSeasonCacheTag(seasonId: string): string {
  return `league-season-${seasonId}`
}

/**
 * Called from the fixture sync when `league_apply_fixture_sync` reports that
 * something actually moved.
 *
 * Wrapped so it can never affect ingest, exactly as `invalidatePoolCache` is:
 * `revalidateTag` only runs in a request/route context, and losing a fixture
 * write to protect a cache would be the wrong way round. If this no-ops, the
 * TTL is the backstop.
 */
export function invalidateLeagueSeason(seasonId: string): void {
  try {
    // `{ expire: 0 }` — expire the tag immediately (Next 16). The documented
    // path for a background trigger that needs the data fresh now, and the
    // replacement for the deprecated single-argument form.
    revalidateTag(leagueSeasonCacheTag(seasonId), { expire: 0 })
  } catch (err) {
    console.warn(`[league/season] invalidate skipped for ${seasonId}:`, (err as Error)?.message)
  }
}

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
      .select('fixture_id, matchweek_id, fixture_number, home_club_id, away_club_id, kickoff_at, venue, status, home_goals, away_goals, is_completed, live_minute, live_period, live_added')
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

/**
 * ⚠ `unstable_cache` NEEDS A REQUEST CONTEXT, and this function has callers that
 * do not have one.
 *
 * `readLeaguePoolView` is called from `scripts/verify-league-pool-member-view.ts`
 * as well as from the page and the API route, and a script runs outside Next
 * entirely. There it throws:
 *
 *     Invariant: incrementalCache missing in unstable_cache
 *
 * which is not a data problem and must not be reported as one — it means "there
 * is no cache here", and the honest answer to that is to read directly. Found by
 * running the script rather than by reasoning about it: the first version of
 * this file broke all 36 of its checks.
 *
 * Same posture as `invalidatePoolCache` in `lib/poolData.ts`, whose comment
 * records the mirror image of this — *"revalidateTag only runs in a
 * request/route context; if the sweep ever runs outside one, this no-ops."*
 *
 * ⚠ THE MATCH IS DELIBERATELY NARROW. Only the missing-cache invariant falls
 * through; a PostgREST failure still throws, because the whole point of
 * throwing is that an empty season is never cached or returned as real.
 */
function isCacheUnavailable(err: unknown): boolean {
  const m = (err as Error)?.message ?? ''
  return m.includes('incrementalCache') || m.includes('Invariant: static generation store')
}

/**
 * The cached read. Built per-call so the key AND the tag are scoped to this
 * season — `unstable_cache`'s `options.tags` is static, so the id is baked into
 * both here, the same shape `getPoolDataCached` uses.
 */
export async function getLeagueSeasonCached(seasonId: string): Promise<LeagueSeasonView> {
  try {
    return await unstable_cache(
      () => readLeagueSeasonUncached(createAdminClient(), seasonId),
      ['league-season-view', seasonId],
      { tags: [leagueSeasonCacheTag(seasonId)], revalidate: LEAGUE_SEASON_CACHE_TTL_SECONDS },
    )()
  } catch (err) {
    if (isCacheUnavailable(err)) {
      return readLeagueSeasonUncached(createAdminClient(), seasonId)
    }
    throw err
  }
}
