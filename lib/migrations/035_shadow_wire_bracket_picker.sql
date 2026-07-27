-- ============================================================================
-- 035 — Wire the bracket_picker arm into the shadow scoring path
-- ============================================================================
-- DEPENDS ON: 034 (shadow_calculate_bp_bonuses)
-- Plan: drafts/2026-07-27_bracket_picker_shadow_arm.md §8-9
--
-- Three changes, each with a reason that is NOT obvious:
--
-- 1. shadow_finalize_totals stops excluding bracket_picker, AND gains a
--    bp-specific correct_count.
--
--    Its tiebreakers come from shadow_match_scores, which is EMPTY for
--    bracket_picker, so correct_count would be 0 for every bp entry and ties on
--    total would fall through to submission time. Prod does not do that —
--    lib/scoring/bracket.ts:292 sets correct_count = bpCorrectCount =
--    correct group positions + correct third-place calls + correct knockout
--    picks (champion, penalty and the all-8 bonus EXCLUDED — only picks count).
--    Reconstructing exactly that took rank mismatch from 161 to 78.
--
-- 2. shadow_apply_changes also calls shadow_calculate_bp_bonuses.
--    Safe to pass the same pool ids to both calculators: each filters to its own
--    mode internally (shadow_calculate_bonuses excludes bracket_picker,
--    shadow_calculate_bp_bonuses requires it), so neither touches the other's
--    pools.
--
-- 3. shadow_reconcile_matches adds bracket_picker pools of the AFFECTED
--    TOURNAMENTS to its pool set.
--
--    It derives v_pools from shadow_match_scores — and bp entries have NO
--    shadow_match_scores, so bp pools would never appear and would never
--    rescore when results changed. They have to be added by tournament instead.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES **NOT** DO
-- ------------------------------------------------
-- It does NOT remove the bracket_picker exclusion from shadow_eligible_entries
-- or shadow_pools_needing_materialize. Those govern the PER-ENTRY TypeScript
-- materialization path, and bp entries have zero rows in
-- shadow_resolved_standings / _match_scores / _entry_totals. Including them
-- would select all 859 bp entries as `never_resolved`, hand them to backfills
-- that explicitly skip bracket_picker, produce nothing, and leave the marker
-- (migration 032) correctly refusing to mark them — FOREVER, re-materializing
-- 99 pools every run. bracket_picker needs no per-entry materialization: the arm
-- reads the pick tables and shadow_actual_standings directly.
--
-- EXPECTED AFTER THIS LANDS
-- -------------------------
-- Rank parity on the 781 bp entries where prod is self-consistent. The other 78
-- (3 pools) will still differ and SHADOW WILL BE RIGHT — prod's current_rank
-- there does not follow from prod's own stored data, because those pools have
-- not been recalculated since their scores last changed. Do not read that as a
-- parity failure; recalculating those 3 pools in prod should converge them.
--
-- Reversible: re-apply the prior definitions of the three functions.
-- ============================================================================

-- 1. shadow_finalize_totals — include bracket_picker + bp correct_count -------
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
       -- The point_adjustment escape hatch is CLASSIC-ONLY. Prod ranks
       -- bracket_picker on submitted entries alone (recalculate.ts:180), and one
       -- live bp entry is unsubmitted with a non-zero adjustment — including it
       -- would shift that pool's ranks by one against prod and read as
       -- unexplained parity noise. Classic behaviour is unchanged.
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
  -- bracket_picker correct_count: mirrors bpCorrectCount in bracket.ts:281.
  -- Group rows exist for wrong answers too, hence the points_earned > 0 test;
  -- third-place and knockout rows are only written when correct. Champion,
  -- penalty and the all-8 bonus are NOT picks and are excluded.
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
      -- classic: ms.co (bp_agg is 0). bracket_picker: bp_agg (ms.co is 0).
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

-- 2. shadow_apply_changes — also run the bracket_picker arm -------------------
CREATE OR REPLACE FUNCTION public.shadow_apply_changes(p_match_ids uuid[], p_pool_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE m uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('shadow_process_queue'));

  IF p_match_ids IS NOT NULL AND array_length(p_match_ids, 1) > 0 THEN
    FOREACH m IN ARRAY p_match_ids LOOP
      PERFORM shadow_score_match(m, coalesce((SELECT is_completed FROM matches WHERE match_id = m), false));
    END LOOP;
  END IF;

  IF p_pool_ids IS NOT NULL AND array_length(p_pool_ids, 1) > 0 THEN
    PERFORM shadow_calculate_bonuses(p_pool_ids);
    -- Safe alongside the above: each calculator filters to its own mode, so
    -- neither touches the other's pools.
    PERFORM shadow_calculate_bp_bonuses(p_pool_ids);
    PERFORM shadow_finalize_totals(p_pool_ids);
  END IF;
