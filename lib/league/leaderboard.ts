// =============================================================
// LEAGUE LEADERBOARD — the stored numbers, handed over unchanged
// =============================================================
// `/api/pools/:id/leaderboard` is the World Cup's leaderboard and has been since
// it was written: it reads `matches`, `teams` and `match_conduct` for the pool's
// `tournament_id`, then assembles rows out of `pool_entries`. A league pool has
// a placeholder tournament carrying zero matches and writes none of those entry
// columns, so every league entry came back as a confident zero — 0 points, rank
// null, "0 + 0", "0 exact · 0%", five grey form dots — while the real scores sat
// in `league_entry_totals`. Verified on production 2026-09-02: the six entries in
// "Predict the Table" scored 840/820/580/400/340/0 and mobile showed six zeros.
//
// ## This module computes nothing
//
// `league_score_table` (080/089/093) already priced every entry and wrote the
// total, the rank and the previous rank. Recomputing any of it here would be a
// second owner for a number that has one — the failure mode that made a member's
// level disagree between web and phone. Every field below is a column read.
//
// The champion pick is the one field that joins rather than reads flat, and it
// is still stored state: position 1 of the entry's saved ordering, against the
// club's current rank in the ingested table. No arithmetic, and in particular no
// re-derivation of rank from points — `league_standings` is INGESTED, so a table
// recomputed from points cannot see a points deduction.
//
// ## Why admin, and why that is not lax
//
// `league_entry_totals` is one of migration 050's four deny-all tables: RLS on,
// zero policies. A user-scoped read returns `[]` with `error: null`, so it looks
// like an empty pool rather than a refusal — see `denyAllTables.guard.test.ts`.
// Callers prove membership with the CALLER's client first, then pass the admin
// client here, which is the order `/duel-live`, `/live` and `/league` all use.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { inPlayMatchweekId, openMatchweekId, type MatchweekRow } from './read'

/** The champion an entry backed, and where that club actually sits today. */
export type ChampionPick = {
  club_name: string
  crest_url: string | null
  /** NULL before a ball is kicked — the club has no standings row yet. */
  actual_rank: number | null
}

/**
 * Where one entry stands in Last Man Standing.
 *
 * ⚠ THE STORED RANK IS USELESS IN THIS MODE, AND THAT IS WHY THIS BLOCK EXISTS.
 * `league_finalize_ranks` (121) is the one rank writer for all four modes and
 * orders on `rounds_won → duel_points → total_points → exact_count →
 * correct_count → bonus_points → first league_prediction → entry_id`. In LMS
 * every rung is zero — there are no points in the mode — and the "first pick"
 * rung is `infinity`, because LMS picks live in `league_lms_picks`, not in
 * `league_predictions`. The whole cascade falls through to `entry_id ASC`.
 *
 * Verified on production 2026-09-03: all ten ranks in the LMS pool matched
 * entry_id order exactly, which put three eliminated members above a survivor.
 * A leaderboard built on `current_rank` would have shipped that, so this mode
 * carries its own state and `current_rank` is nulled out below.
 */
export type LmsRowState = {
  /**
   * NULL means still standing. Otherwise the matchweek whose RESULT knocked them
   * out — not the one they failed to pick in, so the record reads as a football
   * event rather than an administrative one (086:64).
   */
  eliminated_matchweek: number | null
  /**
   * Took the round `LmsRoundMeta` describes. Only ever true once that round has
   * closed, and a closing round opens the next one in the SAME transaction
   * (087:266) — so in practice this is true only at the end of a season.
   */
  is_round_winner: boolean
  /**
   * FALSE for someone who is not in this round at all: they joined after it
   * opened and enter the next one, because everybody already in it has spent
   * clubs and a newcomer with a full twenty would have an advantage nobody else
   * had. ⚠ That is NOT being eliminated and must not render as one.
   */
  in_round: boolean
  /**
   * Rounds taken this season — `league_entry_totals.rounds_won`, the season
   * score for this mode.
   *
   * ⚠ It is the ENTIRE memory of a round. Closing a round opens the next one in
   * the same transaction, so survival resets to "everybody back in" immediately
   * and nothing else on this screen records that the round ever happened.
   */
  rounds_won: number
  /**
   * The club they are backing in the matchweek named by `LmsRoundMeta`.
   *
   * NULL means one of two different things, and `pick_sealed` is what tells
   * them apart: sealed, or genuinely not picked.
   */
  pick: { club_name: string; crest_url: string | null } | null
  /**
   * ⚠ THE SEAL. Migration 086: *"showing it early would let the pool copy the
   * best player."* A rival's club is visible only once that matchweek has
   * LOCKED; your own always is.
   *
   * The database enforces this with two SELECT policies on `league_lms_picks`,
   * but this reader runs on the ADMIN client — which walks straight past them.
   * So the rule is applied here in code, and getting it wrong leaks every live
   * pick in the pool. See `readLmsRound`.
   */
  pick_sealed: boolean
}

