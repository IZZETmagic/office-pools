-- =============================================================
-- Phase A #1 — Admin point-adjustment correctness for the shadow engine.
--
-- Findings that motivated this (verified against live prod 2026-07-06):
--   * Canonical total is pinned:  scored_total_points
--       = COALESCE(match_points,0)+COALESCE(bonus_points,0)+COALESCE(point_adjustment,0)
--     (exact for all 4319 scored entries; the ~680 "neither formula" rows are just
--      UNSCORED entries with NULL match/bonus — nothing to score.)
--   * shadow_finalize_totals ALREADY folds point_adjustment into total_points.
--   * BUT shadow only re-finalizes on a MATCH event (reconciler) or PREDICTION change
--     (materialize). An admin point-adjustment is neither, so on a quiet pool the
--     adjustment would silently never reach shadow — a latent bug currently masked by
--     constant live-match re-finalizes. For a read-switch that = a visibly wrong score.
--   * finalize also EXCLUDED unsubmitted entries, but production ranks unsubmitted-but-
--     ADJUSTED entries (e.g. rank 8 total 555; rank 24 total 2000) — so shadow dropped
--     them and mis-ranked everyone below. Parity break.
--
-- Fix = two small pieces, both deploy-free (pure DB), both self-healing:
--   (A) finalize includes adjusted entries even if unsubmitted (parity w/ prod ranking).
--   (B) a STATE-BASED adjustment reconciler (mirrors shadow_reconcile_matches) that
--       re-finalizes any pool whose production adjustment disagrees with shadow's folded
--       adjustment (total-match-bonus), or that has a not-yet-materialized adjusted entry.
--       Runs on its own cron; shares the reconciler lock + kill switch.
-- =============================================================

-- -------------------------------------------------------------
-- (A) finalize: score/rank adjusted entries even when unsubmitted.
--     ONLY change vs the live definition is the new OR clause in tmp_ft's WHERE.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shadow_finalize_totals(p_pool_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  DROP TABLE IF EXISTS tmp_ft;
  CREATE TEMP TABLE tmp_ft AS
  SELECT pe.entry_id, pm.pool_id, pe.point_adjustment, pe.predictions_submitted_at
  FROM pool_members pm
  JOIN pool_entries pe ON pe.member_id = pm.member_id
  JOIN pools po ON po.pool_id = pm.pool_id
  WHERE po.prediction_mode <> 'bracket_picker'
    AND (p_pool_ids IS NULL OR po.pool_id = ANY(p_pool_ids))
    AND ( pe.has_submitted_predictions
       OR COALESCE(pe.point_adjustment,0) <> 0   -- NEW: prod ranks adjusted entries even if unsubmitted
       OR ( po.prediction_mode = 'progressive'
            AND EXISTS (SELECT 1 FROM entry_round_submissions ers
                        WHERE ers.entry_id = pe.entry_id AND ers.has_submitted) ) );
  CREATE INDEX ON tmp_ft(entry_id);

  WITH ms_agg AS (
    SELECT s.entry_id, sum(s.total_points) AS mp,
           count(*) FILTER (WHERE s.score_type='exact')  AS ex,
           count(*) FILTER (WHERE s.score_type <> 'miss') AS co
    FROM shadow_match_scores s
    WHERE s.entry_id IN (SELECT entry_id FROM tmp_ft)
    GROUP BY s.entry_id
  ),
  bs_agg AS (
    SELECT b.entry_id, sum(b.points_earned) AS bp
    FROM shadow_bonus_scores b
    WHERE b.entry_id IN (SELECT entry_id FROM tmp_ft)
    GROUP BY b.entry_id
  ),
  agg AS (
    SELECT f.entry_id, f.pool_id, f.predictions_submitted_at,
      COALESCE(ms.mp,0) AS match_points,
      COALESCE(bs.bp,0) AS bonus_points,
      COALESCE(ms.mp,0) + COALESCE(bs.bp,0) + COALESCE(f.point_adjustment,0) AS total_points,
      COALESCE(ms.ex,0) AS exact_count,
      COALESCE(ms.co,0) AS correct_count
    FROM tmp_ft f
    LEFT JOIN ms_agg ms ON ms.entry_id = f.entry_id
    LEFT JOIN bs_agg bs ON bs.entry_id = f.entry_id
  ),
  ranked AS (
    SELECT entry_id, pool_id, match_points, bonus_points, total_points,
      RANK() OVER (PARTITION BY pool_id
                   ORDER BY total_points DESC, exact_count DESC, correct_count DESC,
                            bonus_points DESC, predictions_submitted_at ASC NULLS LAST) AS final_rank
    FROM agg
  )
  INSERT INTO shadow_entry_totals (entry_id, pool_id, match_points, bonus_points, total_points, final_rank, updated_at)
  SELECT entry_id, pool_id, match_points, bonus_points, total_points, final_rank, now()
  FROM ranked
  ON CONFLICT (entry_id) DO UPDATE SET
    pool_id      = EXCLUDED.pool_id,
    match_points = EXCLUDED.match_points,
    bonus_points = EXCLUDED.bonus_points,
    total_points = EXCLUDED.total_points,
    final_rank   = EXCLUDED.final_rank,
    updated_at   = now()
  WHERE shadow_entry_totals.match_points IS DISTINCT FROM EXCLUDED.match_points
     OR shadow_entry_totals.bonus_points IS DISTINCT FROM EXCLUDED.bonus_points
     OR shadow_entry_totals.total_points IS DISTINCT FROM EXCLUDED.total_points
     OR shadow_entry_totals.final_rank   IS DISTINCT FROM EXCLUDED.final_rank
     OR shadow_entry_totals.pool_id      IS DISTINCT FROM EXCLUDED.pool_id;

  DROP TABLE IF EXISTS tmp_ft;
