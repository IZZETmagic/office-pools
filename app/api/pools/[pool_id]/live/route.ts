import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import type { MatchScoreNarrow, EntryStatsData } from '@/app/pools/[pool_id]/types'
import { getScoringSource, readEntryScoring, readMatchScoresNarrow } from '@/lib/scoring/readSource'
import { readEntryStats } from '@/lib/poolData'

// =============================================================
// GET /api/pools/:pool_id/live
//
// The small, changing slice of a pool: leaderboard totals and ranks, plus the
// match scores for matches that have not finished yet.
//
// WHY THIS EXISTS
// PoolDetail is a client component, so everything getPoolData returns is
// serialised into the RSC flight response as props. A router.refresh() re-sends
// ALL of it — 3.8 MB on the largest pool — even though during a live match only
// one match's scores can have changed (192 of 13,385 rows there). Predictions
// cannot change at all: they are locked at kickoff by
// trg_enforce_prediction_before_kickoff, and page.tsx only ships revealed
// (= locked) picks to non-admins in the first place.
//
// So ~98.6% of a refresh is provably identical to what the client already holds.
// This endpoint returns just the rest, and the client merges it.
//
// Caching would not have fixed that: getPoolData is already cached, which saves
// the database read but still ships the full payload down the client leg on
// every refresh.
// =============================================================

export type LiveEntry = {
  entry_id: string
  match_points: number
  bonus_points: number
  point_adjustment: number
  scored_total_points: number
  current_rank: number | null
  previous_rank: number | null
}

export type PoolLiveResponse = {
  /**
   * Precomputed leaderboard stats for entries whose numbers can have moved.
   *
   * The leaderboard reads these from `entry_xp_state` instead of deriving them
   * in the browser, so a delta that carried only points would leave the form
   * dots, hit rate and streak frozen mid-match — the client no longer holds the
   * raw rows to re-derive them from. The scoring path rewrites this table on
   * every recalc, so re-reading it here keeps the whole row live.
   *
   * EMPTY between matchdays: with no live match nothing can have changed, and
   * this is polled every 30s per viewer. Only paid for when it can move.
   */
  stats: EntryStatsData[]
  /**
   * Completed-match count. The client holds scores for completed matches from
   * its initial load; if this disagrees with what it has, a match finished and
   * the immutable half is stale — the client falls back to router.refresh()
   * rather than trying to reconstruct the difference.
   */
  completed_matches: number
  entries: LiveEntry[]
  /** Full rows, not a narrowed shape — the client merges them into the array
   * it already holds, so they must be the same type. Bounded by live matches
   * × entries, so a handful of matches' worth. */
  scores: MatchScoreNarrow[]
  matches: Array<{
    match_id: string
    status: string
    home_score_ft: number | null
    away_score_ft: number | null
  }>
}

/**
 * The fixture rows this endpoint compares against what the client holds.
 *
 * ⚠ A LEAGUE POOL DOES NOT USE `matches`. Its `tournament_id` points at a
 * placeholder row carrying zero matches (see page.tsx, which reassigns
 * `matches` from `readLeaguePoolView`), so reading `matches` for a league pool
 * returned an empty array and therefore `completed_matches: 0` — for ever.
 * The client compares that against its own league fixtures in
 * `needsFullRefresh`, got `0 !== 30`, and fell back to a FULL router.refresh()
 * on every single poll: ~25-30 DB round trips per viewer every 30s during a
 * matchweek, plus a re-download of the multi-MB bulk payload for anyone not on
 * the Leaderboard. The delta endpoint was dead code for the entire league
 * product.
 *
 * The mapping below must stay identical to `fixtureToMatch` in
 * lib/league/read.ts — same id, same status field — because the client counts
 * `status === 'completed'` over rows that mapper produced. Comparing a
 * different field (e.g. `is_completed`) would reintroduce the mismatch the
 * moment the two disagree.
 */