/** The round that every `LmsRowState` on this leaderboard is describing. */
export type LmsRoundMeta = {
  round_number: number
  first_matchweek: number
  /** NULL while the round is still running. */
  last_matchweek: number | null
  /** Still standing. */
  standing: number
  /** Everybody in the round — NOT the pool's member count, which can be higher. */
  in_round: number
  /**
   * The matchweek every row's `pick` is for. NULL when the season has no
   * matchweek left to play.
   *
   * ⚠ IN PLAY LEADS, OPEN FOLLOWS — the same rule `matchweekTile` applies, and
   * the reason it exists. From Friday to Monday the week being WATCHED and the
   * week you can still PICK for are different weeks, and a leaderboard that
   * names next weekend's club while this weekend decides who survives is
   * describing the wrong game. Reproduced in production once already: a card
   * read "Hull City" while Arsenal was the club actually playing.
   */
  pick_matchweek: number | null
  /** True when `pick_matchweek` is being played rather than waiting to be picked. */
  pick_in_play: boolean
  /**
   * Whether `pick_matchweek` has locked. Once it has, every pick in it is
   * public — which is why a leaderboard fills with crests during the football
   * and shows mostly padlocks between matchweeks.
   */
  pick_revealed: boolean
}

/**
 * One league leaderboard row.
 *
 * ⚠ It deliberately carries NONE of the World Cup extras — `match_points`,
 * `bonus_points`, `last_five`, `level`, `hit_rate`, `exact_count`. They are not
 * zero for a league entry, they are absent: nothing writes them, and a zero on
 * screen is a claim. The mobile type mirrors this, so a component that reaches
 * for one fails to compile rather than rendering it.
 */
export type LeagueLeaderboardRow = {
  entry_id: string
  entry_name: string
  entry_number: number
  member_id: string
  user_id: string
  full_name: string
  username: string
  total_points: number
  /**
   * ⚠ NULL IN LAST MAN STANDING, deliberately. The stored `final_rank` is
   * entry_id order there (see `LmsRowState`), so handing it over would be
   * handing over a wrong answer that looks like a right one. Read `lms` instead.
   */
  current_rank: number | null
  previous_rank: number | null
  /**
   * Table mode: did this entry file an ordering before the deadline? Someone who
   * joined late or never picked scores nothing, and "0" alone reads as "played
   * badly" rather than "never played".
   */
  has_filed: boolean
  /** Table mode only; null in every other mode and for an entry that never filed. */
  champion: ChampionPick | null
  /** Last Man Standing only; null in every other mode. */
  lms: LmsRowState | null
}

export type LeagueLeaderboard = {
  mode: 'pickem' | 'showdown' | 'last_man_standing' | 'table' | null
  /**
   * True once the season-end snapshot exists — the same test
   * `league_table_breakdown` makes (081:81). Until then every total is
   * provisional, and a screen that does not say so is claiming a result.
   */
  is_final: boolean
  /**
   * Last Man Standing only. NULL in every other mode, and null in an LMS pool
   * that has no round yet — which is a real state (the pool is created before
   * `league_lms_open_round` runs) and not a failure.
   */
  lms: LmsRoundMeta | null
  rows: LeagueLeaderboardRow[]
}

type MemberRow = {
  member_id: string
  user_id: string
  users: { user_id: string; username: string | null; full_name: string | null } | null
}

/**
 * Assemble a league pool's leaderboard from stored rows.
 *
 * @param admin           service-role client — the totals table is deny-all (see header)
 * @param viewerMemberId  who is asking. ⚠ Last Man Standing only, and load-bearing
 *                        there: it is what decides whose sealed pick may be shown,
 *                        a rule the admin client cannot enforce for itself.
 */
