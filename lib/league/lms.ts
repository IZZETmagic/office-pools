// =============================================================
// LAST MAN STANDING — read the round, make the pick
// =============================================================
// One club a matchweek, to win. The two things this file exists to get right:
//
//   1. Which clubs you have ALREADY USED this round, because that is the rule
//      that makes the mode a game and the screen has to enforce it visibly
//      rather than letting the database refuse a tap after the fact.
//   2. Reading back after a write, because the lock is a silent-skip trigger
//      like every other prediction lock here.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type LmsRound = {
  round_id: string
  round_number: number
  first_matchweek: number
  last_matchweek: number | null
}

export type LmsSurvivor = {
  entry_id: string
  eliminated_matchweek: number | null
  is_winner: boolean
}

export type LmsPick = {
  round_id: string
  entry_id: string
  matchweek_number: number
  club_id: string
  result: 'survived' | 'eliminated' | null
  /**
   * The game this pick was judged on, frozen at settle (migration 115).
   *
   * ⚠ NULL is not missing data — it is the two-state contract. NULL means the
   * matchweek has not settled and the opponent must be derived live, because it
   * can still legitimately move (re-homing, 106). Non-NULL means the week is
   * decided and THIS is the record: nothing re-derives it, and no later open
   * matchweek can restate it. See `readLmsPickFixtures`.
   */
  fixture_id: string | null
}

export type LmsState = {
  /** The round in progress, or null before one has opened. */
  round: LmsRound | null
  survivors: LmsSurvivor[]
  /** Every pick the viewer has made in the OPEN round. */
  myPicks: LmsPick[]
  /** Picks made by anyone, for matchweeks that have already locked. */
  revealedPicks: LmsPick[]
  error: string | null
}

export async function readLmsState(
  supabase: SupabaseClient,
  poolId: string,
  entryIds: string[],
): Promise<LmsState> {
  const empty: LmsState = { round: null, survivors: [], myPicks: [], revealedPicks: [], error: null }

  const { data: rounds, error: rErr } = await supabase
    .from('league_lms_rounds')
    .select('round_id, round_number, first_matchweek, last_matchweek')
    .eq('pool_id', poolId)
    .is('last_matchweek', null)
    .maybeSingle()
  if (rErr) return { ...empty, error: `league_lms_rounds: ${rErr.message}` }
  if (!rounds) return empty

  const round = rounds as LmsRound

  const [survivorsRes, picksRes] = await Promise.all([
    supabase
      .from('league_lms_survivors')
      .select('entry_id, eliminated_matchweek, is_winner')
      .eq('round_id', round.round_id),
    // RLS decides what comes back: the viewer's own picks always, and everyone
    // else's only once that matchweek has locked. One query, two policies —
    // the alternative is a client-side filter, which is not a gate.
    supabase
      .from('league_lms_picks')
      .select('round_id, entry_id, matchweek_number, club_id, result, fixture_id')
      .eq('round_id', round.round_id),
  ])
  if (survivorsRes.error) return { ...empty, round, error: `survivors: ${survivorsRes.error.message}` }
  if (picksRes.error) return { ...empty, round, error: `picks: ${picksRes.error.message}` }

  const own = new Set(entryIds)
  const all = (picksRes.data ?? []) as LmsPick[]

  return {
    round,
    survivors: (survivorsRes.data ?? []) as LmsSurvivor[],
    myPicks: all.filter((p) => own.has(p.entry_id)),
    revealedPicks: all.filter((p) => !own.has(p.entry_id)),
    error: null,
  }
}

export type LmsSaveResult = {
  saved: boolean
  /** The database refused it: locked, not the open matchweek, or already out. */
  refused: boolean
  error: string | null
}

/**
 * Choose a club for a matchweek. Replaces an earlier choice for the same
 * matchweek — changing your mind before the lock is allowed and expected.
 */
