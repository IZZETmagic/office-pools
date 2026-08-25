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
