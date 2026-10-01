// =============================================================
// LEAGUE ACTIVITY — the reads behind Needs You and the story cards
// =============================================================
// Before this, the Activity feed knew nothing about league pools: every event
// type came from World Cup tables (match_scores, pool_entries.current_rank),
// which are empty for a league entry. A Premier League member opened the tab
// to a "Joined Office League" row and nothing else all season.
//
// ⚠ ADMIN CLIENT ONLY. league_match_scores, league_entry_totals (via
// readLeagueCardFacts) and league_entry_rank_history are deny-all; a user
// client reads `[]` with `error: null` and every card silently vanishes. See
// lib/league/__tests__/denyAllTables.guard.test.ts.
//
// ⚠ A FAILED READ DEGRADES, IT DOES NOT THROW. The feed is decoration around
// links; if a league table cannot be read the rest of the feed must still
// render. But every error is LOGGED — never `const { data } = await …`, which
// is how an empty section hides forever.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllPages } from '@/lib/poolData'
import { readLeagueCardFacts } from '@/lib/league/poolCards'
import {
  buildMatchweekStories,
  type DuelRow,
  type FixtureLabel,
  type LmsPickRow,
  type LmsSurvivorRow,
  type MatchweekStory,
  type RankRow,
  type ScoreRow,
  type SettledWeek,
  type StoryMode,
  type StoryPool,
} from './matchweekStories'
import { buildNeedsYou, type NeedItem } from './needsYou'

export type LeagueActivityPool = {
  poolId: string
  poolName: string
  seasonId: string | null
  mode: string | null
  tableLockAt: string | null
  startMatchweek: number | null
  /** The viewer's entries, lowest entry_number first. */
  entries: Array<{ entryId: string; entryName: string }>
  entrantCount: number | null
}

const STORY_MODES = new Set<StoryMode>(['pickem', 'showdown', 'last_man_standing', 'table'])

function logErr(label: string, error: { message: string } | null | undefined) {
  if (error) console.error(`[activity:league] ${label}:`, error.message)
}

function leaguePoolsOf(pools: LeagueActivityPool[]) {
  return pools.filter((p) => p.seasonId && STORY_MODES.has(p.mode as StoryMode))
}

/** Open decisions — the top of the tab. First page only; it is about now. */
export async function readLeagueNeeds(
  admin: SupabaseClient,
  pools: LeagueActivityPool[],
  now: number,
): Promise<NeedItem[]> {
  const league = leaguePoolsOf(pools)
  if (league.length === 0) return []
  const facts = await readLeagueCardFacts(
    admin,
    league.map((p) => ({
      poolId: p.poolId,
      seasonId: p.seasonId,
      leagueMode: p.mode,
      tableLockAt: p.tableLockAt,
      startMatchweek: p.startMatchweek,
      entryId: p.entries[0]?.entryId ?? null,
    })),
  )
  return buildNeedsYou(
    league.map((p) => ({
      poolId: p.poolId,
      poolName: p.poolName,
      mode: p.mode,
      entryId: p.entries[0]?.entryId ?? null,
    })),
    facts,
    now,
  )
}

/** Every settled matchweek in the member's league seasons — what pages are cut from. */
export async function readSettledWeeks(
  admin: SupabaseClient,
  pools: LeagueActivityPool[],
): Promise<SettledWeek[]> {
  const seasonIds = Array.from(new Set(leaguePoolsOf(pools).map((p) => p.seasonId as string)))
  if (seasonIds.length === 0) return []
  const { data, error } = await admin
    .from('league_matchweeks')
    .select('season_id, matchweek_number, ranks_snapshot_at')
    .in('season_id', seasonIds)
    .not('ranks_snapshot_at', 'is', null)
  logErr('matchweeks', error)
  return ((data ?? []) as Array<{ season_id: string; matchweek_number: number; ranks_snapshot_at: string }>).map(
    (r) => ({ seasonId: r.season_id, matchweekNumber: r.matchweek_number, settledAt: r.ranks_snapshot_at }),
  )
}