export async function saveLmsPick(
  supabase: SupabaseClient,
  args: { roundId: string; entryId: string; matchweekNumber: number; clubId: string },
): Promise<LmsSaveResult> {
  const { roundId, entryId, matchweekNumber, clubId } = args

  const { error } = await supabase.from('league_lms_picks').upsert(
    { round_id: roundId, entry_id: entryId, matchweek_number: matchweekNumber, club_id: clubId },
    { onConflict: 'round_id,entry_id,matchweek_number' },
  )
  if (error) {
    // The club-once-per-round rule surfaces as a unique violation. Translated
    // here because "duplicate key value violates constraint" is not a sentence
    // anybody should read.
    if (error.code === '23505') {
      return { saved: false, refused: false, error: 'You have already used that club in this round.' }
    }
    return { saved: false, refused: false, error: error.message }
  }

  // READ BACK. The lock trigger drops the write silently, so asking is the only
  // way to know — and a member who already had a pick and was refused an update
  // looks identical to one who succeeded if you only count rows.
  const { data, error: rErr } = await supabase
    .from('league_lms_picks')
    .select('club_id')
    .eq('round_id', roundId)
    .eq('entry_id', entryId)
    .eq('matchweek_number', matchweekNumber)
    .maybeSingle()
  if (rErr) return { saved: false, refused: false, error: rErr.message }

  const landed = (data as { club_id: string } | null)?.club_id === clubId
  return { saved: landed, refused: !landed, error: null }
}

/** Clubs this entry has already spent in the open round. */
export function usedClubIds(myPicks: LmsPick[]): Set<string> {
  return new Set(myPicks.map((p) => p.club_id))
}

// =============================================================
// THE GAME BEHIND THE PICK
// =============================================================
// A club on its own does not explain a week. "I picked Arsenal" is not the
// story — "I picked Arsenal, they beat Fulham 2-1, that is why I am still in"
// is. Until migration 115 nothing recorded the second half of that sentence, so
// every screen re-derived the opponent from whichever matchweek happened to be
// OPEN at the moment of the read, and a pick from three weeks ago pointed at
// next weekend's fixture.
//
// Two states, and the pick itself says which one it is in:
//
//   fixture_id set   -> settled. Read the stored row. This is the record.
//   fixture_id null  -> not settled. Derive from the pick's OWN matchweek —
//                       never the open one — because it can still move.
//
// ⚠ THE DERIVATION USES THE PICK'S MATCHWEEK, NOT THE OPEN ONE. That is the
// whole fix on the read side. A pick for MW2 is narrated by MW2's fixtures for
// as long as it exists, whatever week the season has since reached.
// =============================================================

/** The game one pick was made against, however it was resolved. */
export type LmsPickFixture = {
  opponentName: string
  opponentAbbr: string | null
  opponentCrest: string | null
  /** True when the picked club is at home. */
  isHome: boolean
  kickoffAt: string | null
  /** Goals as scored by the PICKED club and its opponent — not home and away. */
  clubGoals: number | null
  opponentGoals: number | null
  isCompleted: boolean
  /**
   * True when this came off the pick's stored `fixture_id` and can never change
   * again. False means it is still being derived and the fixture may yet move.
   */
  frozen: boolean
}

/** Picks are keyed per entry, so two members' MW2 picks never collide. */
export function lmsPickKey(pick: { entry_id: string; matchweek_number: number }): string {
  return `${pick.entry_id}:${pick.matchweek_number}`
}

export type FixtureRow = {
  fixture_id: string
  matchweek_id: string
  home_club_id: string
  away_club_id: string
  kickoff_at: string | null
  home_goals: number | null
  away_goals: number | null
  is_completed: boolean
}

/**
 * Resolve the game behind every pick in one pass, keyed by `lmsPickKey`.
 *
 * Four queries whatever the number of picks: the frozen fixtures by id, the
 * matchweeks still needing derivation, their fixtures, and the season's clubs.
 * A pick missing from the result has no game that matchweek — under these rules
 * that is a real answer (you cannot be beaten by a match that was not played),
 * not a gap, and the caller is expected to say so.
 */
