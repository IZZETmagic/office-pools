// =============================================================
// LEAGUE FACTS FOR A POOL CARD — the list surfaces, batched
// =============================================================
// The pools list and the dashboard each render a card per pool, and every
// number on that card used to come from World Cup tables. For a league pool all
// of them are legitimately empty:
//
//     matches      by tournament_id  -> 0 rows   (fixtures are league_fixtures)
//     predictions  by entry_id       -> 0 rows   (picks are league_predictions)
//     pool_entries.scored_total_points -> NULL   (totals are league_entry_totals)
//     entry_xp_state                   -> 0 rows (no league XP system exists)
//
// ⚠ Empty is a VALID result from PostgREST, so none of that errored. The cards
// rendered 0 points, rank "—", five grey form dots and "Level 1 · Rookie" for a
// member sitting top of a league leaderboard with a hundred points, and nothing
// anywhere said so. Same failure the note at lib/scoring/readSource.ts:80
// describes for shadow, one layer up.
//
// This module answers the questions the card asks that `readSource` does not:
// which matchweek is open, when it locks, and has this member done it yet.
//
// ⚠ SUBMISSION IS DERIVED FROM PICKS, never from
// `pool_entries.has_submitted_predictions` — that column is one of the two doors
// by which a league entry could enter World Cup scoring, and the vertical slice
// forbids the league path writing it (see the header of lib/league/read.ts). It
// is NULL for every league entry in production, which is why the action pill
// said "Predict" to members who had already picked.
//
// Everything here is batched across the whole page: one query per table for all
// league pools, not one per pool.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { inPlayMatchweekId, openMatchweekId, type MatchweekRow } from './read'
import { shortClubName } from './clubName'

type AdminClient = SupabaseClient

/** One league pool, as the caller already has it from its membership query. */
export type LeagueCardPool = {
  poolId: string
  seasonId: string | null
  /** `pools.league_mode` — pickem | showdown | last_man_standing | table. */
  leagueMode: string | null
  /** `pools.league_table_lock_at`. Table mode's deadline; NULL for the rest. */
  tableLockAt: string | null
  /**
   * The entry whose progress the card describes — the same "best" entry whose
   * points, rank and form the card already shows, so all five agree.
   */
  entryId: string | null
}

export type LeagueCardFacts = {
  /** For the card's third tile. NULL once the season is over. */
  openMatchweekNumber: number | null
  /**
   * The matchweek being PLAYED, for the same tile. NULL between rounds.
   *
   * ⚠ The tile prefers this one. The open matchweek is what you can still pick,
   * which from Friday kickoff to Monday night is the week AFTER the one being
   * played — so all weekend the card said the season was a week further along
   * than it was. See `inPlayMatchweekId`.
   */
  inPlayMatchweekNumber: number | null
  /**
   * How many matchweeks this season has, for the "3 of 38" caption.
   *
   * ⚠ READ FROM THE SEASON, never written as 38. Twenty clubs play 38 rounds;
   * Bundesliga and Ligue 1 are eighteen clubs and 34, the Championship is
   * twenty-four and 46. `lib/__tests__/competitionRounds.test.ts` already pins
   * that relationship, and La Liga arriving beside the Premier League is the
   * reason it now matters here.
   */
  matchweekCount: number
  /**
   * When this member's next decision is due.
   *
   * ⚠ NOT `pools.prediction_deadline`. Every league pool in production carries
   * the season end there (2027-05-30), so the card's clock read "May 30, 2027"
   * all season — a deadline nine months out, on a game whose whole rhythm is
   * weekly. For Table mode it is the one-off table lock instead.
   */
  deadlineAt: string | null
  /** Denominator for "have I done this week": fixtures in the open matchweek. */
  totalPicks: number
  /** How many of them are played, for surfaces that show progress through it. */
  completedPicks: number
  /** How many this entry has actually made. */
  madePicks: number
  /** True when nothing is left to decide for the current matchweek. */
  hasSubmitted: boolean
  /**
   * Showdown's KPI strip. NULL for every other mode.
   *
   * Showdown is a LAYER over the weekly accuracy number (migration 084), so its
   * card cannot be the Pick'em card: the number that decides its leaderboard is
   * `duel_points`, not accuracy points, and its opponent is the whole mode.
   */
  showdown: ShowdownCardFacts | null
  /** Last Man Standing's KPI strip. NULL for every other mode. */
  lms: LmsCardFacts | null
  /** Predict the Table's KPI strip. NULL for every other mode. */
  table: TableCardFacts | null
}