/** The story cards for exactly the weeks given — one page's worth. */
export async function readLeagueStories(
  admin: SupabaseClient,
  pools: LeagueActivityPool[],
  weeks: SettledWeek[],
  nameByEntry: Map<string, string>,
): Promise<MatchweekStory[]> {
  const league = leaguePoolsOf(pools)
  if (league.length === 0 || weeks.length === 0) return []
  const weekNumbers = Array.from(new Set(weeks.map((w) => w.matchweekNumber)))

  const entryIdsOf = (modes: string[]) =>
    league.filter((p) => modes.includes(p.mode as string)).flatMap((p) => p.entries.map((e) => e.entryId))
  const scoredEntries = entryIdsOf(['pickem', 'showdown'])
  const lmsEntries = entryIdsOf(['last_man_standing'])
  const showdownPools = league.filter((p) => p.mode === 'showdown').map((p) => p.poolId)
  const allEntries = league.flatMap((p) => p.entries.map((e) => e.entryId))

  const [scores, duelRes, lmsRes, ranks] = await Promise.all([
    scoredEntries.length === 0
      ? Promise.resolve([] as ScoreRow[])
      : fetchAllPages<ScoreRow>('activity league scores', (from, to) =>
          admin
            .from('league_match_scores')
            .select('entry_id, pool_id, matchweek_number, fixture_id, score_type, total_points')
            .in('entry_id', scoredEntries)
            .in('matchweek_number', weekNumbers)
            .order('entry_id')
            .order('fixture_id')
            .range(from, to) as unknown as PromiseLike<{ data: ScoreRow[] | null; error: { message: string } | null }>,
        ),
    showdownPools.length === 0
      ? Promise.resolve({ data: [] as DuelRow[], error: null })
      : admin
          .from('league_duels')
          .select('pool_id, matchweek_number, entry_a, entry_b, accuracy_a, accuracy_b, points_a, points_b, settled_at')
          .in('pool_id', showdownPools)
          .in('matchweek_number', weekNumbers)
          .not('settled_at', 'is', null),
    lmsEntries.length === 0
      ? Promise.resolve({ data: [], error: null })
      : admin
          .from('league_lms_picks')
          .select('round_id, entry_id, matchweek_number, club_id, result')
          .in('entry_id', lmsEntries)
          .in('matchweek_number', weekNumbers),
    // Every recorded week for these entries, not just the window: the card for
    // the oldest week in it still needs the rank from the week before.
    fetchAllPages<RankRow>('activity rank history', (from, to) =>
      admin
        .from('league_entry_rank_history')
        .select('entry_id, matchweek_number, rank')
        .in('entry_id', allEntries)
        .order('entry_id')
        .order('matchweek_number')
        .range(from, to) as unknown as PromiseLike<{ data: RankRow[] | null; error: { message: string } | null }>,
    ),
  ])
  logErr('duels', duelRes.error)
  logErr('lms picks', lmsRes.error)
  const duels = (duelRes.data ?? []) as DuelRow[]

  // ---- LMS: rounds, survivors, club names ----------------------------------
  const lmsRaw = (lmsRes.data ?? []) as Array<{
    round_id: string
    entry_id: string
    matchweek_number: number
    club_id: string
    result: 'survived' | 'eliminated' | null
  }>
  const poolByEntry = new Map<string, string>()
  for (const p of league) for (const e of p.entries) poolByEntry.set(e.entryId, p.poolId)

  const roundIds = Array.from(new Set(lmsRaw.map((r) => r.round_id)))
  const lmsClubIds = lmsRaw.map((r) => r.club_id)

  // ---- Fixture labels for the detail lines ---------------------------------
  const fixtureIds = Array.from(new Set(scores.map((s) => s.fixture_id)))
  const [roundRes, survivorRes, fixtureRes] = await Promise.all([
    roundIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : admin.from('league_lms_rounds').select('round_id, round_number').in('round_id', roundIds),
    roundIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : admin
          .from('league_lms_survivors')
          .select('round_id, entry_id, eliminated_matchweek, is_winner')
          .in('round_id', roundIds),
    fixtureIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : admin
          .from('league_fixtures')
          .select('fixture_id, home_club_id, away_club_id, home_goals, away_goals')
          .in('fixture_id', fixtureIds),
  ])
  logErr('lms rounds', roundRes.error)
  logErr('lms survivors', survivorRes.error)
  logErr('fixtures', fixtureRes.error)

  const fixtureRows = (fixtureRes.data ?? []) as Array<{
    fixture_id: string
    home_club_id: string
    away_club_id: string
    home_goals: number | null
    away_goals: number | null
  }>
  const clubIds = Array.from(
    new Set([...lmsClubIds, ...fixtureRows.flatMap((f) => [f.home_club_id, f.away_club_id])]),
  )
  const clubName = new Map<string, string>()
  if (clubIds.length > 0) {
    const { data: clubData, error: clubErr } = await admin
      .from('league_clubs')
      .select('club_id, name, short_name')
      .in('club_id', clubIds)
    logErr('clubs', clubErr)
    for (const c of (clubData ?? []) as Array<{ club_id: string; name: string | null; short_name: string | null }>) {
      clubName.set(c.club_id, c.short_name || c.name || 'Club')
    }
  }

  const roundNumber = new Map(
    ((roundRes.data ?? []) as Array<{ round_id: string; round_number: number }>).map((r) => [
      r.round_id,
      r.round_number,
    ]),
  )
  const lmsPicks: LmsPickRow[] = lmsRaw.map((r) => ({
    pool_id: poolByEntry.get(r.entry_id) ?? '',
    round_id: r.round_id,
    round_number: roundNumber.get(r.round_id) ?? 1,
    entry_id: r.entry_id,
    matchweek_number: r.matchweek_number,
    club_name: clubName.get(r.club_id) ?? 'your club',
    result: r.result,
  }))
  const fixtures: FixtureLabel[] = fixtureRows.map((f) => ({
    fixture_id: f.fixture_id,
    home: clubName.get(f.home_club_id) ?? 'Home',
    away: clubName.get(f.away_club_id) ?? 'Away',
    home_goals: f.home_goals,
    away_goals: f.away_goals,
  }))

  const storyPools: StoryPool[] = league.map((p) => ({
    poolId: p.poolId,
    poolName: p.poolName,
    seasonId: p.seasonId as string,
    mode: p.mode as StoryMode,
    entries: p.entries,
    entrantCount: p.entrantCount,
  }))

  return buildMatchweekStories({
    pools: storyPools,
    weeks,
    scores,
    fixtures,
    duels,
    lmsPicks,
    lmsSurvivors: (survivorRes.data ?? []) as LmsSurvivorRow[],
    ranks,
    nameByEntry,
  })
}
