-- ROLLBACK for migration 046 (league scoring).
--
-- These are the EXACT live bodies of the three shadow functions 046 replaces,
-- captured from `pg_get_functiondef` against production on 2026-08-14, minutes
-- before 046 was applied.
--
-- Captured rather than reconstructed on purpose. More than one file in the repo
-- defines `shadow_finalize_totals` (lib/migrations/035_shadow_wire_bracket_picker.sql
-- and drafts/2026-07-29_c1_shadow_adjustment_bracket_picker_rollback.sql), and
-- working out which one is live is not something to be doing during an incident.
--
-- To roll back: run this whole file. It restores all three functions to their
-- pre-046 state. The predicate functions 046 adds
-- (stage_has_scheduled_teams / stage_uses_base_prices / mode_submits_per_round)
-- become unreferenced and can be dropped afterwards, or left — they are inert.
--
-- ⚠ Rolling back re-introduces all three league-scoring bugs. That is fine while
-- no league pool exists; it is NOT fine once one does. Check for
-- `matches.stage = 'regular_season'` rows before using this.

-- ============================================================
-- shadow_score_match — pre-046
-- ============================================================
CREATE OR REPLACE FUNCTION public.shadow_score_match(p_match_id uuid, p_final boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_stage text;
BEGIN
  SELECT stage INTO v_stage FROM matches WHERE match_id = p_match_id;
  IF v_stage IS NULL THEN
    RAISE EXCEPTION 'shadow_score_match: match % not found', p_match_id;
  END IF;

  DELETE FROM shadow_match_scores sms
  WHERE sms.match_id = p_match_id
    AND NOT EXISTS (
      SELECT 1
      FROM predictions pr
      JOIN pool_entries pe ON pe.entry_id  = pr.entry_id
      JOIN pool_members pm ON pm.member_id = pe.member_id
      JOIN pools        po ON po.pool_id   = pm.pool_id
      JOIN matches      m  ON m.match_id   = pr.match_id
      WHERE pr.match_id = p_match_id
        AND pr.entry_id = sms.entry_id
        AND po.prediction_mode <> 'bracket_picker'
        AND pr.predicted_home_score IS NOT NULL
        AND pr.predicted_away_score IS NOT NULL
        AND m.home_score_ft IS NOT NULL
        AND m.away_score_ft IS NOT NULL
        AND (m.is_completed OR (NOT p_final AND m.status = 'live'))
        AND ( pe.has_submitted_predictions
           OR ( po.prediction_mode = 'progressive'
                AND EXISTS (SELECT 1 FROM entry_round_submissions ers
                            WHERE ers.entry_id = pe.entry_id AND ers.has_submitted) ) )
    );

  WITH src AS (
    SELECT
      pr.entry_id, m.match_id, pm.pool_id, m.stage, po.prediction_mode,
      m.match_number,
      pr.predicted_home_score AS ph, pr.predicted_away_score AS pa,
      m.home_score_ft AS ah, m.away_score_ft AS aa,
      pr.predicted_home_pso AS pph, pr.predicted_away_pso AS ppa,
      m.home_score_pso AS aph, m.away_score_pso AS apa,
      m.home_team_id AS ath, m.away_team_id AS ata,
      rb.predicted_home_team_id AS pth, rb.predicted_away_team_id AS pta,
      CASE WHEN m.stage = 'group' THEN COALESCE(ps.group_exact_score, 5)
           ELSE COALESCE(ps.knockout_exact_score, 5) END AS base_exact,
      CASE WHEN m.stage = 'group' THEN COALESCE(ps.group_correct_difference, 3)
           ELSE COALESCE(ps.knockout_correct_difference, 3) END AS base_gd,
      CASE WHEN m.stage = 'group' THEN COALESCE(ps.group_correct_result, 1)
           ELSE COALESCE(ps.knockout_correct_result, 1) END AS base_win,
      CASE m.stage
        WHEN 'group'         THEN 1::numeric(4,2)
        WHEN 'round_32'      THEN COALESCE(NULLIF(COALESCE(ps.round_32_multiplier, 1), 0), 1)
        WHEN 'round_16'      THEN COALESCE(NULLIF(COALESCE(ps.round_16_multiplier, 2), 0), 1)
        WHEN 'quarter_final' THEN COALESCE(NULLIF(COALESCE(ps.quarter_final_multiplier, 3), 0), 1)
        WHEN 'semi_final'    THEN COALESCE(NULLIF(COALESCE(ps.semi_final_multiplier, 1), 0), 1)
        WHEN 'third_place'   THEN COALESCE(NULLIF(COALESCE(ps.third_place_multiplier, 1), 0), 1)
        WHEN 'final'         THEN COALESCE(NULLIF(COALESCE(ps.final_multiplier, 1), 0), 1)
        ELSE 1::numeric(4,2)
      END AS mult,
      COALESCE(ps.pso_enabled, false)        AS pso_enabled,
      COALESCE(ps.pso_exact_score, 0)        AS pso_exact,
      COALESCE(ps.pso_correct_difference, 0) AS pso_gd,
      COALESCE(ps.pso_correct_result, 0)     AS pso_win
    FROM predictions pr
    JOIN matches      m  ON m.match_id   = pr.match_id
    JOIN pool_entries pe ON pe.entry_id  = pr.entry_id
    JOIN pool_members pm ON pm.member_id = pe.member_id
    JOIN pools        po ON po.pool_id   = pm.pool_id
    LEFT JOIN pool_settings ps ON ps.pool_id = po.pool_id
    LEFT JOIN shadow_entry_bracket rb ON rb.entry_id = pr.entry_id AND rb.match_id = pr.match_id
    WHERE pr.match_id = p_match_id
      AND po.prediction_mode <> 'bracket_picker'
      AND pr.predicted_home_score IS NOT NULL
      AND pr.predicted_away_score IS NOT NULL
      AND m.home_score_ft IS NOT NULL
      AND m.away_score_ft IS NOT NULL
      AND (m.is_completed OR (NOT p_final AND m.status = 'live'))
      AND ( pe.has_submitted_predictions
         OR ( po.prediction_mode = 'progressive'
              AND EXISTS (SELECT 1 FROM entry_round_submissions ers
                          WHERE ers.entry_id = pe.entry_id AND ers.has_submitted) ) )
  ),
  teamed AS (
    SELECT src.*,
      CASE
        WHEN stage = 'group' THEN true
        WHEN prediction_mode = 'progressive' THEN true
        WHEN ath IS NULL OR ata IS NULL THEN true
        WHEN pth IS NULL OR pta IS NULL THEN false
        WHEN pth IN (ath, ata) AND pta IN (ath, ata) THEN true
        ELSE false
      END AS teams_match
    FROM src
  ),
  scored AS (
    SELECT teamed.*,
      CASE
        WHEN stage <> 'group' AND NOT teams_match THEN 'miss'
        WHEN ph = ah AND pa = aa THEN 'exact'
        WHEN NOT ( ((ph > pa) = (ah > aa)) AND ((ph < pa) = (ah < aa)) ) THEN 'miss'
        WHEN (ph - pa) = (ah - aa) THEN 'winner_gd'
        ELSE 'winner'
      END AS score_type,
      CASE
        WHEN pso_enabled AND aph IS NOT NULL AND apa IS NOT NULL AND pph IS NOT NULL AND ppa IS NOT NULL THEN
          CASE
            WHEN pph = aph AND ppa = apa THEN pso_exact
            WHEN NOT ( ((pph > ppa) = (aph > apa)) AND ((pph < ppa) = (aph < apa)) ) THEN 0
            WHEN (pph - ppa) = (aph - apa) THEN pso_gd
            ELSE pso_win
          END
        ELSE 0
      END AS raw_pso
    FROM teamed
  ),
  calc AS (
    SELECT entry_id, match_id, pool_id, score_type, teams_match, mult, stage, match_number,
      ph  AS predicted_home_score, pa  AS predicted_away_score,
      ah  AS actual_home_score,    aa  AS actual_away_score,
      pph AS predicted_home_pso,   ppa AS predicted_away_pso,
      aph AS actual_home_pso,      apa AS actual_away_pso,
      CASE WHEN stage = 'group' THEN NULL
           WHEN prediction_mode = 'progressive' THEN ath
           ELSE pth END AS predicted_home_team_id,
      CASE WHEN stage = 'group' THEN NULL
           WHEN prediction_mode = 'progressive' THEN ata
           ELSE pta END AS predicted_away_team_id,
      CASE score_type
        WHEN 'exact' THEN base_exact WHEN 'winner_gd' THEN base_gd WHEN 'winner' THEN base_win ELSE 0
      END AS base_points,
      CASE WHEN stage <> 'group' AND NOT teams_match THEN 0 ELSE raw_pso END AS pso_points
    FROM scored
  )
  INSERT INTO shadow_match_scores
    (entry_id, match_id, pool_id, score_type, base_points, multiplier, pso_points, total_points, teams_match, calculated_at,
     match_number, stage, predicted_home_score, predicted_away_score, actual_home_score, actual_away_score,
     predicted_home_pso, predicted_away_pso, actual_home_pso, actual_away_pso,
     predicted_home_team_id, predicted_away_team_id)
  SELECT
    entry_id, match_id, pool_id, score_type, base_points, mult, pso_points,
    floor(base_points * mult)::int + pso_points, teams_match, now(),
    match_number, stage, predicted_home_score, predicted_away_score, actual_home_score, actual_away_score,
    predicted_home_pso, predicted_away_pso, actual_home_pso, actual_away_pso,
    predicted_home_team_id, predicted_away_team_id
  FROM calc
  ON CONFLICT (entry_id, match_id) DO UPDATE SET
    score_type=EXCLUDED.score_type, base_points=EXCLUDED.base_points, multiplier=EXCLUDED.multiplier,
    pso_points=EXCLUDED.pso_points, total_points=EXCLUDED.total_points, teams_match=EXCLUDED.teams_match,
    calculated_at=EXCLUDED.calculated_at,
    match_number=EXCLUDED.match_number, stage=EXCLUDED.stage,
    predicted_home_score=EXCLUDED.predicted_home_score, predicted_away_score=EXCLUDED.predicted_away_score,
    actual_home_score=EXCLUDED.actual_home_score, actual_away_score=EXCLUDED.actual_away_score,
    predicted_home_pso=EXCLUDED.predicted_home_pso, predicted_away_pso=EXCLUDED.predicted_away_pso,
    actual_home_pso=EXCLUDED.actual_home_pso, actual_away_pso=EXCLUDED.actual_away_pso,
    predicted_home_team_id=EXCLUDED.predicted_home_team_id, predicted_away_team_id=EXCLUDED.predicted_away_team_id
  WHERE shadow_match_scores.score_type   IS DISTINCT FROM EXCLUDED.score_type
     OR shadow_match_scores.base_points  IS DISTINCT FROM EXCLUDED.base_points
     OR shadow_match_scores.multiplier   IS DISTINCT FROM EXCLUDED.multiplier
     OR shadow_match_scores.pso_points   IS DISTINCT FROM EXCLUDED.pso_points
     OR shadow_match_scores.total_points IS DISTINCT FROM EXCLUDED.total_points
     OR shadow_match_scores.teams_match  IS DISTINCT FROM EXCLUDED.teams_match
     OR shadow_match_scores.match_number IS DISTINCT FROM EXCLUDED.match_number
     OR shadow_match_scores.stage        IS DISTINCT FROM EXCLUDED.stage
     OR shadow_match_scores.predicted_home_score IS DISTINCT FROM EXCLUDED.predicted_home_score
     OR shadow_match_scores.predicted_away_score IS DISTINCT FROM EXCLUDED.predicted_away_score
     OR shadow_match_scores.actual_home_score    IS DISTINCT FROM EXCLUDED.actual_home_score
     OR shadow_match_scores.actual_away_score    IS DISTINCT FROM EXCLUDED.actual_away_score
     OR shadow_match_scores.predicted_home_pso   IS DISTINCT FROM EXCLUDED.predicted_home_pso
     OR shadow_match_scores.predicted_away_pso   IS DISTINCT FROM EXCLUDED.predicted_away_pso
     OR shadow_match_scores.actual_home_pso      IS DISTINCT FROM EXCLUDED.actual_home_pso
     OR shadow_match_scores.actual_away_pso      IS DISTINCT FROM EXCLUDED.actual_away_pso
     OR shadow_match_scores.predicted_home_team_id IS DISTINCT FROM EXCLUDED.predicted_home_team_id
     OR shadow_match_scores.predicted_away_team_id IS DISTINCT FROM EXCLUDED.predicted_away_team_id;

  WITH affected AS (
    SELECT DISTINCT pm.pool_id
    FROM predictions pr
    JOIN pool_entries pe ON pe.entry_id  = pr.entry_id
    JOIN pool_members pm ON pm.member_id = pe.member_id
    JOIN pools        po ON po.pool_id   = pm.pool_id
    WHERE pr.match_id = p_match_id AND po.prediction_mode <> 'bracket_picker'
  ),
  entries_in AS (
    SELECT pe.entry_id, pm.pool_id, pe.created_at
    FROM pool_members pm
    JOIN pool_entries pe ON pe.member_id = pm.member_id
    JOIN pools        po ON po.pool_id   = pm.pool_id
    WHERE pm.pool_id IN (SELECT pool_id FROM affected)
      AND ( pe.has_submitted_predictions
         OR ( po.prediction_mode = 'progressive'
              AND EXISTS (SELECT 1 FROM entry_round_submissions ers
                          WHERE ers.entry_id = pe.entry_id AND ers.has_submitted) ) )
  ),
  agg AS (
    SELECT ei.entry_id, ei.pool_id, ei.created_at,
      COALESCE(SUM(sms.total_points), 0)               AS match_points,
      COUNT(*) FILTER (WHERE sms.score_type = 'exact') AS exact_ct,
      COUNT(*) FILTER (WHERE sms.score_type <> 'miss') AS nonmiss_ct
    FROM entries_in ei
    LEFT JOIN shadow_match_scores sms ON sms.entry_id = ei.entry_id
    GROUP BY ei.entry_id, ei.pool_id, ei.created_at
  ),
  ranked AS (
    SELECT entry_id, pool_id, match_points,
      ROW_NUMBER() OVER (PARTITION BY pool_id ORDER BY match_points DESC, exact_ct DESC, nonmiss_ct DESC, created_at ASC) AS rnk
    FROM agg
  )
  INSERT INTO shadow_entry_totals (entry_id, pool_id, match_points, current_match_rank, previous_match_rank, updated_at)
  SELECT entry_id, pool_id, match_points, rnk, NULL, now()
  FROM ranked
  ON CONFLICT (entry_id) DO UPDATE SET
    pool_id=EXCLUDED.pool_id, match_points=EXCLUDED.match_points,
    current_match_rank=EXCLUDED.current_match_rank, updated_at=now()
  WHERE shadow_entry_totals.match_points       IS DISTINCT FROM EXCLUDED.match_points
     OR shadow_entry_totals.current_match_rank IS DISTINCT FROM EXCLUDED.current_match_rank;
END;
$function$;

-- ============================================================
-- shadow_eligible_entries — pre-046
-- ============================================================
CREATE OR REPLACE FUNCTION public.shadow_eligible_entries(p_pool_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(entry_id uuid, pool_id uuid, tournament_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT pe.entry_id, pm.pool_id, po.tournament_id
  FROM pool_entries pe
  JOIN pool_members pm ON pm.member_id = pe.member_id
  JOIN pools po        ON po.pool_id   = pm.pool_id
  WHERE (p_pool_ids IS NULL OR pm.pool_id = ANY(p_pool_ids))
    AND po.prediction_mode <> 'bracket_picker'
    AND ( pe.has_submitted_predictions
       OR ( po.prediction_mode = 'progressive'
            AND EXISTS (SELECT 1 FROM entry_round_submissions ers
                        WHERE ers.entry_id = pe.entry_id AND ers.has_submitted) ) );
$function$;

-- ============================================================
-- shadow_finalize_totals — pre-046
-- ============================================================
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
       OR COALESCE(pe.point_adjustment,0) <> 0
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
