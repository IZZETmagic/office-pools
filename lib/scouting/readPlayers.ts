// =============================================================
// Reading the player lines a scout card is built from
// =============================================================
// ## ⚠⚠ WHY THIS READS ROWS RATHER THAN AGGREGATING IN SQL
//
// The house rule is to move reductions into the database, and the volume here
// argues for it: a full season is 38 fixtures × 40 player rows = ~1,520 per
// club, which is over PostgREST's 1,000-row cap on its own and would truncate
// SILENTLY. That rule is not being ignored — it is being satisfied a different
// way, and the reasoning is worth stating because the obvious reading of this
// file is that it breaks it.
//
//   · The window is RECENT FIXTURES, not the season. "In form now" is a claim
//     about the last handful of games, so the narrow read is also the correct
//     product behaviour rather than a concession to a row limit.
//   · Each club is read SEPARATELY, so neither can push the other over a cap.
//   · Both reads carry an explicit limit and a tripwire that THROWS on a full
//     page, because an exact-limit count is a bug and not a result.
//
// ⚠ IF THIS BECOMES HOT, the upgrade is an aggregating SQL function, not a
// bigger limit. `league_matchweek_points` (130) is the shape to copy.
//
// ⚠ PURE OF LOGIC: every reduction lives in `players.ts`, which is tested. This
// file only fetches and re-shapes.
// =============================================================

import type { createAdminClient } from '@/lib/supabase/server'

import type { GoalEventRow, PlayerStatRow } from './players'

type Admin = ReturnType<typeof createAdminClient>

/**
 * How many recent completed fixtures per club the form is measured over.
 *
 * ⚠ TEN, AND IT INTERACTS WITH `MIN_MINUTES = 180`. Two full games out of ten is
 * a floor a regular starter clears in the first fortnight and a fringe player
 * never does, which is the separation the card wants. Raising this without
 * raising that turns "in form" back into "played a lot in October".
 */
const RECENT_FIXTURES = 10

/** ~40 rows a fixture × 10 fixtures, plus headroom. A full page is a bug. */
const MAX_STAT_ROWS = 520

/** Which fixtures a club has most recently completed. */
async function recentFixtureIds(
  admin: Admin,
  seasonId: string,
  clubId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from('league_fixtures')
    .select('fixture_id, kickoff_at, home_club_id, away_club_id')
    .eq('season_id', seasonId)
    .eq('is_completed', true)
    .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
    // ⚠ BY KICKOFF, NEVER BY `fixture_number` — the schema's own comment says
    // that column is display and tiebreak only, not chronology.
    .order('kickoff_at', { ascending: false })
    .limit(RECENT_FIXTURES)

  if (error) throw new Error(`recentFixtureIds: ${error.message}`)
  return (data ?? []).map((f) => f.fixture_id as string)
}

type RawStat = {
  fixture_id: string
  side: 'home' | 'away'
  external_player_id: number
  player_name: string
  position: 'G' | 'D' | 'M' | 'F' | null
  minutes: number | null
  rating: number | string | null
  assists: number | null
  key_passes: number | null
  shots_on: number | null
  duels_won: number | null
  duels_total: number | null
  saves: number | null
  yellow_cards: number | null
  red_cards: number | null
}

/**
 * Player lines and goals for one club over its recent fixtures.
 *
 * ⚠ THE CLUB IS RESOLVED FROM `side` PLUS THE FIXTURE, because neither
 * `match_player_stats` nor `match_events` carries a club FK — 136 and 141 both
 * chose the side over a nullable FK pair and documented why. So this function
 * needs the fixture's two club ids to say whose row it is holding.
 */
