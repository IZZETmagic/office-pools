-- Migration 055 (vertical slice, S3): the league scoring engine.
--
-- Plan: drafts/2026-08-22_league_vertical_slice.md §3 S3.
-- Body below is the LIVE definition, dumped from pg_get_functiondef after
-- applying, so this file cannot drift from what production runs.
--
-- ============================================================
-- WHAT THIS IS, AND WHAT IT IS NOT
-- ============================================================
-- This is the LEAGUE's engine. It is not, and must never become, part of the
-- World Cup's `shadow_*` engine — those are the World Cup's and only ever that
-- (SPORTPOOL_PROGRAMME.md, the engine register). A league pool is invisible to
-- them by construction: league picks live in `league_predictions`, so every
-- shadow selector that starts FROM `predictions` sees zero rows.
--
-- Flat prices, no multipliers, no bracket gate — settled in the July league
-- plan. A league has no knockout rounds, so the multipliers have nothing to
-- multiply. The three `group_*` prices are reused as the flat tier:
--
--     exact      predicted score exactly right     -> group_exact_score
--     winner_gd  right outcome AND right margin    -> group_correct_difference
--     winner     right outcome only                -> group_correct_result
--     miss       wrong outcome                     -> 0
--
-- ⚠ A NON-EXACT DRAW SCORES winner_gd, NOT winner. Predicting 0-0 when it
-- finishes 1-1 is the right outcome and, trivially, the right margin (0), so it
-- takes the middle tier. An earlier version of this comment claimed winner_gd
-- was unreachable on a draw; that was wrong, and the behaviour is DELIBERATE
-- because it is exactly what the World Cup engine does — lib/scoring/core.ts
-- returns 'miss' only when the winners differ, then compares goal difference,
-- and two draws always share a difference of 0. The two engines must agree on
-- this or members playing both would see the same prediction scored differently.
--
-- ============================================================
-- IDEMPOTENCY, AND WHY league_fixture_state EXISTS
-- ============================================================
-- The sync arm calls this whenever a fixture's values move, including
-- corrections after full time. Totals are RECOMPUTED from
-- `league_match_scores`, never incremented — an increment cannot take points
-- away when a result is corrected. Verified: a 3-0 corrected to 1-1 moved four
-- entries to 'miss' and promoted the drawn prediction.
--
-- `league_fixture_state` records what was scored so a caller can distinguish
-- "re-scored because the result moved" from "re-scored an unchanged result".
--
-- ============================================================
-- THE CONSTRAINT THE SLICE RESTS ON
-- ============================================================
-- Writes league_match_scores, league_entry_totals and league_fixture_state
-- ONLY. Never pool_entries — two of its columns are the only doors by which a
-- league entry could reach the World Cup scoring selectors. Verified in the
-- probe: pool_entries untouched.
--
-- ============================================================
-- VERIFIED against production (rolled back), actual 3-0:
--   predicted 3-0 -> exact/100   4-1 -> winner_gd/75   2-1 -> winner/50
--   predicted 0-0 -> miss/0      0-2 -> miss/0
--   totals 100/75/50/0/0, exact_count and correct_count correct
--   second run: changed=false, totals unchanged (idempotent)
--   corrected to 1-1: all four home-win picks -> miss, the 0-0 -> winner_gd/75
--   an admin point_adjustment survives a re-score
--   pool_entries touched: 0
-- ============================================================

