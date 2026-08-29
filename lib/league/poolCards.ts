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
}

const EMPTY: LeagueCardFacts = {
  openMatchweekNumber: null,
  inPlayMatchweekNumber: null,
  matchweekCount: 0,
  deadlineAt: null,
  totalPicks: 0,
  completedPicks: 0,
  madePicks: 0,
  hasSubmitted: false,
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
    .select('matchweek_id, matchweek_number, fixture_count, completed_fixture_count, lock_at, first_kickoff_at, season_id')
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
    const { data: tblData } = await admin
      .from('league_table_predictions')
      .select('entry_id')
      .in('entry_id', tablePools.map((p) => p.entryId as string))
    const hasOrder = new Set(((tblData ?? []) as Array<{ entry_id: string }>).map((r) => r.entry_id))
    for (const p of tablePools) madeByPool.set(p.poolId, hasOrder.has(p.entryId as string) ? 1 : 0)
  }

  // 2c. Last Man Standing — one club for the open matchweek, in the open round.
  //     A member already eliminated has nothing to pick, and correctly reads as
  //     done rather than as owing a decision.
  const lmsPools = single.filter((p) => p.leagueMode === 'last_man_standing' && p.entryId)
  if (lmsPools.length > 0) {
    const { data: roundData } = await admin
      .from('league_lms_rounds')
      .select('round_id, pool_id')
      .in('pool_id', lmsPools.map((p) => p.poolId))
      .is('last_matchweek', null)
    const roundByPool = new Map(
      ((roundData ?? []) as Array<{ round_id: string; pool_id: string }>).map((r) => [r.pool_id, r.round_id]),
    )
    const roundIds = Array.from(new Set(roundByPool.values()))
    if (roundIds.length > 0) {
      const { data: lmsPicks } = await admin
        .from('league_lms_picks')
        .select('round_id, entry_id, matchweek_number')
        .in('round_id', roundIds)
        .in('entry_id', lmsPools.map((p) => p.entryId as string))
      const picked = new Set(
        ((lmsPicks ?? []) as Array<{ round_id: string; entry_id: string; matchweek_number: number }>).map(
          (r) => `${r.round_id}:${r.entry_id}:${r.matchweek_number}`,
        ),
      )
      for (const p of lmsPools) {
        const roundId = roundByPool.get(p.poolId)
        const open = openByPool.get(p.poolId)
        if (!roundId || !open) continue
        madeByPool.set(p.poolId, picked.has(`${roundId}:${p.entryId}:${open.matchweek_number}`) ? 1 : 0)
      }
    }
  }

  // ---- 3. assemble ---------------------------------------------------------
  for (const p of pools) {
    const open = openByPool.get(p.poolId)
    const isSingle = SINGLE_DECISION_MODES.has(p.leagueMode ?? '')
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
    })
  }

  return out
}