export async function readLeagueLeaderboard(
  admin: SupabaseClient,
  poolId: string,
  pool: { league_season_id: string; league_mode: string | null },
  viewerMemberId: string | null = null,
): Promise<{ leaderboard: LeagueLeaderboard | null; error: string | null }> {
  const isTable = pool.league_mode === 'table'
  const isLms = pool.league_mode === 'last_man_standing'

  const { data: memberRows, error: memberErr } = await admin
    .from('pool_members')
    .select('member_id, user_id, users(user_id, username, full_name)')
    .eq('pool_id', poolId)
  if (memberErr) return { leaderboard: null, error: `pool members: ${memberErr.message}` }

  const members = new Map<string, MemberRow>()
  for (const m of (memberRows ?? []) as unknown as MemberRow[]) {
    members.set(m.member_id, m)
  }
  if (members.size === 0) {
    return {
      leaderboard: { mode: normaliseMode(pool.league_mode), is_final: false, lms: null, rows: [] },
      error: null,
    }
  }

  // ⚠ `retired_at` filtered. Only two filters in the product carry it and this
  // is deliberately one of them — a retired entry is soft-deleted, and listing
  // it on the leaderboard is the thing the soft delete exists to avoid.
  const { data: entryRows, error: entryErr } = await admin
    .from('pool_entries')
    .select('entry_id, member_id, entry_name, entry_number')
    .in('member_id', [...members.keys()])
    .is('retired_at', null)
  if (entryErr) return { leaderboard: null, error: `pool entries: ${entryErr.message}` }

  const entries = (entryRows ?? []) as Array<{
    entry_id: string; member_id: string; entry_name: string | null; entry_number: number | null
  }>
  const entryIds = entries.map((e) => e.entry_id)
  if (entryIds.length === 0) {
    return {
      leaderboard: { mode: normaliseMode(pool.league_mode), is_final: false, lms: null, rows: [] },
      error: null,
    }
  }

  const [totalsRes, finalRes, champions, lmsRound] = await Promise.all([
    // The engine's own output. `previous_final_rank` is what draws the movement
    // arrow, and is why this does not reuse `readEntryTotals` from duels.ts —
    // that one does not select it, and widening a shared helper for one caller
    // is how a column nobody wanted ends up in every duel card.
    admin
      .from('league_entry_totals')
      .select('entry_id, total_points, rounds_won, final_rank, previous_final_rank')
      .eq('pool_id', poolId),
    // Existence only — `head: true` sends no rows back.
    admin
      .from('league_standings_final')
      .select('season_id', { count: 'exact', head: true })
      .eq('season_id', pool.league_season_id),
    isTable ? readChampionPicks(admin, entryIds, pool.league_season_id) : Promise.resolve(new Map()),
    isLms
      ? readLmsRound(
          admin,
          poolId,
          pool.league_season_id,
          // The viewer's own entries. A pool can hold more than one per member,
          // and every one of them is theirs to see.
          new Set(entries.filter((e) => e.member_id === viewerMemberId).map((e) => e.entry_id)),
        )
      : Promise.resolve(null),
  ])

  if (totalsRes.error) return { leaderboard: null, error: `entry totals: ${totalsRes.error.message}` }
  if (finalRes.error) return { leaderboard: null, error: `final standings: ${finalRes.error.message}` }
  if (lmsRound?.error) return { leaderboard: null, error: lmsRound.error }

  const totals = new Map(
    ((totalsRes.data ?? []) as Array<{
      entry_id: string; total_points: number | null; rounds_won: number | null
      final_rank: number | null; previous_final_rank: number | null
    }>).map((t) => [t.entry_id, t]),
  )

  const rows: LeagueLeaderboardRow[] = []
  for (const entry of entries) {
    const member = members.get(entry.member_id)
    if (!member) continue
    const t = totals.get(entry.entry_id)
    const champion = champions.get(entry.entry_id) ?? null
    const survivor = lmsRound?.survivors.get(entry.entry_id)

    rows.push({
      entry_id: entry.entry_id,
      entry_name: entry.entry_name ?? '',
      entry_number: entry.entry_number ?? 1,
      member_id: entry.member_id,
      user_id: member.user_id,
      full_name: member.users?.full_name ?? 'Unknown',
      username: member.users?.username ?? '',
      total_points: t?.total_points ?? 0,
      // ⚠ Withheld in LMS. See `LmsRowState` — the stored rank there is entry_id
      // order, and passing it on is passing on a wrong answer that looks right.
      current_rank: isLms ? null : t?.final_rank ?? null,
      previous_rank: isLms ? null : t?.previous_final_rank ?? null,
      // In table mode the ordering IS the entry, so having one is the whole of
      // "has this person played". Other modes pick weekly and the question does
      // not apply, so it is true rather than a false accusation.
      has_filed: isTable ? champion !== null : true,
      champion,
      lms: isLms
        ? {
            eliminated_matchweek: survivor?.eliminated_matchweek ?? null,
            is_round_winner: survivor?.is_winner ?? false,
            // No survivor row means they are not in this round — see the type.
            in_round: survivor !== undefined,
            rounds_won: t?.rounds_won ?? 0,
            pick: lmsRound?.picks.get(entry.entry_id) ?? null,
            // ⚠ Sealed is about the WEEK and about WHOSE row this is — never
            // about the row happening to have no pick. A rival with nothing to
            // show and a rival who has not picked are the same blank to you, and
            // that IS the seal. But your own blank is never sealed: you can
            // always see your own pick, so its absence means you have not made
            // one, and telling you it is "hidden" would hide it from yourself.
            pick_sealed:
              (lmsRound?.meta?.pick_matchweek ?? null) !== null &&
              lmsRound?.meta?.pick_revealed === false &&
              entry.member_id !== viewerMemberId,
          }
        : null,
    })
  }

  rows.sort(isLms ? compareLms : compareByRank)

  return {
    leaderboard: {
      mode: normaliseMode(pool.league_mode),
      is_final: (finalRes.count ?? 0) > 0,
      lms: lmsRound?.meta ? { ...lmsRound.meta, standing: countStanding(rows), in_round: countInRound(rows) } : null,
      rows,
    },
    error: null,
  }
}

