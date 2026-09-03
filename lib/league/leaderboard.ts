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

/** The champion an entry backed, and where that club actually sits today. */
export type ChampionPick = {
  club_name: string
  crest_url: string | null
  /** NULL before a ball is kicked — the club has no standings row yet. */
  actual_rank: number | null
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
}

export type LeagueLeaderboard = {
  mode: 'pickem' | 'showdown' | 'last_man_standing' | 'table' | null
  /**
   * True once the season-end snapshot exists — the same test
   * `league_table_breakdown` makes (081:81). Until then every total is
   * provisional, and a screen that does not say so is claiming a result.
   */
  is_final: boolean
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
 * @param admin  service-role client — the totals table is deny-all (see header)
 */
export async function readLeagueLeaderboard(
  admin: SupabaseClient,
  poolId: string,
  pool: { league_season_id: string; league_mode: string | null },
): Promise<{ leaderboard: LeagueLeaderboard | null; error: string | null }> {
  const isTable = pool.league_mode === 'table'

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
    return { leaderboard: { mode: normaliseMode(pool.league_mode), is_final: false, rows: [] }, error: null }
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
    return { leaderboard: { mode: normaliseMode(pool.league_mode), is_final: false, rows: [] }, error: null }
  }

  const [totalsRes, finalRes, champions] = await Promise.all([
    // The engine's own output. `previous_final_rank` is what draws the movement
    // arrow, and is why this does not reuse `readEntryTotals` from duels.ts —
    // that one does not select it, and widening a shared helper for one caller
    // is how a column nobody wanted ends up in every duel card.
    admin
      .from('league_entry_totals')
      .select('entry_id, total_points, final_rank, previous_final_rank')
      .eq('pool_id', poolId),
    // Existence only — `head: true` sends no rows back.
    admin
      .from('league_standings_final')
      .select('season_id', { count: 'exact', head: true })
      .eq('season_id', pool.league_season_id),
    isTable ? readChampionPicks(admin, entryIds, pool.league_season_id) : Promise.resolve(new Map()),
  ])

  if (totalsRes.error) return { leaderboard: null, error: `entry totals: ${totalsRes.error.message}` }
  if (finalRes.error) return { leaderboard: null, error: `final standings: ${finalRes.error.message}` }

  const totals = new Map(
    ((totalsRes.data ?? []) as Array<{
      entry_id: string; total_points: number | null
      final_rank: number | null; previous_final_rank: number | null
    }>).map((t) => [t.entry_id, t]),
  )

  const rows: LeagueLeaderboardRow[] = []
  for (const entry of entries) {
    const member = members.get(entry.member_id)
    if (!member) continue
    const t = totals.get(entry.entry_id)
    const champion = champions.get(entry.entry_id) ?? null

    rows.push({
      entry_id: entry.entry_id,
      entry_name: entry.entry_name ?? '',
      entry_number: entry.entry_number ?? 1,
      member_id: entry.member_id,
      user_id: member.user_id,
      full_name: member.users?.full_name ?? 'Unknown',
      username: member.users?.username ?? '',
      total_points: t?.total_points ?? 0,
      current_rank: t?.final_rank ?? null,
      previous_rank: t?.previous_final_rank ?? null,
      // In table mode the ordering IS the entry, so having one is the whole of
      // "has this person played". Other modes pick weekly and the question does
      // not apply, so it is true rather than a false accusation.
      has_filed: isTable ? champion !== null : true,
      champion,
    })
  }

  // Ordered by the engine's rank, which already carries its tiebreaks. Points
  // are the fallback for a pool that has not been scored yet, where every rank
  // is null and any order is as good as any other.
  rows.sort((a, b) => {
    if (a.current_rank != null && b.current_rank != null && a.current_rank !== b.current_rank) {
      return a.current_rank - b.current_rank
    }
    return b.total_points - a.total_points
  })

  return {
    leaderboard: {
      mode: normaliseMode(pool.league_mode),
      is_final: (finalRes.count ?? 0) > 0,
      rows,
    },
    error: null,
  }
}

function normaliseMode(mode: string | null): LeagueLeaderboard['mode'] {
  return mode === 'pickem' || mode === 'showdown' || mode === 'last_man_standing' || mode === 'table'
    ? mode
    : null
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