export async function readClubPlayerForm(
  admin: Admin,
  seasonId: string,
  clubId: string,
): Promise<{ stats: PlayerStatRow[]; goals: GoalEventRow[] }> {
  const fixtureIds = await recentFixtureIds(admin, seasonId, clubId)
  if (fixtureIds.length === 0) return { stats: [], goals: [] }

  // Which end this club was at, per fixture — the key to reading `side`.
  const { data: fx, error: fxErr } = await admin
    .from('league_fixtures')
    .select('fixture_id, home_club_id, away_club_id')
    .in('fixture_id', fixtureIds)

  if (fxErr) throw new Error(`readClubPlayerForm/fixtures: ${fxErr.message}`)

  const sideOf = new Map<string, 'home' | 'away'>()
  for (const f of fx ?? []) {
    sideOf.set(f.fixture_id as string, f.home_club_id === clubId ? 'home' : 'away')
  }

  // ---- the player lines ----------------------------------------------------
  const { data: rawStats, error: statErr } = await admin
    .from('match_player_stats')
    .select(
      'fixture_id, side, external_player_id, player_name, position, minutes, rating, ' +
        'assists, key_passes, shots_on, duels_won, duels_total, saves, yellow_cards, red_cards',
    )
    .in('fixture_id', fixtureIds)
    .limit(MAX_STAT_ROWS)

  if (statErr) throw new Error(`readClubPlayerForm/stats: ${statErr.message}`)

  const statRows = (rawStats ?? []) as unknown as RawStat[]
  if (statRows.length >= MAX_STAT_ROWS) {
    throw new Error(
      `readClubPlayerForm: hit the ${MAX_STAT_ROWS}-row ceiling for club ${clubId}. ` +
        'A form table built on a truncated page ranks whoever survived the cut.',
    )
  }

  const stats: PlayerStatRow[] = statRows
    // Only this club's half of each fixture.
    .filter((r) => sideOf.get(r.fixture_id) === r.side)
    .map((r) => ({
      externalPlayerId: r.external_player_id,
      playerName: r.player_name,
      clubId,
      position: r.position,
      minutes: r.minutes,
      // ⚠ THE PROVIDER SENDS THE RATING AS A STRING and 141 stores it
      // `numeric(3,1)`; PostgREST hands numerics back as strings over the wire.
      // `Number(null)` is 0, which would be a rating rather than an absence —
      // hence the explicit null check rather than a bare cast.
      rating: r.rating === null ? null : Number(r.rating),
      assists: r.assists,
      keyPasses: r.key_passes,
      shotsOn: r.shots_on,
      duelsWon: r.duels_won,
      duelsTotal: r.duels_total,
      saves: r.saves,
      yellowCards: r.yellow_cards,
      redCards: r.red_cards,
    }))

  // ---- the goals, from the authoritative table -----------------------------
  // ⚠ `match_events`, NOT the goals column on the rows above. The two disagree
  // at source — 141 measured 428 against 430 across 146 fixtures.
  const { data: rawGoals, error: goalErr } = await admin
    .from('match_events')
    .select('fixture_id, side, kind, player_name, related_name')
    .in('fixture_id', fixtureIds)
    .in('kind', ['goal', 'own_goal', 'penalty'])
    .limit(MAX_STAT_ROWS)

  if (goalErr) throw new Error(`readClubPlayerForm/goals: ${goalErr.message}`)

  const goals: GoalEventRow[] = ((rawGoals ?? []) as unknown as {
    fixture_id: string
    side: 'home' | 'away'
    kind: 'goal' | 'own_goal' | 'penalty'
    player_name: string | null
    related_name: string | null
  }[])
    // ⚠ THE SIDE ON A SCORING EVENT IS THE SIDE THAT BENEFITS, own goals
    // included — the feed's own convention, which 136 copies straight across
    // and explicitly warns against "correcting". So this filter is right for an
    // own goal too; `scoutSide` is what refuses to credit the player.
    .filter((g) => sideOf.get(g.fixture_id) === g.side)
    .map((g) => ({
      playerName: g.player_name,
      clubId,
      kind: g.kind,
      assistName: g.related_name,
    }))

  return { stats, goals }
}
