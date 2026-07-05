-- =============================================================
-- shadow_calculate_bonuses — event-scoped + change-only writes
-- Refactor 2026-07-02. Replaces shadow_calculate_bonuses(p_pool_id uuid).
--
-- WHY: the old all-pools DELETE+INSERT full-refresh is O(total pools)
-- per event -> at 10k pools ~40-90s txns, massive WAL, replication lag,
-- autovacuum churn (the June saturation pattern). This decouples write
-- volume from total pool count.
--
-- CHANGES:
--  1) Signature p_pool_ids uuid[] DEFAULT NULL. NULL = all pools (old
--     behavior); array = scope EVERYTHING to WHERE pool_id = ANY(p_pool_ids).
--     Single set-based filter at the tmp_sb_targets choke-point (no N+1).
--  2) DELETE+INSERT -> materialize desired set once, then
--     INSERT ... ON CONFLICT DO UPDATE ... WHERE IS DISTINCT FROM
--     (writes ONLY changed rows) + a scoped anti-join retraction DELETE
--     for bonuses no longer earned (normally 0 rows -> no churn; preserves
--     parity with live full-refresh which retracts by absence).
--  3) calculated_at bumped only on real changes (stays a true change signal).
--
-- Behaviour-preserving for the NULL/all-pools case (same 5-category logic,
-- same COALESCE defaults, same gates). Shadow-only; never touches live tables.
-- =============================================================

DROP FUNCTION IF EXISTS public.shadow_calculate_bonuses(uuid);

