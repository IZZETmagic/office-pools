// =============================================================
// SHOWDOWN — keeping the fixture list in step with the pool
// =============================================================
// The schedule is a published round-robin (migration 083), which means it has to
// be regenerated whenever the set of entries changes: someone joins, someone
// leaves, someone stops participating. A fixture list that still names a member
// who left is worse than no fixture list.
//
// One helper, called from every door, because the alternative is four call sites
// that each remember three-quarters of the rule. The generator itself is in SQL
// and never rewrites a settled duel, so calling this more often than necessary
// is harmless — which is exactly what you want from something wired into four
// unrelated routes.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type ScheduleResult = {
  written: number
  skipped: string | null
  error: string | null
}

/**
 * Rebuild the unplayed remainder of a Showdown pool's fixture list.
 *
 * A no-op for every other mode — the SQL returns `not a showdown pool` — so
 * callers do not need to know what kind of pool they are looking at.
 */
export async function regenerateDuelSchedule(
  admin: SupabaseClient,
  poolId: string,
): Promise<ScheduleResult> {
  const { data, error } = await admin.rpc('league_generate_duel_schedule', { p_pool_id: poolId })
  if (error) return { written: 0, skipped: null, error: error.message }
  const r = (data ?? {}) as { written?: number; skipped?: string }
  return { written: r.written ?? 0, skipped: r.skipped ?? null, error: null }
}

export type DuelRow = {
  duel_id: string
  matchweek_number: number
  entry_a: string
  entry_b: string | null
  accuracy_a: number | null
  accuracy_b: number | null
  points_a: number | null
  points_b: number | null
  settled_at: string | null
}

/** Every duel in a pool — the fixture list and the results are the same rows. */
export async function readPoolDuels(
  supabase: SupabaseClient,
  poolId: string,
): Promise<{ duels: DuelRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('league_duels')
    .select('duel_id, matchweek_number, entry_a, entry_b, accuracy_a, accuracy_b, points_a, points_b, settled_at')
    .eq('pool_id', poolId)
    .order('matchweek_number')
  if (error) return { duels: [], error: error.message }
  return { duels: (data ?? []) as DuelRow[], error: null }
}

/**
 * Lifetime head-to-head between two entries, from the settled duels.
 *
 * ⚠ The concept's SECOND tiebreak — lifetime H2H between tied players — is
 * deliberately NOT wired into `league_finalize_ranks`. It is pairwise, so it
 * cannot be expressed as a sort key over a single row, and approximating it
 * would quietly pick a different champion. This surfaces the record for display;
 * the tiebreak itself is recorded as owed.
 */
export function headToHead(duels: DuelRow[], entryA: string, entryB: string) {
  let won = 0, drawn = 0, lost = 0
  for (const d of duels) {
    if (!d.settled_at || !d.entry_b) continue
    const isPair =
      (d.entry_a === entryA && d.entry_b === entryB) ||
      (d.entry_a === entryB && d.entry_b === entryA)
    if (!isPair) continue
    const mine = d.entry_a === entryA ? d.points_a : d.points_b
    if (mine === 3) won++
    else if (mine === 1) drawn++
    else lost++
  }
  return { won, drawn, lost }
}

/**
 * Live points per entry for one matchweek — the running duel score.
 *
 * ⚠ NOT `league_duels.accuracy_a/_b`. Those are written by `league_score_duels`
 * when the matchweek settles, so through the weekend — the one time anybody is
 * watching — they are NULL. Reading them is why the duel card showed two names
 * and no numbers while the games were being played.
 *
 * ⚠ TAKES THE ADMIN CLIENT, AND MUST. `league_match_scores` is DENY-ALL — RLS
 * on, zero policies — and migration 050 lists it as one of exactly four engine
 * tables deliberately closed to clients (with `league_entry_totals`,
 * `league_fixture_state`, `league_score_events`). A user-scoped read returns
 * ZERO ROWS AND NO ERROR, so the duel card renders 0 – 0 and looks like a pool
 * where nobody has scored. Found exactly that way.
 *
 * Safe because this is a server component that has already established the
 * viewer is a member of the pool, and the query is scoped to that pool.
 *
 * Summed in TypeScript rather than SQL because PostgREST has no GROUP BY. The
 * row count is entries × fixtures — 100 for a ten-person Premier League pool —
 * so it is nowhere near the 1,000-row cap, but it does grow with both, and a
 * 40-entry pool would be 400. If that ever becomes a real shape this wants to be
 * an RPC rather than a bigger `.range()`.
 */