/**
 * Everything a Predict the Table card's four tiles need.
 *
 * ⚠ BOTH NUMBERS ARE A COMPARISON OF TWO STORED ORDERINGS, not a second scoring
 * engine. `predicted_position` comes from `league_table_predictions` and the
 * actual position is `league_standings.rank` — the INGESTED rank, read as-is.
 * Never recompute a rank from points: the real table carries points deductions
 * the feed knows about and arithmetic does not, which is the whole reason phase
 * 7 ingests standings rather than deriving them.
 *
 * The card deliberately does NOT call `league_table_breakdown`. That RPC is
 * per-entry, and this module's contract is one query per table for the whole
 * page — see the header. Points still come from the engine.
 */
export type TableCardFacts = {
  /** Clubs whose predicted position equals their actual one. */
  spotOn: number
  /** How many clubs the season has — 20 in England, 18 in Germany. */
  clubCount: number
  /** Mean |predicted − actual| across every club. NULL before a ball is kicked. */
  averageOff: number | null
  /** False before this member has ordered the table at all. */
  hasTable: boolean
  /**
   * True once `league_standings_final` exists for the season.
   *
   * Until then the score is PROVISIONAL and the card says so — scoring is live
   * all season by Decision 9, and a hidden bank revealed on the last day would
   * be a lurch. See the header of migration 080.
   */
  isFinal: boolean
}

/** Everything a Last Man Standing card's four tiles need. */
export type LmsCardFacts = {
  /**
   * ⚠ THE STORED VALUE from `league_entry_totals.rounds_won`. Rounds repeat all
   * season and the season score is rounds won (migration 087), so this — not
   * survival, not accuracy — is what `league_finalize_ranks` leads on, ahead
   * even of Showdown's duel_points. Reading it is what makes the Rounds tile and
   * the Rank tile beside it agree by construction.
   */
  roundsWon: number
  /** The round in progress. NULL before one has opened. */
  roundNumber: number | null
  /** Still standing in the open round? */
  isEliminated: boolean
  /**
   * The matchweek whose RESULT knocked them out — not the one they failed to
   * pick in, so it reads as a football event rather than an administrative one.
   * See the column comment on league_lms_survivors.eliminated_matchweek.
   */
  eliminatedMatchweek: number | null
  /** How many are still standing in the open round, and how many started it. */
  survivorsLeft: number
  roundEntrants: number
  /**
   * The club picked for the matchweek being PLAYED, already shortened. NULL when
   * nothing is in play, or when they did not pick that week.
   *
   * ⚠ THE TILE LEADS ON THIS ONE. A single `clubName` used to carry the OPEN
   * week's pick and sit under the words "This week", so from Friday kickoff to
   * Monday night the card named a club whose game had not started while the club
   * the member was actually watching went unmentioned. Same collapse
   * `matchweekTile` was built to undo, one tile across.
   */
  inPlayClubName: string | null
  inPlayMatchweek: number | null
  /** The club picked for the week still OPEN — the next decision, not this one. */
  openClubName: string | null
  openMatchweek: number | null
}