/**
 * Ordered by the engine's rank, which already carries its tiebreaks. Points are
 * the fallback for a pool that has not been scored yet, where every rank is null
 * and any order is as good as any other.
 */
function compareByRank(a: LeagueLeaderboardRow, b: LeagueLeaderboardRow): number {
  if (a.current_rank != null && b.current_rank != null && a.current_rank !== b.current_rank) {
    return a.current_rank - b.current_rank
  }
  return b.total_points - a.total_points
}

/**
 * Last Man Standing's own ordering. Ryan's call, 2026-09-03: **the season leads
 * and the round's state rides on the row.**
 *
 *   1. `rounds_won` DESC — the season score, and the only thing that survives a
 *      round closing. A two-time winner leads the pool even in a week they are
 *      out; the row says `OUT · MW6` so that cannot read as a claim to be alive.
 *   2. Still standing, then eliminated, then not in this round. Someone who
 *      joined mid-round has not played it and sits below those who have — they
 *      are not eliminated and the screen says so.
 *   3. Later elimination first. Lasting to MW9 beat going out in MW3.
 *   4. Name, then `entry_id` for a total order — so an unrelated re-score never
 *      reshuffles the list.
 *
 * ⚠ In round one every `rounds_won` is 0, so this collapses to pure survival
 * order. That is the common case and it is meant to look like the simple thing.
 *
 * ⚠ It does NOT re-rank anything: no number is computed from another number.
 * This is a presentation order over stored state, which is why nothing here
 * writes back and why `league_finalize_ranks` is left alone — it is the one rank
 * writer for four modes and giving LMS a survival rung restates rank in all of
 * them. That is its own change, deliberately not made here.
 */
export function compareLms(a: LeagueLeaderboardRow, b: LeagueLeaderboardRow): number {
  const x = a.lms
  const y = b.lms
  if (!x || !y) return 0

  if (x.rounds_won !== y.rounds_won) return y.rounds_won - x.rounds_won

  const group = (s: LmsRowState) => (!s.in_round ? 2 : s.eliminated_matchweek === null ? 0 : 1)
  const gx = group(x)
  const gy = group(y)
  if (gx !== gy) return gx - gy

  // Both out: whoever lasted longer is above. Both alive or both absent: 0.
  const mx = x.eliminated_matchweek ?? 0
  const my = y.eliminated_matchweek ?? 0
  if (mx !== my) return my - mx

  const nameA = (a.entry_name?.trim() || a.full_name).toLowerCase()
  const nameB = (b.entry_name?.trim() || b.full_name).toLowerCase()
  if (nameA !== nameB) return nameA < nameB ? -1 : 1
  return a.entry_id < b.entry_id ? -1 : 1
}