CREATE OR REPLACE FUNCTION public.league_score_fixture(p_fixture_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_season      uuid;
  v_mw_number   int;
  v_fx_number   int;
  v_kickoff     timestamptz;
  v_home        int;
  v_away        int;
  v_completed   boolean;
  v_prev        record;
  v_changed     boolean := true;
  v_scored      int := 0;
  v_entries     int := 0;
BEGIN
  -- Serialise per fixture. Two sync runs can observe the same completion, and
  -- both would otherwise recompute the same totals concurrently.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_fixture_id::text, 1));

  SELECT f.season_id, m.matchweek_number, f.fixture_number, f.kickoff_at,
         f.home_goals, f.away_goals, f.is_completed
    INTO v_season, v_mw_number, v_fx_number, v_kickoff, v_home, v_away, v_completed
    FROM league_fixtures f
    JOIN league_matchweeks m ON m.matchweek_id = f.matchweek_id
   WHERE f.fixture_id = p_fixture_id;

  IF v_season IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'fixture not found');
  END IF;

  -- Only a completed fixture with both goals can be scored. `completed_ck`
  -- already forbids is_completed with NULL home_goals, but away_goals is only
  -- tied to home by `result_pair_ck`, so both are checked rather than assumed.
  IF NOT v_completed OR v_home IS NULL OR v_away IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'fixture not completed', 'scored', 0);
  END IF;

  SELECT * INTO v_prev FROM league_fixture_state WHERE fixture_id = p_fixture_id;
  IF FOUND AND v_prev.home_goals = v_home AND v_prev.away_goals = v_away
     AND v_prev.is_completed = v_completed THEN
    v_changed := false;
  END IF;

  WITH priced AS (
    SELECT
      lp.entry_id,
      pm.pool_id,
      lp.predicted_home_score AS ph,
      lp.predicted_away_score AS pa,
      COALESCE(ps.group_exact_score, 100)        AS px_exact,
      COALESCE(ps.group_correct_difference, 75)  AS px_gd,
      COALESCE(ps.group_correct_result, 50)      AS px_win
    FROM league_predictions lp
    JOIN pool_entries pe  ON pe.entry_id = lp.entry_id
    JOIN pool_members pm  ON pm.member_id = pe.member_id
    JOIN pools po         ON po.pool_id = pm.pool_id
    LEFT JOIN pool_settings ps ON ps.pool_id = po.pool_id
    WHERE lp.fixture_id = p_fixture_id
      -- The pool must actually play THIS season. `league_predictions` has an FK
      -- to the fixture but nothing ties that fixture to the entry's pool until
      -- the full L4 trigger lands, so it is enforced here.
      AND po.league_season_id = v_season
  ),
  judged AS (
    SELECT
      entry_id, pool_id, ph, pa,
      CASE
        WHEN ph = v_home AND pa = v_away THEN 'exact'
        WHEN sign(ph - pa) = sign(v_home - v_away) AND (ph - pa) = (v_home - v_away) THEN 'winner_gd'
        WHEN sign(ph - pa) = sign(v_home - v_away) THEN 'winner'
        ELSE 'miss'
      END AS score_type,
      CASE
        WHEN ph = v_home AND pa = v_away THEN px_exact
        WHEN sign(ph - pa) = sign(v_home - v_away) AND (ph - pa) = (v_home - v_away) THEN px_gd
        WHEN sign(ph - pa) = sign(v_home - v_away) THEN px_win
        ELSE 0
      END AS pts
    FROM priced
  ),
  upserted AS (
    INSERT INTO league_match_scores (
      entry_id, fixture_id, pool_id, matchweek_number, fixture_number, kicked_off_at,
      score_type, base_points, total_points,
      predicted_home_score, predicted_away_score, actual_home_score, actual_away_score,
      calculated_at)
    SELECT entry_id, p_fixture_id, pool_id, v_mw_number, v_fx_number, v_kickoff,
           score_type, pts, pts, ph, pa, v_home, v_away, now()
      FROM judged
    ON CONFLICT (entry_id, fixture_id) DO UPDATE SET
      score_type           = EXCLUDED.score_type,
      base_points          = EXCLUDED.base_points,
      total_points         = EXCLUDED.total_points,
      predicted_home_score = EXCLUDED.predicted_home_score,
      predicted_away_score = EXCLUDED.predicted_away_score,
      actual_home_score    = EXCLUDED.actual_home_score,
      actual_away_score    = EXCLUDED.actual_away_score,
      calculated_at        = now()
    RETURNING entry_id, pool_id
  )
  SELECT count(*) INTO v_scored FROM upserted;

  WITH affected AS (
    SELECT DISTINCT lms.entry_id, lms.pool_id
      FROM league_match_scores lms
     WHERE lms.fixture_id = p_fixture_id
  ),
  totals AS (
    SELECT a.entry_id, a.pool_id,
           COALESCE(sum(s.total_points), 0)::int                              AS match_points,
           COALESCE(count(*) FILTER (WHERE s.score_type = 'exact'), 0)::int    AS exact_count,
           COALESCE(count(*) FILTER (WHERE s.score_type <> 'miss'), 0)::int    AS correct_count
      FROM affected a
      LEFT JOIN league_match_scores s ON s.entry_id = a.entry_id
     GROUP BY a.entry_id, a.pool_id
  ),
  written AS (
    INSERT INTO league_entry_totals (
      entry_id, pool_id, match_points, bonus_points, point_adjustment, total_points,
      exact_count, correct_count, updated_at)
    SELECT entry_id, pool_id, match_points, 0, 0, match_points, exact_count, correct_count, now()
      FROM totals
    ON CONFLICT (entry_id) DO UPDATE SET
      pool_id          = EXCLUDED.pool_id,
      match_points     = EXCLUDED.match_points,
      -- bonus_points and point_adjustment are NOT touched: this engine owns
      -- match points only, and an admin adjustment must survive a re-score.
      total_points     = EXCLUDED.match_points
                         + league_entry_totals.bonus_points
                         + league_entry_totals.point_adjustment,
      exact_count      = EXCLUDED.exact_count,
      correct_count    = EXCLUDED.correct_count,
      updated_at       = now()
    RETURNING entry_id
  )
  SELECT count(*) INTO v_entries FROM written;

  INSERT INTO league_fixture_state (fixture_id, home_goals, away_goals, status, is_completed, scored_at)
  VALUES (p_fixture_id, v_home, v_away, 'completed', v_completed, now())
  ON CONFLICT (fixture_id) DO UPDATE SET
    home_goals = EXCLUDED.home_goals, away_goals = EXCLUDED.away_goals,
    status = EXCLUDED.status, is_completed = EXCLUDED.is_completed, scored_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'fixture_id', p_fixture_id,
    'matchweek', v_mw_number,
    'result', format('%s-%s', v_home, v_away),
    'changed', v_changed,
    'scored', v_scored,
    'entries', v_entries);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.league_score_fixture(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_score_fixture(uuid) TO service_role;