/** Everything a Showdown card's four tiles need. */
export type ShowdownCardFacts = {
  /**
   * ⚠ THE STORED VALUE from `league_entry_totals.duel_points`, not `won*3+tied`
   * recomputed here. It is what `league_finalize_ranks` leads its cascade on, so
   * reading it is what makes the Duel pts tile and the Rank tile beside it agree
   * by construction. (`DuelsTab` does recompute it — if the two ever disagree
   * that is a real bug, and it should be visible rather than papered over by a
   * second derivation.)
   */
  duelPoints: number
  won: number
  tied: number
  lost: number
  byes: number
  /** Who this member plays in the open matchweek. NULL on a bye. */
  opponentName: string | null
  /** True when the open matchweek is this member's bye. */
  isBye: boolean
  /** The matchweek that duel belongs to. */
  duelMatchweek: number | null
  /** The last five SETTLED duels, oldest first. */
  recentDuels: DuelOutcome[]
}

export type DuelOutcome = 'won' | 'tied' | 'lost' | 'bye'

const EMPTY: LeagueCardFacts = {
  openMatchweekNumber: null,
  inPlayMatchweekNumber: null,
  matchweekCount: 0,
  deadlineAt: null,
  totalPicks: 0,
  completedPicks: 0,
  madePicks: 0,
  hasSubmitted: false,
  showdown: null,
  lms: null,
  table: null,
}

/**
 * Table mode and Last Man Standing are ONE decision, not N.
 *
 * A table order is written as a single reorder of every club, so it is never
 * half-done; an LMS week is one club. Modelling either as "20 of 20" or "1 of
 * 11" would make the dashboard's needs-attention sort — which keys on
 * `made > 0 && made < total` — classify a finished pool as half-finished.
 */
const SINGLE_DECISION_MODES = new Set(['table', 'last_man_standing'])