function countStanding(rows: LeagueLeaderboardRow[]): number {
  return rows.filter((r) => r.lms?.in_round && r.lms.eliminated_matchweek === null).length
}

function countInRound(rows: LeagueLeaderboardRow[]): number {
  return rows.filter((r) => r.lms?.in_round).length
}

function normaliseMode(mode: string | null): LeagueLeaderboard['mode'] {
  return mode === 'pickem' || mode === 'showdown' || mode === 'last_man_standing' || mode === 'table'
    ? mode
    : null
}

/**
 * The round this leaderboard describes, and who is left in it.
 *
 * ⚠ "The round" is the OPEN one — `last_matchweek IS NULL` — and falls back to
 * the highest-numbered one when none is open. That fallback is not a between-
 * rounds case: `league_lms_settle` opens the next round in the same transaction
 * that closes one (087:266), so the only pool with no open round is one whose
 * season has run out of matchweeks, or one created but never opened. Both want
 * the last round that was actually played rather than an empty screen.
 *
 * ⚠ A member with no row here is NOT eliminated — they joined after the round
 * opened and enter the next one. Reading a missing row as "out" would accuse
 * somebody of losing a round they were never allowed to play.
 */
async function readLmsRound(
  admin: SupabaseClient,
  poolId: string,
  seasonId: string,
  ownEntryIds: Set<string>,
): Promise<{
  meta: Omit<LmsRoundMeta, 'standing' | 'in_round'> | null
  survivors: Map<string, { eliminated_matchweek: number | null; is_winner: boolean }>
  picks: Map<string, { club_name: string; crest_url: string | null }>
  error: string | null
}> {
  const empty = { meta: null, survivors: new Map(), picks: new Map(), error: null }

  const { data: rounds, error: rErr } = await admin
    .from('league_lms_rounds')
    .select('round_id, round_number, first_matchweek, last_matchweek')
    .eq('pool_id', poolId)
    .order('round_number', { ascending: false })
  // Surfaced, not swallowed: an empty survivor map renders as "nobody is in this
  // round", which is the confident-zero shape this codebase keeps paying for.
  if (rErr) return { ...empty, error: `lms rounds: ${rErr.message}` }

  const all = (rounds ?? []) as Array<{
    round_id: string; round_number: number; first_matchweek: number; last_matchweek: number | null
  }>
  const round = all.find((r) => r.last_matchweek === null) ?? all[0]
  if (!round) return empty

  const [survivorsRes, weeksRes] = await Promise.all([
    admin
      .from('league_lms_survivors')
      .select('entry_id, eliminated_matchweek, is_winner')
      .eq('round_id', round.round_id),
    // The same columns `openMatchweekId` and `inPlayMatchweekId` read. Both are
    // imported rather than re-derived: "the next one by number" is wrong — a
    // whole round can be moved, so round N is not always played before N+1.
    admin
      .from('league_matchweeks')
      .select(
        'matchweek_id, matchweek_number, fixture_count, completed_fixture_count, lock_at, first_kickoff_at, ranks_snapshot_at',
      )
      .eq('season_id', seasonId),
  ])
  if (survivorsRes.error) return { ...empty, error: `lms survivors: ${survivorsRes.error.message}` }
  if (weeksRes.error) return { ...empty, error: `matchweeks: ${weeksRes.error.message}` }

  const survivors = new Map<string, { eliminated_matchweek: number | null; is_winner: boolean }>()
  for (const s of (survivorsRes.data ?? []) as Array<{
    entry_id: string; eliminated_matchweek: number | null; is_winner: boolean
  }>) {
    survivors.set(s.entry_id, { eliminated_matchweek: s.eliminated_matchweek, is_winner: s.is_winner })
  }

  // ---- which matchweek the crests are for ---------------------------------
  const weeks = (weeksRes.data ?? []) as MatchweekRow[]
  const now = Date.now()
  const inPlay = weeks.find((w) => w.matchweek_id === inPlayMatchweekId(weeks, now)) ?? null
  const open = weeks.find((w) => w.matchweek_id === openMatchweekId(weeks, now)) ?? null

  // ⚠ FALL BACK, NEVER ACCUSE. A round can open on the week AFTER the one still
  // being played — 106's re-homing makes that ordinary — and in that case nobody
  // in the round has an in-play pick and none of them missed anything. Naming a
  // week the round does not cover would paint every survivor as having failed to
  // pick, so it is skipped rather than reported empty.
  const showInPlay = inPlay !== null && inPlay.matchweek_number >= round.first_matchweek
  const week = showInPlay ? inPlay : open
  const meta = {
    round_number: round.round_number,
    first_matchweek: round.first_matchweek,
    last_matchweek: round.last_matchweek,
    pick_matchweek: week?.matchweek_number ?? null,
    pick_in_play: showInPlay,
    // In play means locked, by definition — the two can never be the same week.
    pick_revealed: showInPlay,
  }
  if (!week) return { meta, survivors, picks: new Map(), error: null }

  const { data: pickRows, error: pErr } = await admin
    .from('league_lms_picks')
    .select('entry_id, club_id, league_clubs(name, crest_url)')
    .eq('round_id', round.round_id)
    .eq('matchweek_number', week.matchweek_number)
  if (pErr) return { ...empty, error: `lms picks: ${pErr.message}` }

  const picks = new Map<string, { club_name: string; crest_url: string | null }>()
  for (const p of (pickRows ?? []) as unknown as Array<{
    entry_id: string
    league_clubs: { name: string | null; crest_url: string | null } | null
  }>) {
    // ⚠⚠ THE SEAL, APPLIED IN CODE BECAUSE ADMIN BYPASSES RLS. Migration 086
    // gives `league_lms_picks` two SELECT policies — your own always, everyone
    // else's only once the matchweek has locked — and this client honours
    // neither. Dropping this line publishes every live pick in the pool to
    // everybody in it, which is the one thing the mode cannot survive.
    if (!meta.pick_revealed && !ownEntryIds.has(p.entry_id)) continue
    // PostgREST types an embedded to-one either way depending on how it infers
    // the relationship — normalise rather than trust.
    const club = Array.isArray(p.league_clubs) ? p.league_clubs[0] ?? null : p.league_clubs
    picks.set(p.entry_id, {
      club_name: club?.name ?? 'Unknown club',
      crest_url: club?.crest_url ?? null,
    })
  }

  return { meta, survivors, picks, error: null }
}

