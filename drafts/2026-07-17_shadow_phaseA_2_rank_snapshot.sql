-- ============================================================================
-- Phase A · Gap 2 — shadow rank-movement snapshot  (shadow-only DB; +1 TS wire)
-- ============================================================================
-- WHY: prod freezes current_rank -> previous_rank at each matchday baseline via
-- snapshot_pool_ranks(p_pool_ids) (called from the sync-fixtures cron when a
-- match goes live and none was live before, and from POST /api/pools/snapshot-
-- ranks). The ▲/▼ movement arrows + Biggest Climber/Faller superlatives read
-- previous_rank. shadow_finalize_totals only ever recomputes final_rank fresh —
-- shadow has NO previous-rank snapshot, so movement would be wrong under
-- shadow-read. This adds the mirror: previous_final_rank + shadow_snapshot_ranks,
-- fired in lockstep with prod's snapshot.
--
-- final_rank  <-> prod current_rank   (same tiebreakers, proven at parity)
-- previous_final_rank <-> prod previous_rank
--
-- IMPACT: shadow-only. New nullable column + new fn. shadow_finalize_totals does
-- NOT touch previous_final_rank (its ON CONFLICT SET list omits it), so the
-- snapshot value is preserved between baselines. REVERSIBLE: drop column + fn.
-- ============================================================================

-- 1) Snapshot column (nullable, additive) -------------------------------------
ALTER TABLE public.shadow_entry_totals
  ADD COLUMN IF NOT EXISTS previous_final_rank integer;

-- Seed so shadow-read pools render move=0 until the first real baseline
-- (mirrors prod, where previous_rank is set at the first snapshot).
UPDATE public.shadow_entry_totals
SET previous_final_rank = final_rank
WHERE previous_final_rank IS NULL;

-- 2) Mirror of snapshot_pool_ranks (final_rank -> previous_final_rank) ---------
--    shadow_entry_totals carries pool_id directly, so filter on it (no member join).
CREATE OR REPLACE FUNCTION public.shadow_snapshot_ranks(p_pool_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE shadow_entry_totals
  SET previous_final_rank = final_rank
  WHERE pool_id = ANY(p_pool_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- ============================================================================
-- 3) TS WIRING (Phase 1 deploy — NOT part of this DB migration)
-- ----------------------------------------------------------------------------
-- Add one fire-and-forget call in lib/scoring/snapshotRanks.ts so BOTH callers
-- (sync-fixtures cron + /api/pools/snapshot-ranks) snapshot shadow in lockstep
-- with prod, at the exact same matchday-baseline instant:
--
--   export async function snapshotPoolRanks(admin, poolIds) {
--     if (!poolIds?.length) return 0
--     const { data, error } = await admin.rpc('snapshot_pool_ranks', { p_pool_ids: poolIds })
--     if (error) throw new Error(`snapshot_pool_ranks failed: ${error.message}`)
--     // shadow mirror — shadow-only, never block prod on its failure
--     await admin.rpc('shadow_snapshot_ranks', { p_pool_ids: poolIds }).catch(() => {})
--     return typeof data === 'number' ? data : 0
--   }
--
-- Until that ships, previous_final_rank stays seeded (=final_rank => move 0),
-- which is safe. Deploy the wire before flipping the first pilot pool so its
-- first matchday produces a real baseline.
-- ============================================================================

-- VERIFY (after apply): fn exists + column populated
--   SELECT count(*) FILTER (WHERE previous_final_rank IS NULL) AS unseeded
--   FROM public.shadow_entry_totals;                                  -- expect 0
--   SELECT public.shadow_snapshot_ranks(ARRAY[]::uuid[]);             -- expect 0 (no-op)