export async function readMatchweekPoints(
  admin: SupabaseClient,
  poolId: string,
  matchweekNumber: number,
): Promise<{
  points: Map<string, number>
  scored: Map<string, number>
  /** entry_id → fixture_number → points, for the fixture-by-fixture breakdown. */
  perFixture: Map<string, Map<number, number>>
  error: string | null
}> {
  const { data, error } = await admin
    .from('league_match_scores')
    .select('entry_id, total_points, fixture_number')
    .eq('pool_id', poolId)
    .eq('matchweek_number', matchweekNumber)
  if (error) {
    return { points: new Map(), scored: new Map(), perFixture: new Map(), error: error.message }
  }

  const points = new Map<string, number>()
  const scored = new Map<string, number>()
  const perFixture = new Map<string, Map<number, number>>()
  for (const r of (data ?? []) as Array<{ entry_id: string; total_points: number | null; fixture_number: number }>) {
    points.set(r.entry_id, (points.get(r.entry_id) ?? 0) + (r.total_points ?? 0))
    scored.set(r.entry_id, (scored.get(r.entry_id) ?? 0) + 1)
    const byFixture = perFixture.get(r.entry_id) ?? new Map<number, number>()
    byFixture.set(r.fixture_number, r.total_points ?? 0)
    perFixture.set(r.entry_id, byFixture)
  }
  return { points, scored, perFixture, error: null }
}

export type EntryTotals = {
  totalPoints: number
  rank: number | null
  duelPoints: number
  correct: number
  /** Last Man Standing. Zero for every other mode. */
  roundsWon: number
}

/**
 * Season totals per entry — points, rank, duel points, rounds won.
 *
 * Shared by Showdown and Last Man Standing: one row per entry carries both
 * modes' currencies, so both read it here rather than each writing its own
 * query against a deny-all table and getting the client wrong separately.
 *
 * ⚠ ADMIN CLIENT, for the same reason as `readMatchweekPoints`:
 * `league_entry_totals` is one of migration 050's four DENY-ALL engine tables,
 * so a user-scoped read returns zero rows and no error.
 *
 * That is not hypothetical. The pool page read this table with the user client
 * for `duel_points`, so `DuelsTab` has been receiving an empty map and falling
 * back to recomputing `w*3+d` itself — which is exactly the divergence
 * `ShowdownCardFacts.duelPoints` warns about, sitting one settled matchweek
 * away from two screens disagreeing about the same number.
 */
export async function readEntryTotals(
  admin: SupabaseClient,
  poolId: string,
): Promise<{ totals: Map<string, EntryTotals>; error: string | null }> {
  const { data, error } = await admin
    .from('league_entry_totals')
    .select('entry_id, total_points, final_rank, duel_points, correct_count, rounds_won')
    .eq('pool_id', poolId)
  if (error) return { totals: new Map(), error: error.message }

  const totals = new Map<string, EntryTotals>()
  for (const r of (data ?? []) as Array<{
    entry_id: string; total_points: number | null; final_rank: number | null
    duel_points: number | null; correct_count: number | null; rounds_won: number | null
  }>) {
    totals.set(r.entry_id, {
      totalPoints: r.total_points ?? 0,
      rank: r.final_rank,
      duelPoints: r.duel_points ?? 0,
      correct: r.correct_count ?? 0,
      roundsWon: r.rounds_won ?? 0,
    })
  }
  return { totals, error: null }
}