export async function readLmsPickFixtures(
  supabase: SupabaseClient,
  seasonId: string,
  picks: LmsPick[],
): Promise<{ byPick: Map<string, LmsPickFixture>; error: string | null }> {
  const byPick = new Map<string, LmsPickFixture>()
  if (picks.length === 0) return { byPick, error: null }

  const frozenIds = Array.from(new Set(picks.map((p) => p.fixture_id).filter((id): id is string => !!id)))
  const liveWeeks = Array.from(new Set(picks.filter((p) => !p.fixture_id).map((p) => p.matchweek_number)))

  const [frozenRes, weekRes, clubsRes] = await Promise.all([
    frozenIds.length > 0
      ? supabase
          .from('league_fixtures')
          .select('fixture_id, matchweek_id, home_club_id, away_club_id, kickoff_at, home_goals, away_goals, is_completed')
          .in('fixture_id', frozenIds)
      : Promise.resolve({ data: [] as FixtureRow[], error: null }),
    liveWeeks.length > 0
      ? supabase
          .from('league_matchweeks')
          .select('matchweek_id, matchweek_number')
          .eq('season_id', seasonId)
          .in('matchweek_number', liveWeeks)
      : Promise.resolve({ data: [] as Array<{ matchweek_id: string; matchweek_number: number }>, error: null }),
    supabase
      .from('league_clubs')
      .select('club_id, name, abbreviation, crest_url')
      .eq('season_id', seasonId),
  ])
  if (frozenRes.error) return { byPick, error: `frozen fixtures: ${frozenRes.error.message}` }
  if (weekRes.error) return { byPick, error: `matchweeks: ${weekRes.error.message}` }
  if (clubsRes.error) return { byPick, error: `league_clubs: ${clubsRes.error.message}` }

  const clubs = new Map(
    ((clubsRes.data ?? []) as Array<{ club_id: string; name: string; abbreviation: string | null; crest_url: string | null }>)
      .map((c) => [c.club_id, c]),
  )

  const weekRows = (weekRes.data ?? []) as Array<{ matchweek_id: string; matchweek_number: number }>
  const numberByWeekId = new Map(weekRows.map((m) => [m.matchweek_id, m.matchweek_number]))

  let liveRows: FixtureRow[] = []
  if (weekRows.length > 0) {
    const { data, error } = await supabase
      .from('league_fixtures')
      .select('fixture_id, matchweek_id, home_club_id, away_club_id, kickoff_at, home_goals, away_goals, is_completed')
      .in('matchweek_id', weekRows.map((m) => m.matchweek_id))
    if (error) return { byPick, error: `league_fixtures: ${error.message}` }
    liveRows = (data ?? []) as FixtureRow[]
  }

  // matchweek number -> club -> every fixture that club has that week. A club
  // can have two: `planRehome` attaches a makeup game to the weekend before and
  // has no clash guard, so "the club's fixture" is a choice, not a lookup.
  const liveByWeekClub = new Map<string, FixtureRow[]>()
  for (const f of liveRows) {
    const week = numberByWeekId.get(f.matchweek_id)
    if (week === undefined) continue
    for (const club of [f.home_club_id, f.away_club_id]) {
      const key = `${week}:${club}`
      const got = liveByWeekClub.get(key) ?? []
      got.push(f)
      liveByWeekClub.set(key, got)
    }
  }

  const frozenById = new Map(((frozenRes.data ?? []) as FixtureRow[]).map((f) => [f.fixture_id, f]))

  for (const pick of picks) {
    const row = pick.fixture_id
      ? frozenById.get(pick.fixture_id)
      : decidingFixture(liveByWeekClub.get(`${pick.matchweek_number}:${pick.club_id}`) ?? [], pick.club_id)
    if (!row) continue

    const isHome = row.home_club_id === pick.club_id
    const opp = clubs.get(isHome ? row.away_club_id : row.home_club_id)
    if (!opp) continue

    byPick.set(lmsPickKey(pick), {
      opponentName: opp.name,
      opponentAbbr: opp.abbreviation,
      opponentCrest: opp.crest_url,
      isHome,
      kickoffAt: row.kickoff_at,
      clubGoals: isHome ? row.home_goals : row.away_goals,
      opponentGoals: isHome ? row.away_goals : row.home_goals,
      isCompleted: row.is_completed,
      frozen: !!pick.fixture_id,
    })
  }

  return { byPick, error: null }
}

/**
 * Which of a club's fixtures in one matchweek the pick means.
 *
 * ⚠ THE SAME ORDER AS `league_lms_deciding_fixture` (migration 115): a win
 * first, then any completed game, then the earliest scheduled one. Both sides
 * have to agree, or a pick would be narrated by one fixture on Saturday and a
 * different one the moment the week settled — which is the bug this whole
 * change exists to end, arriving by another door.
 */
export function decidingFixture(rows: FixtureRow[], clubId: string): FixtureRow | undefined {
  if (rows.length <= 1) return rows[0]
  const won = (f: FixtureRow) =>
    f.is_completed &&
    f.home_goals != null &&
    f.away_goals != null &&
    (f.home_club_id === clubId ? f.home_goals > f.away_goals : f.away_goals > f.home_goals)
  return rows.slice().sort((a, b) =>
    Number(won(b)) - Number(won(a)) ||
    Number(b.is_completed) - Number(a.is_completed) ||
    (a.kickoff_at ?? '￿').localeCompare(b.kickoff_at ?? '￿') ||
    a.fixture_id.localeCompare(b.fixture_id),
  )[0]
}
