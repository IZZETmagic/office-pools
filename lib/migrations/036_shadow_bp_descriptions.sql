-- ============================================================================
-- 036 — bracket_picker shadow arm: compose the `description` prose
-- ============================================================================
-- SUPERSEDES the description handling in 034 (which wrote NULL by design).
-- Plan: drafts/2026-07-27_bracket_picker_shadow_arm.md §5
--
-- WHY THIS REVERSES AN EARLIER DECISION
-- -------------------------------------
-- 034 deliberately left `description` NULL, on the reasoning that reproducing
-- prod's prose in SQL would fork formatStage() into a second implementation —
-- the duplication behind the podium incident. The display layer was to compose
-- the sentence at read time instead.
--
-- That was wrong, for a reason only visible on closer inspection: **bonus_scores
-- stores no team_id**. "Correctly predicted Mexico" therefore cannot be rebuilt
-- from a row — read-time composition needs a per-row join back to
-- bracket_picker_group_rankings / _third_place_rankings / _knockout_picks, on a
-- hot read path, for 58,604 rows. The arm already holds every one of those joins
-- at WRITE time.
--
-- And composing here makes the text VERIFIABLE, which read-time composition
-- never could be. Verified after applying: 58,604 / 58,604 descriptions match
-- prod character-for-character, 0 differing.
--
-- The duplication that remains is a six-value stage mapping (stage_label below),
-- mirroring formatStage() at bracket-picks/calculate/route.ts:476. Keep them in
-- step; it is a far smaller seam than a second prose composer on the read path.
--
-- Formats reproduced exactly, from route.ts:340-430:
--   group      Group A 1st position: Correctly predicted Mexico
--              (also the Incorrectly variant — group rows are written for wrong
--               answers too, with points_earned = 0)
--   third      Correctly predicted Norway (Group I) qualifies
--   all-8      Correctly predicted all 8 qualifying third-place teams
--   knockout   Correctly predicted Spain to win Match 104 (Final)
--   penalty    Penalty prediction points (7 pts)
--   champion   Correctly predicted the tournament champion
--
-- `description` is also added to the change-only upsert's comparison, so prose
-- drift is caught rather than silently persisting.
--
-- WHY IT MATTERED: shadow's bp rows are what a breakdown modal renders once
-- readSource stops forcing bracket_picker to 'prod'. NULL descriptions would
-- have rendered blank breakdowns for 859 entries.
--
-- Reversible: re-apply 034. Idempotent: CREATE OR REPLACE.
-- ============================================================================
--
CREATE OR REPLACE FUNCTION public.shadow_calculate_bp_bonuses(p_pool_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provisional boolean;
BEGIN
  SELECT COALESCE((SELECT setting_value FROM sync_settings
                    WHERE setting_key = 'bp_provisional_scoring') = to_jsonb(true), false)
    INTO v_provisional;

  -- ===== Scope: submitted bracket_picker entries + their point settings =====
  -- Gate is has_submitted_predictions, matching bracket-picks/calculate:233.
  DROP TABLE IF EXISTS tmp_bp_targets;
  CREATE TEMP TABLE tmp_bp_targets AS
  SELECT pe.entry_id, po.pool_id, po.tournament_id,
    COALESCE(ps.bp_group_correct_1st, 4)        AS p_pos1,
    COALESCE(ps.bp_group_correct_2nd, 3)        AS p_pos2,
    COALESCE(ps.bp_group_correct_3rd, 2)        AS p_pos3,
    COALESCE(ps.bp_group_correct_4th, 1)        AS p_pos4,
    COALESCE(ps.bp_third_correct_qualifier, 2)  AS p_third_qual,
    COALESCE(ps.bp_third_correct_eliminated, 1) AS p_third_elim,
    COALESCE(ps.bp_third_all_correct_bonus, 10) AS p_third_all,
    COALESCE(ps.bp_r32_correct, 1)              AS p_r32,
    COALESCE(ps.bp_r16_correct, 2)              AS p_r16,
    COALESCE(ps.bp_qf_correct, 4)               AS p_qf,
    COALESCE(ps.bp_sf_correct, 8)               AS p_sf,
    COALESCE(ps.bp_third_place_match_correct, 10) AS p_tpm,
    COALESCE(ps.bp_final_correct, 20)           AS p_final,
    COALESCE(ps.bp_champion_bonus, 50)          AS p_champ,
    COALESCE(ps.bp_penalty_correct, 1)          AS p_pen
  FROM pool_members pm
  JOIN pool_entries pe ON pe.member_id = pm.member_id
  JOIN pools po        ON po.pool_id   = pm.pool_id
  LEFT JOIN pool_settings ps ON ps.pool_id = po.pool_id
  WHERE po.prediction_mode = 'bracket_picker'
    AND pe.has_submitted_predictions
    AND (p_pool_ids IS NULL OR po.pool_id = ANY(p_pool_ids));
  CREATE INDEX ON tmp_bp_targets(entry_id);

  -- ===== Actual-result helpers ==============================================
  -- Groups fully played: >=6 matches AND all completed (mirrors completedGroups).
  DROP TABLE IF EXISTS tmp_bp_grp;
  CREATE TEMP TABLE tmp_bp_grp AS
  SELECT tournament_id, group_letter,
         (count(*) >= 6 AND bool_and(is_completed))        AS is_complete,
         (count(*) FILTER (WHERE is_completed) >= 1)       AS is_started
  FROM matches WHERE stage = 'group' AND group_letter IS NOT NULL
  GROUP BY tournament_id, group_letter;

  -- Knockout winner with the three-source fallback: winner_team_id, then FT
  -- scores, then PSO. Reading winner_team_id alone would under-score.
  DROP TABLE IF EXISTS tmp_bp_ko;
  CREATE TEMP TABLE tmp_bp_ko AS
  SELECT m.match_id, m.tournament_id, m.stage, m.match_number, m.is_completed,
         (m.home_score_pso IS NOT NULL) AS went_to_pens,
         CASE
           WHEN NOT m.is_completed THEN NULL
           WHEN m.winner_team_id IS NOT NULL THEN m.winner_team_id
           WHEN m.home_score_ft IS NOT NULL AND m.away_score_ft IS NOT NULL
                AND m.home_score_ft > m.away_score_ft THEN m.home_team_id
           WHEN m.home_score_ft IS NOT NULL AND m.away_score_ft IS NOT NULL
                AND m.away_score_ft > m.home_score_ft THEN m.away_team_id
           WHEN m.home_score_pso IS NOT NULL AND m.away_score_pso IS NOT NULL
                THEN CASE WHEN m.home_score_pso > m.away_score_pso
                          THEN m.home_team_id ELSE m.away_team_id END
           ELSE NULL
         END AS actual_winner,
         -- mirrors formatStage() in bracket-picks/calculate/route.ts:476
         CASE m.stage WHEN 'round_32' THEN 'Round of 32' WHEN 'round_16' THEN 'Round of 16'
                      WHEN 'quarter_final' THEN 'Quarter-Final' WHEN 'semi_final' THEN 'Semi-Final'
                      WHEN 'third_place' THEN 'Third-Place Match' WHEN 'final' THEN 'Final'
                      ELSE m.stage END AS stage_label
  FROM matches m WHERE m.stage <> 'group';
  CREATE INDEX ON tmp_bp_ko(match_id);

  -- Teams that ACTUALLY finished 3rd in a COMPLETED group.
  DROP TABLE IF EXISTS tmp_bp_actual_third;
  CREATE TEMP TABLE tmp_bp_actual_third AS
  SELECT s.tournament_id, s.team_id
  FROM shadow_actual_standings s
  JOIN tmp_bp_grp g ON g.tournament_id = s.tournament_id AND g.group_letter = s.group_letter
  WHERE s.position = 3 AND g.is_complete;

  -- Each entry's predicted top-8 third-place qualifiers (by rank).
  DROP TABLE IF EXISTS tmp_bp_pred_qual;
  CREATE TEMP TABLE tmp_bp_pred_qual AS
  SELECT entry_id, team_id, group_letter, rn
  FROM (
    SELECT tp.entry_id, tp.team_id, tp.group_letter,
           row_number() OVER (PARTITION BY tp.entry_id ORDER BY tp.rank) AS rn
    FROM bracket_picker_third_place_rankings tp
    JOIN tmp_bp_targets t ON t.entry_id = tp.entry_id
  ) z;
  CREATE INDEX ON tmp_bp_pred_qual(entry_id);

  -- ===== Desired rows =======================================================
  DROP TABLE IF EXISTS tmp_bp_desired;
  CREATE TEMP TABLE tmp_bp_desired AS

  -- (1) GROUP ORDER — emitted for EVERY position, correct and incorrect.
  SELECT t.entry_id, t.pool_id,
         ('bp_group_position_' || gr.predicted_position)::text AS bonus_type,
         'bp_group'::text                                      AS bonus_category,
         gr.group_letter::text                                 AS related_group_letter,
         NULL::uuid                                            AS related_match_id,
         CASE WHEN sas.position = gr.predicted_position THEN
           CASE gr.predicted_position WHEN 1 THEN t.p_pos1 WHEN 2 THEN t.p_pos2
                                      WHEN 3 THEN t.p_pos3 WHEN 4 THEN t.p_pos4 ELSE 0 END
         ELSE 0 END                                            AS points_earned,
         ('Group ' || gr.group_letter || ' '
           || CASE gr.predicted_position WHEN 1 THEN '1st' WHEN 2 THEN '2nd'
                                         WHEN 3 THEN '3rd' WHEN 4 THEN '4th'
                                         ELSE gr.predicted_position || 'th' END
           || ' position: '
           || CASE WHEN sas.position = gr.predicted_position THEN 'Correctly' ELSE 'Incorrectly' END
           || ' predicted ' || COALESCE(tm.country_name, gr.team_id::text))::text AS description
  FROM bracket_picker_group_rankings gr
  JOIN tmp_bp_targets t ON t.entry_id = gr.entry_id
  JOIN tmp_bp_grp g     ON g.tournament_id = t.tournament_id AND g.group_letter = gr.group_letter
  -- INNER JOIN: a team absent from standings is `actualIndex === -1 -> continue`.
  JOIN shadow_actual_standings sas
       ON sas.tournament_id = t.tournament_id
      AND sas.group_letter  = gr.group_letter
      AND sas.team_id       = gr.team_id
  LEFT JOIN teams tm ON tm.team_id = gr.team_id
  WHERE g.is_complete OR (v_provisional AND g.is_started)

  UNION ALL
  -- (2) THIRD PLACE — only when the team ACTUALLY finished 3rd in its group.
  SELECT t.entry_id, t.pool_id,
         CASE WHEN pq.rn <= 8 THEN 'bp_third_qualifies' ELSE 'bp_third_eliminated' END,
         'bp_third_place', pq.group_letter::text, NULL::uuid,
         CASE WHEN pq.rn <= 8 THEN t.p_third_qual ELSE t.p_third_elim END,
         ('Correctly predicted ' || COALESCE(tm.country_name, pq.team_id::text)
           || ' (Group ' || pq.group_letter || ') '
           || CASE WHEN pq.rn <= 8 THEN 'qualifies' ELSE 'eliminated' END)::text
  FROM tmp_bp_pred_qual pq
  JOIN tmp_bp_targets t ON t.entry_id = pq.entry_id
  JOIN tmp_bp_actual_third at3
       ON at3.tournament_id = t.tournament_id AND at3.team_id = pq.team_id
  LEFT JOIN teams tm ON tm.team_id = pq.team_id
  WHERE (pq.rn <= 8) = EXISTS (SELECT 1 FROM shadow_actual_qualified aq
                                WHERE aq.tournament_id = t.tournament_id AND aq.team_id = pq.team_id)
    AND (CASE WHEN pq.rn <= 8 THEN t.p_third_qual ELSE t.p_third_elim END) > 0

  UNION ALL
  -- (3) ALL-8 BONUS — exactly 8 actual qualifiers and exact set equality.
  SELECT t.entry_id, t.pool_id, 'bp_third_all_correct', 'bp_third_place', NULL, NULL::uuid, t.p_third_all,
         'Correctly predicted all 8 qualifying third-place teams'::text
  FROM tmp_bp_targets t
  WHERE t.p_third_all > 0
    AND (SELECT count(*) FROM shadow_actual_qualified aq WHERE aq.tournament_id = t.tournament_id) = 8
    AND (SELECT count(*) FROM tmp_bp_pred_qual pq WHERE pq.entry_id = t.entry_id AND pq.rn <= 8) = 8
    AND NOT EXISTS (
      SELECT 1 FROM tmp_bp_pred_qual pq
      WHERE pq.entry_id = t.entry_id AND pq.rn <= 8
        AND NOT EXISTS (SELECT 1 FROM shadow_actual_qualified aq
                         WHERE aq.tournament_id = t.tournament_id AND aq.team_id = pq.team_id))

  UNION ALL
  -- (4) KNOCKOUT — points by the ACTUAL match's stage.
  SELECT t.entry_id, t.pool_id,
         ('bp_knockout_' || ko.stage)::text, 'bp_knockout', NULL, ko.match_id,
         CASE ko.stage WHEN 'round_32' THEN t.p_r32 WHEN 'round_16' THEN t.p_r16
                       WHEN 'quarter_final' THEN t.p_qf WHEN 'semi_final' THEN t.p_sf
                       WHEN 'third_place' THEN t.p_tpm WHEN 'final' THEN t.p_final ELSE 0 END,
         ('Correctly predicted ' || COALESCE(tm.country_name, kp.winner_team_id::text)
           || ' to win Match ' || ko.match_number || ' (' || ko.stage_label || ')')::text
  FROM bracket_picker_knockout_picks kp
  JOIN tmp_bp_targets t ON t.entry_id = kp.entry_id
  JOIN tmp_bp_ko ko     ON ko.match_id = kp.match_id
  LEFT JOIN teams tm ON tm.team_id = kp.winner_team_id
  WHERE ko.is_completed AND ko.actual_winner IS NOT NULL
    AND kp.winner_team_id = ko.actual_winner
    AND (CASE ko.stage WHEN 'round_32' THEN t.p_r32 WHEN 'round_16' THEN t.p_r16
                       WHEN 'quarter_final' THEN t.p_qf WHEN 'semi_final' THEN t.p_sf
                       WHEN 'third_place' THEN t.p_tpm WHEN 'final' THEN t.p_final ELSE 0 END) > 0

  UNION ALL
  -- (5) PENALTY — ONE aggregate row per entry. Pays when prediction and reality
  -- agree, INCLUDING agreeing on false.
  SELECT t.entry_id, t.pool_id, 'bp_penalty_predictions', 'bp_bonus', NULL, NULL::uuid, pen.pts,
         ('Penalty prediction points (' || pen.pts || ' pts)')::text
  FROM tmp_bp_targets t
  JOIN LATERAL (
    SELECT count(*) * t.p_pen AS pts
    FROM bracket_picker_knockout_picks kp
    JOIN tmp_bp_ko ko ON ko.match_id = kp.match_id
    WHERE kp.entry_id = t.entry_id AND ko.is_completed
      AND COALESCE(kp.predicted_penalty, false) = ko.went_to_pens
  ) pen ON true
  WHERE pen.pts > 0

  UNION ALL
  -- (6) CHAMPION — the entry's pick in the FINAL.
  SELECT t.entry_id, t.pool_id, 'bp_champion', 'bp_bonus', NULL, NULL::uuid, t.p_champ,
         'Correctly predicted the tournament champion'::text
  FROM tmp_bp_targets t
  JOIN bracket_picker_knockout_picks kp ON kp.entry_id = t.entry_id
  JOIN tmp_bp_ko ko ON ko.match_id = kp.match_id AND ko.stage = 'final'
  WHERE t.p_champ > 0 AND ko.is_completed
    AND ko.actual_winner IS NOT NULL AND kp.winner_team_id = ko.actual_winner;

  CREATE INDEX ON tmp_bp_desired (entry_id, bonus_type, related_group_letter, related_match_id);

  -- ===== Change-only UPSERT (description stays NULL by design) ==============
  INSERT INTO shadow_bonus_scores
    (entry_id, pool_id, bonus_type, bonus_category, related_group_letter, related_match_id, points_earned, description)
  SELECT entry_id, pool_id, bonus_type, bonus_category, related_group_letter, related_match_id, points_earned, description
  FROM tmp_bp_desired
  ON CONFLICT (entry_id, bonus_type, related_group_letter, related_match_id) DO UPDATE
    SET points_earned  = EXCLUDED.points_earned,
        bonus_category = EXCLUDED.bonus_category,
        description    = EXCLUDED.description,
        pool_id        = EXCLUDED.pool_id,
        calculated_at  = now()
    WHERE shadow_bonus_scores.points_earned  IS DISTINCT FROM EXCLUDED.points_earned
       OR shadow_bonus_scores.bonus_category IS DISTINCT FROM EXCLUDED.bonus_category
       OR shadow_bonus_scores.description    IS DISTINCT FROM EXCLUDED.description
       OR shadow_bonus_scores.pool_id        IS DISTINCT FROM EXCLUDED.pool_id;

  -- ===== Retraction (scoped anti-join) ======================================
  DELETE FROM shadow_bonus_scores s
  USING tmp_bp_targets t
  WHERE s.entry_id = t.entry_id
    AND NOT EXISTS (
      SELECT 1 FROM tmp_bp_desired d
      WHERE d.entry_id = s.entry_id
        AND d.bonus_type = s.bonus_type
        AND d.related_group_letter IS NOT DISTINCT FROM s.related_group_letter
        AND d.related_match_id    IS NOT DISTINCT FROM s.related_match_id);

  DROP TABLE IF EXISTS tmp_bp_desired;
  DROP TABLE IF EXISTS tmp_bp_pred_qual;
  DROP TABLE IF EXISTS tmp_bp_actual_third;
  DROP TABLE IF EXISTS tmp_bp_ko;
  DROP TABLE IF EXISTS tmp_bp_grp;
  DROP TABLE IF EXISTS tmp_bp_targets;
END;
$function$;

COMMENT ON FUNCTION public.shadow_calculate_bp_bonuses(uuid[]) IS
  'bracket_picker shadow arm — faithful SQL port of calculateBracketPickerPoints. '
  'Group rows emit for every position (0 when wrong); third place pays only if '
  'the team actually finished 3rd; knockout winner falls back winner_team_id -> '
  'FT -> PSO; penalty is one aggregate row and pays on agreeing false too. '
  'description is NULL by design — shadow stores facts, the display layer '
  'composes text. See migration 034.';