/**
 * Who each entry backed to win it, and where that club sits now.
 *
 * Two flat reads and a join in memory over at most (entries + clubs) rows — the
 * alternative, a per-entry RPC call, is one round trip per member for a fact
 * that is one row each.
 */
async function readChampionPicks(
  admin: SupabaseClient,
  entryIds: string[],
  seasonId: string,
): Promise<Map<string, ChampionPick>> {
  const [picksRes, standingsRes] = await Promise.all([
    admin
      .from('league_table_predictions')
      .select('entry_id, club_id, league_clubs(name, crest_url)')
      .in('entry_id', entryIds)
      .eq('predicted_position', 1),
    // Ingested, never derived: the feed's rank is the rank. Recomputing it from
    // points cannot see a points deduction, which is why this reads the column.
    admin.from('league_standings').select('club_id, rank').eq('season_id', seasonId),
  ])

  if (picksRes.error || standingsRes.error) {
    // Not fatal — the leaderboard is still true without the sub-line, and a
    // champion that failed to load must not take the scores down with it.
    console.error('[league leaderboard] champion picks failed:', picksRes.error ?? standingsRes.error)
    return new Map()
  }

  const rankByClub = new Map(
    ((standingsRes.data ?? []) as Array<{ club_id: string; rank: number | null }>)
      .map((s) => [s.club_id, s.rank]),
  )

  const out = new Map<string, ChampionPick>()
  for (const p of (picksRes.data ?? []) as unknown as Array<{
    entry_id: string
    club_id: string
    league_clubs: { name: string | null; crest_url: string | null } | null
  }>) {
    // PostgREST returns an embedded to-one as an object, but types it either way
    // depending on how it infers the relationship — normalise rather than trust.
    const club = Array.isArray(p.league_clubs) ? p.league_clubs[0] ?? null : p.league_clubs
    out.set(p.entry_id, {
      club_name: club?.name ?? 'Unknown club',
      crest_url: club?.crest_url ?? null,
      actual_rank: rankByClub.get(p.club_id) ?? null,
    })
  }
  return out
}