END;
$function$;

-- -------------------------------------------------------------
-- (B) State-based adjustment reconciler. Converges on state, not events:
--     re-finalizes any pool where prod's point_adjustment != shadow's folded adjustment
--     (total-match-bonus), or that has an adjusted entry with no shadow row yet.
--     Race-free (shared advisory lock), self-healing, bounded by p_cap.
--     Adjustments change only the total (=match+bonus+adj) + rank; match/bonus inputs are
--     untouched, so finalize alone (change-only) suffices — no bonus recompute.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shadow_reconcile_adjustments(p_cap int DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_pools uuid[];
BEGIN
  -- Kill switch shared with the match reconciler (absent = enabled)
  IF COALESCE((SELECT setting_value FROM sync_settings WHERE setting_key='shadow_reconcile_enabled'), to_jsonb(true)) = to_jsonb(false) THEN
    RETURN jsonb_build_object('skipped','disabled');
  END IF;

  -- Serialize with every other shadow writer (worker / match reconciler / materialize)
  IF NOT pg_try_advisory_lock(hashtext('shadow_process_queue')) THEN
    RETURN jsonb_build_object('skipped','locked');
  END IF;

  SELECT array_agg(pool_id) INTO v_pools FROM (
    SELECT DISTINCT pm.pool_id
    FROM pool_entries pe
    JOIN pool_members pm ON pm.member_id = pe.member_id
    JOIN pools po        ON po.pool_id   = pm.pool_id
    LEFT JOIN shadow_entry_totals se ON se.entry_id = pe.entry_id
    WHERE po.prediction_mode <> 'bracket_picker'
      AND (
           (se.entry_id IS NOT NULL
             AND COALESCE(pe.point_adjustment,0) IS DISTINCT FROM (se.total_points - se.match_points - se.bonus_points))
        OR (se.entry_id IS NULL AND COALESCE(pe.point_adjustment,0) <> 0)
      )
    LIMIT p_cap
  ) q;

  IF v_pools IS NULL THEN
    PERFORM pg_advisory_unlock(hashtext('shadow_process_queue'));
    RETURN jsonb_build_object('reconciled_pools', 0);
  END IF;

  PERFORM shadow_finalize_totals(v_pools);

  PERFORM pg_advisory_unlock(hashtext('shadow_process_queue'));
  RETURN jsonb_build_object('reconciled_pools', COALESCE(array_length(v_pools,1),0));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_advisory_unlock(hashtext('shadow_process_queue'));
  RAISE;
END;
$function$;

-- GO-LIVE — APPLIED to prod 2026-07-06 (A + B + cron all live):
--   SELECT cron.schedule('shadow-reconcile-adjustments','*/2 * * * *',
--                        $$SELECT public.shadow_reconcile_adjustments()$$);   -- jobid 20
-- Validated: totals for the 150 adjusted + 2 unsubmitted-adjusted entries match prod
-- exactly; adversarial +500 corruption self-healed; no-op clean; residual drift = 0.
-- Note: unsubmitted-adjusted entries now rank consistently in shadow; prod's current_rank
-- for those <=2 pools is a stale lite_recalc artifact (a full prod recalc would match shadow).
