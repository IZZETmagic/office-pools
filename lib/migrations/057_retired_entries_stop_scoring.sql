-- Migration 057: a retired entry stops being scored.
--
-- Plan: drafts/2026-08-24_league_pools_full_plan.md §0.7, decision 15, and the
-- product intent artifact *A Season in a League Pool* §8 — "They come off the
-- leaderboard and out of Showdown pairings", "Three doors, one behaviour ...
-- only the access differs."
--
-- ============================================================
-- WHAT WAS WRONG
-- ============================================================
-- Migration 056 added `pool_entries.retired_at` and changed the member_id FK to
-- ON DELETE SET NULL. Three of the four doors worked immediately, because they
-- delete the pool_members row and every read reaches an entry THROUGH that row:
-- a detached entry (member_id IS NULL) fails the inner join and disappears
-- everywhere at once, with no read changed.
--
-- `stop participating` is the fourth door and it KEEPS the membership on
-- purpose — the member stays in the pool for the banter without competing. So
-- member_id stays populated, the join still matches, and because NOTHING
-- anywhere read `retired_at` (it appeared only in lib/entries/retire.ts and its
-- tests) a stopped entry went on scoring every matchweek and stayed on the
-- leaderboard. The route's own comment already claimed otherwise.
--
-- Proven, not inferred: `scripts/verify-soft-delete.ts` reported it as a
-- FINDING at section 5 — still on leaderboard: true, still scoring: 800.
--
-- ============================================================
-- WHAT THIS DOES
-- ============================================================
-- One predicate — `AND pe.retired_at IS NULL` in the `priced` CTE. Nothing else
-- about the engine changes.
--
-- Scoped deliberately. `retired_at` is now a column every entry read COULD care
-- about, and filtering all 101 of them is the per-site fragility that 056
-- rejected when it chose the FK over a `left_at` flag. Only the SCORING and
-- LEADERBOARD paths filter it. A per-entry detail view showing a retired entry
-- is correct behaviour, not a bug.
--
--   this migration                 -> a retired entry stops being SCORED
--   lib/poolData.ts (same change)  -> a retired entry leaves the LEADERBOARD
--
-- ============================================================
-- ⚠ THE 055 FILE ON DISK HAD DRIFTED FROM PRODUCTION — READ THIS
-- ============================================================
-- 055's header claims "Body below is the LIVE definition, dumped from
-- pg_get_functiondef after applying, so this file cannot drift from what
-- production runs." That was NOT true. The applied body was 6,971 bytes; the
-- file's was 6,289. The 682-byte gap was TEN COMMENT LINES — three explanatory
-- blocks (the per-entry-scores header, the totals-are-recomputed header, and
-- the note on `changed`) present in production and missing from the file. Zero
-- code differed, so nothing behavioural was ever at risk.
--
-- Caught by hashing the function body on both sides before and after applying,
-- which is the only reason it was not silently overwritten by this migration.
-- The body below is the APPLIED 055 body plus the one predicate: 6,971 + 836 =
-- 7,807 bytes, verified. All ten comment lines are restored.
--
-- The lesson generalises: a file that says it was dumped from production is
-- still only a claim. Hash it before you trust it.
--
-- ============================================================
-- KNOWN, DELIBERATELY NOT DONE HERE
-- ============================================================
--   * `league_match_scores` and `league_entry_totals` rows for a retired entry
--     are LEFT INTACT. Decision 15 restores a season in full, including the
--     matchweeks that completed while the member was away, so the points must
--     survive. This stops new scoring only.
--   * The World Cup's `shadow_finalize_totals` and `lite_recalc_entry` ASSIGN
--     rank numbers and do not filter retired_at, so a retired World Cup entry
--     would consume a rank and leave a visible gap (1, 3, 4...). Dormant: the
--     World Cup completed 16 Jul 2026 and lite_recalc_entry early-returns for
--     league pools. Tracked, not fixed here — outside the agreed scope of this
--     phase; it belongs with the live-leaderboard work.
--   * Nothing writes `league_entry_totals.final_rank` yet. When the live
--     leaderboard phase adds ranks, that writer MUST carry this predicate too.

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

  -- ------------------------------------------------------------------
  -- Per-entry scores. One statement over every pool playing this season.
  -- ------------------------------------------------------------------
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
      -- Migration 057. A RETIRED entry does not score.
      --
      -- 056 made leaving a pool DETACH an entry (member_id -> NULL), and the
      -- inner join to pool_members two lines up drops a detached entry on its
      -- own — which is why leave, admin-removal and discard-a-spare needed no
      -- change here. `stop participating` is the door that KEEPS the
      -- membership, so member_id stays populated and that join still matches.
      -- Without this predicate a member who stopped participating carried on
      -- being scored every matchweek.
      --
      -- Their league_match_scores rows are deliberately NOT deleted: decision
      -- 15 restores a season IN FULL, so the points have to survive. This only
      -- stops NEW scoring; the leaderboard read is what hides them.
      AND pe.retired_at IS NULL
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

  -- ------------------------------------------------------------------
  -- Totals: RECOMPUTED from the score rows, never incremented. A correction
  -- after full time must be able to take points away, which an increment
  -- cannot do.
  -- ------------------------------------------------------------------
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
    -- `changed` distinguishes "scored again because the result moved" from
    -- "re-scored an unchanged result". Both write; only one is interesting.
    'changed', v_changed,
    'scored', v_scored,
    'entries', v_entries);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.league_score_fixture(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_score_fixture(uuid) TO service_role;

-- ============================================================
-- VERIFY
-- ============================================================
--   npx tsx scripts/verify-soft-delete.ts
--
-- Section 5 must now PASS rather than print a FINDING: after retiring an
-- attached entry, re-scoring a fixture must leave its total unchanged.