CREATE OR REPLACE FUNCTION public.shadow_calculate_bonuses(p_pool_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- ===== Scope: in-scope entries (NULL p_pool_ids => all pools) =====
  DROP TABLE IF EXISTS tmp_sb_targets;
  CREATE TEMP TABLE tmp_sb_targets AS
  SELECT pe.entry_id, po.pool_id, po.tournament_id,
    ps.bonus_group_winner_and_runnerup, ps.bonus_both_qualify_swapped, ps.bonus_group_winner_only,
    ps.bonus_group_runnerup_only, ps.bonus_one_qualifies_wrong_position,
    ps.bonus_all_16_qualified, ps.bonus_12_15_qualified, ps.bonus_8_11_qualified,
    ps.bonus_correct_bracket_pairing, ps.bonus_match_winner_correct,
    ps.bonus_champion_correct, ps.bonus_second_place_correct, ps.bonus_third_place_correct
  FROM pool_members pm
  JOIN pool_entries pe ON pe.member_id = pm.member_id
  JOIN pools po ON po.pool_id = pm.pool_id
  LEFT JOIN pool_settings ps ON ps.pool_id = po.pool_id
  WHERE po.prediction_mode <> 'bracket_picker'
    AND (p_pool_ids IS NULL OR po.pool_id = ANY(p_pool_ids))   -- event-scoped, set-based
    AND ( pe.has_submitted_predictions
       OR ( po.prediction_mode = 'progressive'
            AND EXISTS (SELECT 1 FROM entry_round_submissions ers
                        WHERE ers.entry_id = pe.entry_id AND ers.has_submitted) ) );
  CREATE INDEX ON tmp_sb_targets(entry_id);

  -- ===== Desired set: the 5-category earned-bonus rows, materialized once =====
  DROP TABLE IF EXISTS tmp_sb_desired;
  CREATE TEMP TABLE tmp_sb_desired AS
  WITH
  gp AS (
    SELECT s.entry_id, s.group_letter,
      (array_agg(s.team_id) FILTER (WHERE s.position=1))[1] AS pw,
      (array_agg(s.team_id) FILTER (WHERE s.position=2))[1] AS pr
    FROM shadow_resolved_standings s
    WHERE s.entry_id IN (SELECT entry_id FROM tmp_sb_targets)
    GROUP BY s.entry_id, s.group_letter
  ),
  ga AS (
    SELECT a.tournament_id, a.group_letter,
      (array_agg(a.team_id) FILTER (WHERE a.position=1))[1] AS aw,
      (array_agg(a.team_id) FILTER (WHERE a.position=2))[1] AS ar
    FROM shadow_actual_standings a GROUP BY a.tournament_id, a.group_letter
  ),
  grp_done AS (
    SELECT tournament_id, group_letter FROM matches WHERE stage='group'
    GROUP BY tournament_id, group_letter HAVING count(*)>=6 AND bool_and(is_completed)
  ),
  allgroups_done AS (
    SELECT tournament_id FROM matches WHERE stage='group'
    GROUP BY tournament_id HAVING bool_and(is_completed)
  ),
  qcount AS (
    SELECT sq.entry_id, count(aq.team_id) AS correct
    FROM shadow_resolved_qualified sq
    JOIN tmp_sb_targets t ON t.entry_id = sq.entry_id
    LEFT JOIN shadow_actual_qualified aq ON aq.tournament_id = t.tournament_id AND aq.team_id = sq.team_id
    GROUP BY sq.entry_id
  ),
  qtotal AS (SELECT tournament_id, count(*) AS n FROM shadow_actual_qualified GROUP BY tournament_id)

  -- A. GROUP STANDINGS (column names/types set here define the temp table)
  SELECT t.entry_id, t.pool_id,
         x.bt                                        AS bonus_type,
         'group_standings'::text                     AS bonus_category,
         gp.group_letter::text                       AS related_group_letter,
         NULL::uuid                                  AS related_match_id,
         x.pts                                       AS points_earned,
         ('Group '||gp.group_letter||': '||x.bt)::text AS description
  FROM gp
  JOIN tmp_sb_targets t ON t.entry_id = gp.entry_id
  JOIN ga       ON ga.tournament_id = t.tournament_id AND ga.group_letter = gp.group_letter
  JOIN grp_done gd ON gd.tournament_id = t.tournament_id AND gd.group_letter = gp.group_letter
  CROSS JOIN LATERAL (VALUES (
    CASE WHEN gp.pw=ga.aw AND gp.pr=ga.ar THEN 'group_winner_and_runnerup'
         WHEN gp.pw=ga.ar AND gp.pr=ga.aw THEN 'both_qualify_swapped'
         WHEN gp.pw=ga.aw THEN 'group_winner_only'
         WHEN gp.pr=ga.ar THEN 'group_runnerup_only'
         WHEN gp.pw=ga.ar OR gp.pr=ga.aw THEN 'one_qualifies_wrong_position' END,
    CASE WHEN gp.pw=ga.aw AND gp.pr=ga.ar THEN COALESCE(t.bonus_group_winner_and_runnerup,150)
         WHEN gp.pw=ga.ar AND gp.pr=ga.aw THEN COALESCE(t.bonus_both_qualify_swapped,75)
         WHEN gp.pw=ga.aw THEN COALESCE(t.bonus_group_winner_only,100)
         WHEN gp.pr=ga.ar THEN COALESCE(t.bonus_group_runnerup_only,50)
         WHEN gp.pw=ga.ar OR gp.pr=ga.aw THEN COALESCE(t.bonus_one_qualifies_wrong_position,25) END
  )) AS x(bt, pts)
  WHERE x.bt IS NOT NULL AND x.pts > 0

  UNION ALL
  -- B. QUALIFICATION
  SELECT t.entry_id, t.pool_id, x.bt, 'qualification', NULL, NULL::uuid, x.pts,
         'Qualified '||qc.correct||'/'||qt.n
  FROM qcount qc
  JOIN tmp_sb_targets t ON t.entry_id = qc.entry_id
  JOIN qtotal qt ON qt.tournament_id = t.tournament_id
  JOIN allgroups_done ag ON ag.tournament_id = t.tournament_id
  CROSS JOIN LATERAL (VALUES (
    CASE WHEN qc.correct = qt.n THEN 'all_qualified_correct'
         WHEN qc.correct >= ceil(qt.n*0.75) THEN '75pct_qualified_correct'
         WHEN qc.correct >= ceil(qt.n*0.5) THEN '50pct_qualified_correct' END,
    CASE WHEN qc.correct = qt.n THEN COALESCE(t.bonus_all_16_qualified,75)
         WHEN qc.correct >= ceil(qt.n*0.75) THEN COALESCE(t.bonus_12_15_qualified,50)
         WHEN qc.correct >= ceil(qt.n*0.5) THEN COALESCE(t.bonus_8_11_qualified,25) END
  )) AS x(bt, pts)
  WHERE x.bt IS NOT NULL AND x.pts > 0

  UNION ALL
  -- C. BRACKET PAIRING (R32) -- WITHOUT-conduct predicted pairs
  SELECT rp.entry_id, t.pool_id, 'correct_bracket_pairing', 'bracket', NULL, m.match_id,
         COALESCE(t.bonus_correct_bracket_pairing,25), 'R32 correct pairing'
  FROM shadow_resolved_pairs rp
  JOIN tmp_sb_targets t ON t.entry_id = rp.entry_id
  JOIN matches m ON m.match_id = rp.match_id AND m.stage='round_32'
       AND m.home_team_id IS NOT NULL AND m.away_team_id IS NOT NULL
  WHERE rp.pred_home_team_id IS NOT NULL AND rp.pred_away_team_id IS NOT NULL
    AND rp.pred_home_team_id IN (m.home_team_id, m.away_team_id)
    AND rp.pred_away_team_id IN (m.home_team_id, m.away_team_id)
    AND COALESCE(t.bonus_correct_bracket_pairing,25) > 0

  UNION ALL
  -- D. MATCH WINNER (all completed knockout)
  SELECT rb.entry_id, rb.pool_id, 'match_winner_correct', 'bracket', NULL, m.match_id,
         COALESCE(t.bonus_match_winner_correct,50), 'Correct match winner'
  FROM shadow_resolved_brackets rb
  JOIN tmp_sb_targets t ON t.entry_id = rb.entry_id
  JOIN matches m ON m.match_id = rb.match_id AND m.is_completed
       AND m.stage IN ('round_32','round_16','quarter_final','semi_final','third_place','final')
  WHERE rb.predicted_winner_team_id IS NOT NULL AND m.winner_team_id IS NOT NULL
    AND rb.predicted_winner_team_id = m.winner_team_id
    AND COALESCE(t.bonus_match_winner_correct,50) > 0

  UNION ALL
  -- E. TOURNAMENT PODIUM
  SELECT t.entry_id, t.pool_id, x.bt, 'tournament', NULL, NULL::uuid, x.pts, x.descr
  FROM shadow_resolved_podium p
  JOIN tmp_sb_targets t ON t.entry_id = p.entry_id
  JOIN tournament_awards ta ON ta.tournament_id = t.tournament_id
  CROSS JOIN LATERAL (VALUES
    ('champion_correct',     p.champion_team_id,    ta.champion_team_id,    COALESCE(t.bonus_champion_correct,1000), 'Champion correct'),
    ('second_place_correct', p.runner_up_team_id,   ta.runner_up_team_id,   COALESCE(t.bonus_second_place_correct,25), 'Runner-up correct'),
    ('third_place_correct',  p.third_place_team_id, ta.third_place_team_id, COALESCE(t.bonus_third_place_correct,25),  'Third place correct')
  ) AS x(bt, pred, actual, pts, descr)
  WHERE x.pred IS NOT NULL AND x.actual IS NOT NULL AND x.pred = x.actual AND x.pts > 0;

  -- index to keep the retraction anti-join fast at scale
  CREATE INDEX ON tmp_sb_desired (entry_id, bonus_type, related_group_letter, related_match_id);

  -- ===== Change-only UPSERT: write ONLY rows whose value actually differs =====
  INSERT INTO shadow_bonus_scores
    (entry_id, pool_id, bonus_type, bonus_category, related_group_letter, related_match_id, points_earned, description)
  SELECT entry_id, pool_id, bonus_type, bonus_category, related_group_letter, related_match_id, points_earned, description
  FROM tmp_sb_desired
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

  -- ===== Retraction: drop bonuses no longer earned (scoped anti-join; usually 0 rows) =====
  DELETE FROM shadow_bonus_scores s
  USING tmp_sb_targets t
  WHERE s.entry_id = t.entry_id
    AND NOT EXISTS (
      SELECT 1 FROM tmp_sb_desired d
      WHERE d.entry_id = s.entry_id
        AND d.bonus_type = s.bonus_type
        AND d.related_group_letter IS NOT DISTINCT FROM s.related_group_letter
        AND d.related_match_id    IS NOT DISTINCT FROM s.related_match_id);

  DROP TABLE IF EXISTS tmp_sb_desired;
  DROP TABLE IF EXISTS tmp_sb_targets;
END;
$function$;