END;
$function$;

-- 3. shadow_reconcile_matches — include bp pools of affected tournaments ------
CREATE OR REPLACE FUNCTION public.shadow_reconcile_matches(p_cap integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_pools uuid[]; r record; n int := 0;
BEGIN
  IF coalesce((SELECT setting_value FROM sync_settings WHERE setting_key='shadow_reconcile_enabled'), to_jsonb(true)) = to_jsonb(false) THEN
    RETURN jsonb_build_object('skipped','disabled');
  END IF;

  IF NOT pg_try_advisory_lock(hashtext('shadow_process_queue')) THEN
    RETURN jsonb_build_object('skipped','locked');
  END IF;

  DROP TABLE IF EXISTS tmp_reconcile;
  CREATE TEMP TABLE tmp_reconcile AS
  SELECT m.match_id, m.home_score_ft, m.away_score_ft, m.home_score_pso, m.away_score_pso, m.status, m.is_completed
  FROM matches m
  LEFT JOIN shadow_match_state st ON st.match_id = m.match_id
  WHERE (m.home_score_ft, m.away_score_ft, m.home_score_pso, m.away_score_pso, m.status, m.is_completed)
        IS DISTINCT FROM
        (st.home_score_ft, st.away_score_ft, st.home_score_pso, st.away_score_pso, st.status, st.is_completed)
  ORDER BY m.match_number
  LIMIT p_cap;

  IF NOT EXISTS (SELECT 1 FROM tmp_reconcile) THEN
    PERFORM pg_advisory_unlock(hashtext('shadow_process_queue'));
    RETURN jsonb_build_object('reconciled', 0);
  END IF;

  FOR r IN SELECT match_id, is_completed FROM tmp_reconcile LOOP
    PERFORM shadow_score_match(r.match_id, coalesce(r.is_completed, false));
    n := n + 1;
  END LOOP;

  -- Pools to rescore: those with shadow match scores for the changed matches,
  -- UNION the bracket_picker pools of the affected tournaments. bp entries have
  -- NO shadow_match_scores, so they would otherwise never appear here and would
  -- never rescore when results changed.
  SELECT array_agg(DISTINCT pool_id) INTO v_pools FROM (
    SELECT sms.pool_id
    FROM shadow_match_scores sms
    WHERE sms.match_id IN (SELECT match_id FROM tmp_reconcile)
    UNION
    SELECT po.pool_id
    FROM pools po
    WHERE po.prediction_mode = 'bracket_picker'
      AND po.tournament_id IN (
        SELECT DISTINCT m2.tournament_id FROM matches m2
        WHERE m2.match_id IN (SELECT match_id FROM tmp_reconcile))
  ) z;

  IF v_pools IS NOT NULL THEN
    PERFORM shadow_calculate_bonuses(v_pools);
    PERFORM shadow_calculate_bp_bonuses(v_pools);
    PERFORM shadow_finalize_totals(v_pools);
  END IF;

  INSERT INTO shadow_match_state
    (match_id, home_score_ft, away_score_ft, home_score_pso, away_score_pso, status, is_completed, scored_at)
  SELECT match_id, home_score_ft, away_score_ft, home_score_pso, away_score_pso, status, is_completed, now()
  FROM tmp_reconcile
  ON CONFLICT (match_id) DO UPDATE SET
    home_score_ft=EXCLUDED.home_score_ft, away_score_ft=EXCLUDED.away_score_ft,
    home_score_pso=EXCLUDED.home_score_pso, away_score_pso=EXCLUDED.away_score_pso,
    status=EXCLUDED.status, is_completed=EXCLUDED.is_completed, scored_at=now();

  DROP TABLE IF EXISTS tmp_reconcile;
  PERFORM pg_advisory_unlock(hashtext('shadow_process_queue'));
  RETURN jsonb_build_object('reconciled', n, 'pools', coalesce(array_length(v_pools,1),0));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_advisory_unlock(hashtext('shadow_process_queue'));
  RAISE;
END;
$function$;