async function readLiveMatchRows(
  admin: ReturnType<typeof createAdminClient>,
  pool: { tournament_id: string; league_season_id: string | null },
): Promise<PoolLiveResponse['matches']> {
  if (!pool.league_season_id) {
    const { data, error } = await admin
      .from('matches')
      .select('match_id, status, home_score_ft, away_score_ft')
      .eq('tournament_id', pool.tournament_id)
    if (error) {
      console.error('[live] matches read failed:', error.message)
      return []
    }
    return (data ?? []) as PoolLiveResponse['matches']
  }

  // Paged, because a silent 1000-row cut here would understate
  // `completed_matches` and put the client back into permanent full-refresh.
  // A 20-club season is 380 fixtures, so this is one iteration in practice.
  const out: PoolLiveResponse['matches'] = []
  const pageSize = 1000
  let offset = 0
  for (;;) {
    const { data, error } = await admin
      .from('league_fixtures')
      .select('fixture_id, status, home_goals, away_goals')
      .eq('season_id', pool.league_season_id)
      .order('fixture_id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) {
      console.error('[live] league_fixtures read failed:', error.message)
      return []
    }
    const page = (data ?? []) as Array<{
      fixture_id: string
      status: string
      home_goals: number | null
      away_goals: number | null
    }>
    for (const f of page) {
      out.push({
        match_id: f.fixture_id,
        status: f.status,
        home_score_ft: f.home_goals,
        away_score_ft: f.away_goals,
      })
    }
    if (page.length < pageSize) break
    offset += page.length
  }
  return out
}

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .maybeSingle()
  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })
  }

  // Membership is proven above, so the admin client is safe from here — and it
  // is required, because the shadow tables are RLS deny-all.
  const admin = createAdminClient()

  const { data: pool } = await admin
    .from('pools')
    .select('pool_id, tournament_id, prediction_mode, league_season_id')
    .eq('pool_id', pool_id)
    .maybeSingle()
  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  const [matchRows, { data: memberRows }] = await Promise.all([
    readLiveMatchRows(admin, pool as { tournament_id: string; league_season_id: string | null }),
    admin.from('pool_members').select('pool_entries(entry_id)').eq('pool_id', pool_id),
  ])

  const matches = matchRows
  const completed = matches.filter((m) => m.status === 'completed')

  // Score rows exist only for matches that are completed or live — see
  // lib/scoring/core.ts:222, which refuses to score anything else. Completed
  // rows are final and the client already holds them, so the only scores that
  // can have moved are the LIVE ones.
  //
  // Filtering to live rather than "not completed" also keeps this bounded by
  // how many matches kick off at once, not by competition size: a Premier
  // League season is 380 matches, and passing that many ids to a PostgREST
  // `.in()` would build a URL long enough to be refused.
  const liveIds = matches.filter((m) => m.status === 'live').map((m) => m.match_id)

  const entryIds = ((memberRows ?? []) as Array<{ pool_entries?: Array<{ entry_id: string }> | null }>)
    .flatMap((m) => m.pool_entries ?? [])
    .map((e) => e.entry_id)
    .filter(Boolean)

  // Every non-completed match, so the client sees a kickoff transition. This
  // array is 4 small fields per row — it scales with the fixture list, not with
  // members × fixtures like `scores` does.
  const openMatches = matches.filter((m) => m.status !== 'completed')

  if (entryIds.length === 0) {
    return NextResponse.json({
      completed_matches: completed.length,
      entries: [],
      scores: [],
      stats: [],
      matches: openMatches,
    } satisfies PoolLiveResponse)
  }

  const source = await getScoringSource(admin, pool_id, pool.prediction_mode ?? 'full_tournament')
  const scoring = await readEntryScoring(admin, entryIds, source)

  // Between matchdays there are no live matches, so this runs no query at all
  // and the response is just the leaderboard totals.
  let scores: MatchScoreNarrow[] = []
  let stats: EntryStatsData[] = []
  if (liveIds.length > 0) {
    // Same reader the full payload uses, so shadow/prod column differences and
    // the synthesised shadow id are handled in one place.
    scores = await readMatchScoresNarrow(admin, entryIds, source, liveIds)
    // The leaderboard's stats half. Same reader as the initial page load, so
    // the merged row cannot disagree with the one it replaces.
    stats = await readEntryStats(admin, entryIds)
  }

  const entries: LiveEntry[] = entryIds.map((id) => {
    const s = scoring.get(id)
    return {
      entry_id: id,
      match_points: s?.match_points ?? 0,
      bonus_points: s?.bonus_points ?? 0,
      point_adjustment: s?.point_adjustment ?? 0,
      scored_total_points: s?.scored_total_points ?? 0,
      current_rank: s?.current_rank ?? null,
      previous_rank: s?.previous_rank ?? null,
    }
  })

  return NextResponse.json({
    completed_matches: completed.length,
    entries,
    scores,
    stats,
    matches: openMatches,
  } satisfies PoolLiveResponse)
}

export const GET = withPerfLogging('pools/live', handleGET)
