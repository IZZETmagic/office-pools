-- ROLLBACK for the C1 fix (2026-07-29).
--
-- The fix removed one condition from shadow_finalize_totals' WHERE clause:
--     OR ( po.prediction_mode <> 'bracket_picker' AND COALESCE(pe.point_adjustment,0) <> 0 )
--   became
--     OR COALESCE(pe.point_adjustment,0) <> 0
--
-- WHY THE GUARD EXISTED: written 2026-07-06, when bracket_picker was outside
-- shadow's scope entirely. The bracket_picker arm landed 2026-07-27 (migrations
-- 034/035) and this line was never revisited, so an admin point adjustment on an
-- UNSUBMITTED bracket_picker entry produced no shadow row at all — and the read
-- path zero-fills a missing row, so the award vanished from the leaderboard.
-- Live casualty: entry 53a55116-ef73-4c9e-a31e-f297b2dd4402 ("CEM", 223 pts,
-- reason "Based on submissions") in "PES PREDICTS 2026 WORLD CUP WINNER", a pool
-- that IS in shadow_read_enabled_pools.
--
-- This file restores the exact definition that was live before the fix, captured
-- from pg_get_functiondef. Running it re-introduces the bug; it exists so the
-- change is reversible in one statement.

CREATE OR REPLACE FUNCTION public.shadow_finalize_totals(p_pool_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  DROP TABLE IF EXISTS tmp_ft;
  CREATE TEMP TABLE tmp_ft AS
  SELECT pe.entry_id, pm.pool_id, pe.point_adjustment, pe.predictions_submitted_at,
         po.prediction_mode
  FROM pool_members pm
  JOIN pool_entries pe ON pe.member_id = pm.member_id
  JOIN pools po ON po.pool_id = pm.pool_id
  WHERE (p_pool_ids IS NULL OR po.pool_id = ANY(p_pool_ids))
    AND ( pe.has_submitted_predictions
       OR ( po.prediction_mode <> 'bracket_picker' AND COALESCE(pe.point_adjustment,0) <> 0 )
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
  bp_agg AS (
    SELECT b.entry_id, count(*) AS bp_correct
    FROM shadow_bonus_scores b
    WHERE b.entry_id IN (SELECT entry_id FROM tmp_ft WHERE prediction_mode = 'bracket_picker')
      AND ( (b.bonus_type LIKE 'bp\_group\_position\_%' AND b.points_earned > 0)
         OR b.bonus_type IN ('bp_third_qualifies','bp_third_eliminated')
         OR b.bonus_type LIKE 'bp\_knockout\_%' )
    GROUP BY b.entry_id
  ),
  agg AS (
    SELECT f.entry_id, f.pool_id, f.predictions_submitted_at,
      COALESCE(ms.mp,0) AS match_points,
      COALESCE(bs.bp,0) AS bonus_points,
      COALESCE(ms.mp,0) + COALESCE(bs.bp,0) + COALESCE(f.point_adjustment,0) AS total_points,
      COALESCE(ms.ex,0) AS exact_count,
      COALESCE(ms.co,0) + COALESCE(bpc.bp_correct,0) AS correct_count
    FROM tmp_ft f
    LEFT JOIN ms_agg ms  ON ms.entry_id  = f.entry_id
    LEFT JOIN bs_agg bs  ON bs.entry_id  = f.entry_id
    LEFT JOIN bp_agg bpc ON bpc.entry_id = f.entry_id
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

-- -------------------------------------------------------------------------
-- PART 2 — the DETECTOR carried the same guard.
--
-- shadow_reconcile_adjustments is what notices that a pool needs re-finalizing
-- after an admin changes an adjustment. It also filtered out bracket_picker, so
-- fixing finalize alone would have repaired the one existing casualty and left
-- the bug live for the NEXT adjustment on a bracket_picker pool.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.shadow_reconcile_adjustments(p_cap integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_pools uuid[];
BEGIN
  IF COALESCE((SELECT setting_value FROM sync_settings WHERE setting_key='shadow_reconcile_enabled'), to_jsonb(true)) = to_jsonb(false) THEN
    RETURN jsonb_build_object('skipped','disabled');
  END IF;

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

-- After rolling back, CEM's now-correct row would remain (223 pts, rank 4).
-- To fully restore the pre-fix state (not usually wanted — it is the bug):
--   DELETE FROM shadow_entry_totals WHERE entry_id = '53a55116-ef73-4c9e-a31e-f297b2dd4402';
--   SELECT shadow_finalize_totals(ARRAY['266ba497-afc3-4364-a60f-4ead97da840e']::uuid[]);