export async function readLeagueCardFacts(
  admin: AdminClient,
  pools: LeagueCardPool[],
): Promise<Map<string, LeagueCardFacts>> {
  const out = new Map<string, LeagueCardFacts>()
  if (pools.length === 0) return out
  for (const p of pools) out.set(p.poolId, { ...EMPTY })

  const now = Date.now()

  // ---- 1. the open matchweek, per season -----------------------------------
  const seasonIds = Array.from(new Set(pools.map((p) => p.seasonId).filter((s): s is string => !!s)))
  if (seasonIds.length === 0) return out

  const { data: mwData, error: mwErr } = await admin
    .from('league_matchweeks')
    .select('matchweek_id, matchweek_number, fixture_count, completed_fixture_count, lock_at, first_kickoff_at, ranks_snapshot_at, season_id')
    .in('season_id', seasonIds)
  // A card is decoration around a link. If the league tables cannot be read the
  // list must still render, so every failure below degrades to EMPTY rather
  // than throwing — the same call readRecentForm makes for the form dots.
  if (mwErr) return out

  const bySeason = new Map<string, MatchweekRow[]>()
  for (const row of (mwData ?? []) as Array<MatchweekRow & { season_id: string }>) {
    const got = bySeason.get(row.season_id) ?? []
    got.push(row)
    bySeason.set(row.season_id, got)
  }

  // `openMatchweekId` is the single TS definition of Decision 16 and mirrors
  // `league_open_matchweek` in SQL. Re-deriving "the next one by number" here
  // would be a third copy, and wrong: a whole round can be moved, so round N is
  // not always played before N+1.
  const openByPool = new Map<string, MatchweekRow>()
  const inPlayByPool = new Map<string, MatchweekRow>()
  for (const p of pools) {
    if (!p.seasonId) continue
    const rows = bySeason.get(p.seasonId) ?? []
    // The matchweek being played is the tile's number; the open one is still
    // what every count below is about, because it is the one owing a decision.
    const inPlayId = inPlayMatchweekId(rows, now)
    const inPlay = rows.find((r) => r.matchweek_id === inPlayId)
    if (inPlay) inPlayByPool.set(p.poolId, inPlay)
    const openId = openMatchweekId(rows, now)
    const open = rows.find((r) => r.matchweek_id === openId)
    if (!open) continue
    openByPool.set(p.poolId, open)
  }

  // ---- 2. what each pool's member still has to decide -----------------------
  const single = pools.filter((p) => SINGLE_DECISION_MODES.has(p.leagueMode ?? ''))
  const perFixture = pools.filter((p) => !SINGLE_DECISION_MODES.has(p.leagueMode ?? ''))

  const madeByPool = new Map<string, number>()

  // 2a. Pick'em and Showdown — a pick per fixture in the open matchweek.
  //     Showdown is a layer over the weekly accuracy number, so its picking
  //     screen is Pick'em's and its progress is counted the same way.
  const openMatchweekIds = perFixture
    .map((p) => openByPool.get(p.poolId)?.matchweek_id)
    .filter((id): id is string => !!id)
  if (openMatchweekIds.length > 0) {
    const { data: fxData } = await admin
      .from('league_fixtures')
      .select('fixture_id, matchweek_id')
      .in('matchweek_id', Array.from(new Set(openMatchweekIds)))
    const fixturesByMatchweek = new Map<string, string[]>()
    for (const f of (fxData ?? []) as Array<{ fixture_id: string; matchweek_id: string }>) {
      const got = fixturesByMatchweek.get(f.matchweek_id) ?? []
      got.push(f.fixture_id)
      fixturesByMatchweek.set(f.matchweek_id, got)
    }

    const entryIds = perFixture.map((p) => p.entryId).filter((id): id is string => !!id)
    const allFixtureIds = Array.from(new Set(Array.from(fixturesByMatchweek.values()).flat()))
    if (entryIds.length > 0 && allFixtureIds.length > 0) {
      // One row per pick, either depth: a Scores pick carries a scoreline and a
      // Results pick carries an outcome, and both live in this table (migration
      // 064). Counting rows therefore covers both without asking which depth
      // the pool is — which is the point of them sharing a table.
      const { data: pickData } = await admin
        .from('league_predictions')
        .select('entry_id, fixture_id')
        .in('entry_id', entryIds)
        .in('fixture_id', allFixtureIds)
      const picked = new Set(
        ((pickData ?? []) as Array<{ entry_id: string; fixture_id: string }>).map(
          (r) => `${r.entry_id}:${r.fixture_id}`,
        ),
      )
      for (const p of perFixture) {
        const open = openByPool.get(p.poolId)
        if (!open || !p.entryId) continue
        const fixtures = fixturesByMatchweek.get(open.matchweek_id) ?? []
        let n = 0
        for (const fid of fixtures) if (picked.has(`${p.entryId}:${fid}`)) n++
        madeByPool.set(p.poolId, n)
      }
    }
  }

  // 2b. Predict the Table — one order for the whole season, so the question is
  //     simply whether it exists. Not scoped to a matchweek: the decision was
  //     made once, in August, and stays made.
  const tablePools = single.filter((p) => p.leagueMode === 'table' && p.entryId)
  if (tablePools.length > 0) {
    const tableEntryIds = tablePools.map((p) => p.entryId as string)
    const tableSeasonIds = Array.from(
      new Set(tablePools.map((p) => p.seasonId).filter((x): x is string => !!x)),
    )

    const [{ data: tblData }, { data: standingRows }, { data: finalRows }] = await Promise.all([
      admin
        .from('league_table_predictions')
        .select('entry_id, club_id, predicted_position')
        .in('entry_id', tableEntryIds),
      // ⚠ `rank` AS INGESTED. Never recompute it from points — the real table
      // carries deductions the feed knows about and arithmetic does not.
      tableSeasonIds.length > 0
        ? admin.from('league_standings').select('season_id, club_id, rank').in('season_id', tableSeasonIds)
        : Promise.resolve({ data: [] as Array<{ season_id: string; club_id: string; rank: number }> }),
      tableSeasonIds.length > 0
        ? admin.from('league_standings_final').select('season_id').in('season_id', tableSeasonIds)
        : Promise.resolve({ data: [] as Array<{ season_id: string }> }),
    ])

    const predictions = (tblData ?? []) as Array<{ entry_id: string; club_id: string; predicted_position: number }>
    const hasOrder = new Set(predictions.map((r) => r.entry_id))
    for (const p of tablePools) madeByPool.set(p.poolId, hasOrder.has(p.entryId as string) ? 1 : 0)

    // actual rank, per season, per club
    const actualBySeason = new Map<string, Map<string, number>>()
    for (const r of (standingRows ?? []) as Array<{ season_id: string; club_id: string; rank: number }>) {
      const got = actualBySeason.get(r.season_id) ?? new Map<string, number>()
      got.set(r.club_id, r.rank)
      actualBySeason.set(r.season_id, got)
    }
    const finalSeasons = new Set(((finalRows ?? []) as Array<{ season_id: string }>).map((r) => r.season_id))

    const predsByEntry = new Map<string, Array<{ club_id: string; predicted_position: number }>>()
    for (const r of predictions) {
      const got = predsByEntry.get(r.entry_id) ?? []
      got.push(r)
      predsByEntry.set(r.entry_id, got)
    }

    for (const p of tablePools) {
      const me = p.entryId as string
      const mine = predsByEntry.get(me) ?? []
      const actual = p.seasonId ? actualBySeason.get(p.seasonId) : undefined

      let spotOn = 0
      let deltaSum = 0
      let compared = 0
      for (const row of mine) {
        const actualRank = actual?.get(row.club_id)
        // NULL until the club has a standings row — i.e. before a ball is
        // kicked. An unplayed season is not a table full of misses.
        if (actualRank == null) continue
        compared++
        const delta = Math.abs(row.predicted_position - actualRank)
        if (delta === 0) spotOn++
        deltaSum += delta
      }

      const facts = out.get(p.poolId)
      if (facts) {
        facts.table = {
          spotOn,
          clubCount: mine.length,
          averageOff: compared > 0 ? Math.round((deltaSum / compared) * 10) / 10 : null,
          hasTable: mine.length > 0,
          isFinal: p.seasonId ? finalSeasons.has(p.seasonId) : false,
        }
      }
    }
  }

  // 2c. Last Man Standing — one club for the open matchweek, in the open round.
  const lmsPools = single.filter((p) => p.leagueMode === 'last_man_standing' && p.entryId)
  if (lmsPools.length > 0) {
    const lmsEntryIds = lmsPools.map((p) => p.entryId as string)
    const { data: roundData } = await admin
      .from('league_lms_rounds')
      .select('round_id, pool_id, round_number')
      .in('pool_id', lmsPools.map((p) => p.poolId))
      .is('last_matchweek', null)
    const roundByPool = new Map(
      ((roundData ?? []) as Array<{ round_id: string; pool_id: string; round_number: number }>)
        .map((r) => [r.pool_id, r]),
    )
    const roundIds = Array.from(new Set(Array.from(roundByPool.values()).map((r) => r.round_id)))

    if (roundIds.length > 0) {
      const [{ data: lmsPicks }, { data: survivorRows }, { data: totalRows }] = await Promise.all([
        admin
          .from('league_lms_picks')
          .select('round_id, entry_id, matchweek_number, club_id')
          .in('round_id', roundIds)
          .in('entry_id', lmsEntryIds),
        // ⚠ EVERY entrant in the round, not just this member — "4 of 10 left" is
        // the mode's tension and it is a fact about the pool, so it cannot be
        // scoped to the viewer's own row.
        admin
          .from('league_lms_survivors')
          .select('round_id, entry_id, eliminated_matchweek')
          .in('round_id', roundIds),
        admin
          .from('league_entry_totals')
          .select('entry_id, rounds_won')
          .in('entry_id', lmsEntryIds),
      ])

      const pickRows = (lmsPicks ?? []) as Array<{ round_id: string; entry_id: string; matchweek_number: number; club_id: string }>
      const picked = new Set(pickRows.map((r) => `${r.round_id}:${r.entry_id}:${r.matchweek_number}`))
      const roundsWonByEntry = new Map(
        ((totalRows ?? []) as Array<{ entry_id: string; rounds_won: number | null }>)
          .map((r) => [r.entry_id, r.rounds_won ?? 0]),
      )

      const survivors = (survivorRows ?? []) as Array<{ round_id: string; entry_id: string; eliminated_matchweek: number | null }>
      const standingByRound = new Map<string, number>()
      const entrantsByRound = new Map<string, number>()
      const mineByRound = new Map<string, { eliminated_matchweek: number | null }>()
      for (const r of survivors) {
        entrantsByRound.set(r.round_id, (entrantsByRound.get(r.round_id) ?? 0) + 1)
        if (r.eliminated_matchweek === null) {
          standingByRound.set(r.round_id, (standingByRound.get(r.round_id) ?? 0) + 1)
        }
        if (lmsEntryIds.includes(r.entry_id)) mineByRound.set(`${r.round_id}:${r.entry_id}`, r)
      }

      // Club names for the picks on this page only.
      const clubIds = Array.from(new Set(pickRows.map((r) => r.club_id)))
      const clubNameById = new Map<string, string>()
      if (clubIds.length > 0) {
        const { data: clubRows } = await admin
          .from('league_clubs')
          // `league_clubs` names the column `name`; aliased rather than renamed,
          // as every other league read does.
          .select('club_id, club_name:name, short_name')
          .in('club_id', clubIds)
        for (const c of (clubRows ?? []) as Array<{ club_id: string; club_name: string | null; short_name: string | null }>) {
          const label = c.short_name || c.club_name
          if (label) clubNameById.set(c.club_id, shortClubName(label))
        }
      }

      for (const p of lmsPools) {
        const round = roundByPool.get(p.poolId)
        const open = openByPool.get(p.poolId)
        if (!round || !open) continue
        const me = p.entryId as string

        const mine = mineByRound.get(`${round.round_id}:${me}`)
        const isEliminated = !!mine && mine.eliminated_matchweek !== null
        const hasPicked = picked.has(`${round.round_id}:${me}:${open.matchweek_number}`)

        // ⚠ AN ELIMINATED MEMBER READS AS DONE. The old comment here claimed
        // exactly this, but nothing read `league_lms_survivors`, so somebody
        // knocked out in September got `made = 0` — an amber "Pick your club"
        // pill, on a button that sends them to a screen where they cannot pick,
        // every week until the round ends.
        madeByPool.set(p.poolId, isEliminated || hasPicked ? 1 : 0)

        // Both weeks. `pickRows` already holds every matchweek in the round, so
        // naming the second one costs nothing but a find.
        const inPlay = inPlayByPool.get(p.poolId)
        const pickIn = (mw: number | undefined) =>
          mw === undefined
            ? undefined
            : pickRows.find(
                (r) => r.round_id === round.round_id && r.entry_id === me && r.matchweek_number === mw,
              )
        const inPlayPick = pickIn(inPlay?.matchweek_number)
        const openPick = pickIn(open.matchweek_number)

        const facts = out.get(p.poolId)
        if (facts) {
          facts.lms = {
            roundsWon: roundsWonByEntry.get(me) ?? 0,
            roundNumber: round.round_number,
            isEliminated,
            eliminatedMatchweek: mine?.eliminated_matchweek ?? null,
            survivorsLeft: standingByRound.get(round.round_id) ?? 0,
            roundEntrants: entrantsByRound.get(round.round_id) ?? 0,
            inPlayClubName: inPlayPick ? (clubNameById.get(inPlayPick.club_id) ?? null) : null,
            inPlayMatchweek: inPlay?.matchweek_number ?? null,
            openClubName: openPick ? (clubNameById.get(openPick.club_id) ?? null) : null,
            openMatchweek: open.matchweek_number,
          }
        }
      }
    }
  }

  // ---- 2d. Showdown — the duel, the record, and who you play next ----------
  //
  // Showdown pools only. `league_duels` holds unsettled rows from pool creation
  // because the draw is made once, up front — but those rows are SEALED until
  // their matchweek opens for picks (migration 116, R1). The tile shows the OPEN
  // matchweek's duel, which is revealed by definition, so what it displays needs
  // no change.
  //
  // ⚠ GATE B — MIGRATION 116'S POLICY DOES NOT APPLY TO ANY ROW BELOW.
  // This module reads with the SERVICE-ROLE client, which carries `bypassrls`
  // (Supabase: a secret key "authorizes access through the service_role Postgres
  // role, which has the bypassrls attribute"). RLS defends the anon and
  // authenticated paths only. On this path the seal is real only if it is
  // applied here, in TypeScript, and that is what `revealed()` below does.
  //
  // It is defence in depth rather than a fix: nothing downstream currently
  // surfaces a sealed duel. The point is that it stays that way without anyone
  // having to remember — a sealed row never enters the process, so a field added
  // later cannot leak one by accident.
  const showdownPools = pools.filter((p) => p.leagueMode === 'showdown' && p.entryId)
  if (showdownPools.length > 0) {
    const showdownEntryIds = showdownPools.map((p) => p.entryId as string)

    const [{ data: duelRows }, { data: totalRows }] = await Promise.all([
      admin
        .from('league_duels')
        .select('pool_id, matchweek_number, entry_a, entry_b, points_a, points_b, settled_at')
        .in('pool_id', showdownPools.map((p) => p.poolId)),
      // ⚠ The STORED duel points. See the note on ShowdownCardFacts.duelPoints.
      admin
        .from('league_entry_totals')
        .select('entry_id, duel_points')
        .in('entry_id', showdownEntryIds),
    ])

    const duelPointsByEntry = new Map(
      ((totalRows ?? []) as Array<{ entry_id: string; duel_points: number | null }>)
        .map((r) => [r.entry_id, r.duel_points ?? 0]),
    )

    // The TS half of `league_duel_is_revealed` (migration 119): a matchweek's
    // duel opens once the matchweek BEFORE IT has settled, so exactly one duel
    // is live at a time.
    //
    // Ordered by LOCK TIME, never matchweek number — rounds are played out of
    // numerical order, minimum gap −121 days across three real seasons
    // (migration 101). Keyed on `ranks_snapshot_at`, never on a fixture count:
    // a postponed fixture leaves `completed < total` for the rest of the season
    // and would stall the reveal forever (migration 094).
    const revealed = (pool: LeagueCardPool, matchweekNumber: number): boolean => {
      if (!pool.seasonId) return false
      const inLockOrder = (bySeason.get(pool.seasonId) ?? [])
        .filter((m) => m.lock_at !== null)
        .sort((a, b) =>
          new Date(a.lock_at!).getTime() - new Date(b.lock_at!).getTime()
          || a.matchweek_number - b.matchweek_number)
      const i = inLockOrder.findIndex((m) => m.matchweek_number === matchweekNumber)
      if (i === -1) return false
      // The season's first playable matchweek has no predecessor and is open —
      // without that arm a new pool would show nothing, for ever.
      if (i === 0 || inLockOrder[i - 1].ranks_snapshot_at !== null) return true
      // The 24-hour floor (migration 120): a postponed matchweek settles only
      // when the next one LOCKS (094), which would otherwise reveal the
      // opponent at the moment picks close. Never fires in a normal week.
      return new Date(inLockOrder[i].lock_at!).getTime() - 24 * 3600_000 <= now
    }

    // Opponent names. Only the entries actually drawn against somebody on this
    // page, so the IN list stays the size of the page rather than the pool.
    const myDuels = new Map<string, Array<Record<string, unknown>>>()
    const opponentIds = new Set<string>()
    for (const row of (duelRows ?? []) as Array<Record<string, unknown>>) {
      const a = row.entry_a as string
      const b = row.entry_b as string | null
      for (const p of showdownPools) {
        if (p.poolId !== row.pool_id) continue
        if (a !== p.entryId && b !== p.entryId) continue
        if (!revealed(p, row.matchweek_number as number)) continue
        const got = myDuels.get(p.poolId) ?? []
        got.push(row)
        myDuels.set(p.poolId, got)
        const them = a === p.entryId ? b : a
        if (them) opponentIds.add(them)
      }
    }

    const nameByEntry = new Map<string, string>()
    if (opponentIds.size > 0) {
      const { data: nameRows } = await admin
        .from('pool_entries')
        .select('entry_id, entry_name')
        .in('entry_id', Array.from(opponentIds))
      for (const r of (nameRows ?? []) as Array<{ entry_id: string; entry_name: string | null }>) {
        if (r.entry_name) nameByEntry.set(r.entry_id, r.entry_name)
      }
    }

    for (const p of showdownPools) {
      const mine = myDuels.get(p.poolId) ?? []
      const me = p.entryId as string
      const open = openByPool.get(p.poolId)

      let won = 0, tied = 0, lost = 0, byes = 0
      const settled: Array<{ mw: number; outcome: DuelOutcome }> = []

      for (const d of mine) {
        const isA = (d.entry_a as string) === me
        const them = isA ? (d.entry_b as string | null) : (d.entry_a as string)
        const mw = d.matchweek_number as number

        if (!them) {
          // A bye scores nothing and says so (migration 083). Counted, but it is
          // not a result — it must never read as a draw.
          if (d.settled_at) { byes++; settled.push({ mw, outcome: 'bye' }) }
          continue
        }
        if (!d.settled_at) continue

        const mineP = (isA ? d.points_a : d.points_b) as number | null
        if (mineP === 3) { won++; settled.push({ mw, outcome: 'won' }) }
        else if (mineP === 1) { tied++; settled.push({ mw, outcome: 'tied' }) }
        else { lost++; settled.push({ mw, outcome: 'lost' }) }
      }

      // Who you play next: the duel in the OPEN matchweek — the one this member
      // is picking for. Not the in-play one, which is already decided.
      const next = open
        ? mine.find((d) => (d.matchweek_number as number) === open.matchweek_number)
        : undefined
      const nextThem = next
        ? ((next.entry_a as string) === me ? (next.entry_b as string | null) : (next.entry_a as string))
        : null

      settled.sort((x, y) => x.mw - y.mw)

      const facts = out.get(p.poolId)
      if (facts) {
        facts.showdown = {
          duelPoints: duelPointsByEntry.get(me) ?? 0,
          won, tied, lost, byes,
          opponentName: nextThem ? (nameByEntry.get(nextThem) ?? null) : null,
          isBye: !!next && !nextThem,
          duelMatchweek: next ? (next.matchweek_number as number) : null,
          recentDuels: settled.slice(-5).map((r) => r.outcome),
        }
      }
    }
  }

  // ---- 3. assemble ---------------------------------------------------------
  for (const p of pools) {
    const open = openByPool.get(p.poolId)
    const isSingle = SINGLE_DECISION_MODES.has(p.leagueMode ?? '')
    // ⚠ Carried across the rewrite below, which replaces the whole entry.
    const showdown = out.get(p.poolId)?.showdown ?? null
    const lms = out.get(p.poolId)?.lms ?? null
    const table = out.get(p.poolId)?.table ?? null
    const total = isSingle ? 1 : (open?.fixture_count ?? 0)
    const made = madeByPool.get(p.poolId) ?? 0
    out.set(p.poolId, {
      openMatchweekNumber: open?.matchweek_number ?? null,
      inPlayMatchweekNumber: inPlayByPool.get(p.poolId)?.matchweek_number ?? null,
      matchweekCount: (p.seasonId ? bySeason.get(p.seasonId)?.length : 0) ?? 0,
      // Table mode's deadline is its own column and has nothing to do with a
      // matchweek — "one decision, all season" is the whole mode.
      deadlineAt: p.leagueMode === 'table' ? p.tableLockAt : (open?.lock_at ?? null),
      totalPicks: total,
      completedPicks: isSingle ? 0 : (open?.completed_fixture_count ?? 0),
      madePicks: made,
      hasSubmitted: total > 0 && made >= total,
      showdown,
      lms,
      table,
    })
  }

  return out
}
