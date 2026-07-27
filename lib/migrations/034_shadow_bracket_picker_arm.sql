-- ============================================================================
-- 034 — shadow_calculate_bp_bonuses: the bracket_picker shadow arm (INERT)
-- ============================================================================
-- DEPENDS ON: 033 (inputs_version bump — the group rule below reads
--             shadow_actual_standings, which must not be allowed to go stale)
-- Plan: drafts/2026-07-27_bracket_picker_shadow_arm.md
--
-- WHY THIS IS THE LAST BIG BLOCKER
-- --------------------------------
-- bracket_picker is 99 pools / 999 entries / 20% of all entries, and
-- readSource.ts HARD-FORCES those pools to 'prod'. Shadow cannot be the sole
-- engine — and prod_scoring_enabled cannot go false — until this exists.
--
-- It is four joins, not a second engine: shadow already owns the hard part
-- (shadow_actual_standings / shadow_actual_qualified — the FIFA-tiebreaker and
-- fair-play logic), and bracket_picker stores EXPLICIT picks rather than a
-- derived bracket, so there is no cascade and no podium resolution.
--
-- FAITHFUL PORT of lib/bracketPickerScoring.ts::calculateBracketPickerPoints.
-- The subtleties below are transcribed from that file, not inferred:
--
--   * GROUP rows are emitted for EVERY position, correct AND incorrect, with
--     points_earned = 0 when wrong. Every other rule emits only when it scores.
--     (859 submitted entries x 12 groups = 10,308 rows per position type,
--     which matches prod exactly.)
--   * THIRD PLACE pays only if the team ACTUALLY finished 3rd in its group.
--     Predicting Team A as 3rd-and-qualifying scores NOTHING if Team B finished
--     3rd, even though the qualify/eliminate call would otherwise be right.
--   * The ALL-8 bonus needs exactly 8 actual qualifiers and exact set equality
--     with the entry's top 8 by rank.
--   * KNOCKOUT winner falls back winner_team_id -> FT scores -> PSO. Reading
--     winner_team_id alone would under-score.
--   * PENALTY pays when prediction and reality agree on FALSE too ("no
--     penalties" predicted, none happened). That is the gameable behaviour
--     behind project_backlog_scoring_penalty_redesign and is reproduced
--     FAITHFULLY here, not quietly fixed — shadow must match prod before it can
--     replace it. It is ONE aggregate row per entry.
--   * PROVISIONAL group scoring (sync_settings.bp_provisional_scoring): group
--     ORDER points score against CURRENT standings for any group with >=1
--     completed match. Third-place points and the all-8 bonus stay gated on
--     true group completion regardless of the flag.
--
-- DESCRIPTIONS ARE DELIBERATELY NULL
-- ----------------------------------
-- Prod stores prose in `description` ("Group A 1st position: Correctly
-- predicted Mexico"). Reproducing that in SQL would put display strings in a
-- scoring function and fork formatStage() into a second implementation — the
-- exact duplication that caused the podium incident. Per Ryan's call, shadow
-- stores FACTS and the display layer composes the sentence from data it already
-- has (team, group, position, correctness). Parity is therefore checked on
-- points and keys, never on description.
--
-- INERT: nothing calls this. shadow_apply_changes is NOT wired to it and
-- shadow_eligible_entries still excludes bracket_picker. Wiring happens only
-- after an entry-for-entry parity pass against prod's 48,604 bp_* rows.
--
-- Reversible: DROP FUNCTION public.shadow_calculate_bp_bonuses(uuid[]);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.shadow_calculate_bp_bonuses(p_pool_ids uuid[] DEFAULT NULL)
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
         END AS actual_winner
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
         ELSE 0 END                                            AS points_earned
  FROM bracket_picker_group_rankings gr
  JOIN tmp_bp_targets t ON t.entry_id = gr.entry_id
  JOIN tmp_bp_grp g     ON g.tournament_id = t.tournament_id AND g.group_letter = gr.group_letter
  -- INNER JOIN: a team absent from standings is `actualIndex === -1 -> continue`.
  JOIN shadow_actual_standings sas
       ON sas.tournament_id = t.tournament_id
      AND sas.group_letter  = gr.group_letter
      AND sas.team_id       = gr.team_id
  WHERE g.is_complete OR (v_provisional AND g.is_started)

  UNION ALL
  -- (2) THIRD PLACE — only when the team ACTUALLY finished 3rd in its group.
  SELECT t.entry_id, t.pool_id,
         CASE WHEN pq.rn <= 8 THEN 'bp_third_qualifies' ELSE 'bp_third_eliminated' END,
         'bp_third_place', pq.group_letter::text, NULL::uuid,
         CASE WHEN pq.rn <= 8 THEN t.p_third_qual ELSE t.p_third_elim END
  FROM tmp_bp_pred_qual pq
  JOIN tmp_bp_targets t ON t.entry_id = pq.entry_id
  JOIN tmp_bp_actual_third at3
       ON at3.tournament_id = t.tournament_id AND at3.team_id = pq.team_id
  WHERE (pq.rn <= 8) = EXISTS (SELECT 1 FROM shadow_actual_qualified aq
                                WHERE aq.tournament_id = t.tournament_id AND aq.team_id = pq.team_id)
    AND (CASE WHEN pq.rn <= 8 THEN t.p_third_qual ELSE t.p_third_elim END) > 0

  UNION ALL
  -- (3) ALL-8 BONUS — exactly 8 actual qualifiers and exact set equality.
  SELECT t.entry_id, t.pool_id, 'bp_third_all_correct', 'bp_third_place', NULL, NULL::uuid, t.p_third_all
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
                       WHEN 'third_place' THEN t.p_tpm WHEN 'final' THEN t.p_final ELSE 0 END
  FROM bracket_picker_knockout_picks kp
  JOIN tmp_bp_targets t ON t.entry_id = kp.entry_id
  JOIN tmp_bp_ko ko     ON ko.match_id = kp.match_id
  WHERE ko.is_completed AND ko.actual_winner IS NOT NULL
    AND kp.winner_team_id = ko.actual_winner
    AND (CASE ko.stage WHEN 'round_32' THEN t.p_r32 WHEN 'round_16' THEN t.p_r16
                       WHEN 'quarter_final' THEN t.p_qf WHEN 'semi_final' THEN t.p_sf
                       WHEN 'third_place' THEN t.p_tpm WHEN 'final' THEN t.p_final ELSE 0 END) > 0

  UNION ALL
  -- (5) PENALTY — ONE aggregate row per entry. Pays when prediction and reality
  -- agree, INCLUDING agreeing on false.
  SELECT t.entry_id, t.pool_id, 'bp_penalty_predictions', 'bp_bonus', NULL, NULL::uuid, pen.pts
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
  SELECT t.entry_id, t.pool_id, 'bp_champion', 'bp_bonus', NULL, NULL::uuid, t.p_champ
  FROM tmp_bp_targets t
  JOIN bracket_picker_knockout_picks kp ON kp.entry_id = t.entry_id
  JOIN tmp_bp_ko ko ON ko.match_id = kp.match_id AND ko.stage = 'final'
  WHERE t.p_champ > 0 AND ko.is_completed
    AND ko.actual_winner IS NOT NULL AND kp.winner_team_id = ko.actual_winner;

  CREATE INDEX ON tmp_bp_desired (entry_id, bonus_type, related_group_letter, related_match_id);

  -- ===== Change-only UPSERT (description stays NULL by design) ==============
  INSERT INTO shadow_bonus_scores
    (entry_id, pool_id, bonus_type, bonus_category, related_group_letter, related_match_id, points_earned)
  SELECT entry_id, pool_id, bonus_type, bonus_category, related_group_letter, related_match_id, points_earned
  FROM tmp_bp_desired
  ON CONFLICT (entry_id, bonus_type, related_group_letter, related_match_id) DO UPDATE
    SET points_earned  = EXCLUDED.points_earned,
        bonus_category = EXCLUDED.bonus_category,
        pool_id        = EXCLUDED.pool_id,
        calculated_at  = now()
    WHERE shadow_bonus_scores.points_earned  IS DISTINCT FROM EXCLUDED.points_earned
       OR shadow_bonus_scores.bonus_category IS DISTINCT FROM EXCLUDED.bonus_category
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
