import type { createAdminClient } from '@/lib/supabase/server'

type AdminClient = ReturnType<typeof createAdminClient>

// Snapshots current_rank -> previous_rank for every entry in the given pools.
// Shared by the manual admin "set match live" path (/api/pools/snapshot-ranks)
// and the automated sync-fixtures cron, so both produce an identical
// per-matchday baseline for the leaderboard movement (▲/▼) indicator.
//
// Done as a single Postgres statement (snapshot_pool_ranks) rather than a JS
// loop on purpose: snapshotting tournament-wide touches ~5k entries, and a
// PostgREST `.select().in()` would silently cap at 1000 rows (the recurring
// trap in SCALE_PLAN), leaving most pools un-snapshotted. One UPDATE avoids
// both the cap and thousands of per-row round-trips. Returns rows updated.
export async function snapshotPoolRanks(
  admin: AdminClient,
  poolIds: string[],
): Promise<number> {
  if (!poolIds || poolIds.length === 0) return 0
  const { data, error } = await admin.rpc('snapshot_pool_ranks', { p_pool_ids: poolIds })
  if (error) throw new Error(`snapshot_pool_ranks failed: ${error.message}`)
  // Shadow mirror (Phase A Gap 2): freeze shadow final_rank -> previous_final_rank
  // at the SAME matchday-baseline instant, so shadow-read pools show correct
  // ▲/▼ movement. Shadow-only + best-effort — a shadow failure must never break
  // the production snapshot.
  try {
    await admin.rpc('shadow_snapshot_ranks', { p_pool_ids: poolIds })
  } catch {
    /* shadow mirror is best-effort */
  }
  return typeof data === 'number' ? data : 0
}
