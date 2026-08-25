-- Migration 066: the engine scores Results depth.
--
-- Plan: drafts/2026-08-24_league_pools_full_plan.md §4 L-C — "a branch in
-- `league_score_fixture`, not a second function."
--
-- ============================================================
-- THE LADDER COLLAPSES
-- ============================================================
--   Scores  : exact 100 / right winner and margin 75 / right winner 50 / 0
--   Results : right 100 / wrong 0
--
-- A Results member taps a badge. There is no scoreline to get exactly right and
-- no margin, so two of the four rungs have nothing to reward. `exact_count` is
-- therefore permanently 0 in a Results pool, and the rank cascade quietly runs
-- four rungs instead of five (total → exact → correct → bonus → first pick).
-- That is expected and stated in L-C; it is not a bug to be fixed later.
--
-- ============================================================
-- JUDGE FIRST, PRICE SECOND
-- ============================================================
-- The old `judged` CTE evaluated the same four-way CASE twice — once for the
-- score type, once for the points — so the ladder existed in two places that
-- had to agree. This splits them: `judged` decides WHAT happened, `scored_rows`
-- decides what it is WORTH.
--
-- That split is what makes this a branch rather than a rewrite. Results adds one
-- arm to the judgement and touches the pricing not at all. It is also the seam
-- Showdown will consume later — Showdown is "a layer, not a peer engine" (L-J)
-- precisely because it needs a weekly accuracy NUMBER and does not care which
-- ladder produced it.
--
-- ============================================================
-- THE PRICE OF A CORRECT TAP
-- ============================================================
-- `px_results` reads `group_exact_score`, the pool's TOP price, defaulting to
-- 100 — which is L-C's stated default. In a Results pool that column is
-- otherwise unused, and getting the outcome right is the most that can be
-- achieved, so the top price is the semantically right one to charge it at.
--
-- ⚠ This is a temporary borrow of a World-Cup-shaped column, like the other
-- three prices above it. L-D creates `league_pool_settings` with a real
-- `results_correct` column and this becomes a one-word change.
--
-- ============================================================
-- WHAT IS UNCHANGED, AND MUST STAY THAT WAY
-- ============================================================
--   * A pool with `league_depth IS NULL` — which is every pool created before
--     migration 064 — falls through to the Scores ladder byte for byte. The two
--     existing league pools were backfilled to 'scores' explicitly, so they are
--     covered twice over.
--   * Live scoring (063), retired entries (057), ranks and the weekly arrow
--     (059/061), and the outbox producer are all untouched.
--   * Totals are still RECOMPUTED, never incremented.

CREATE OR REPLACE FUNCTION public.league_score_fixture(p_fixture_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_season      uuid;
  v_mw_id       uuid;
  v_mw_number   int;
  v_fx_number   int;
  v_kickoff     timestamptz;
  v_home        int;
  v_away        int;
  v_status      text;
  v_outcome     text;
  v_completed   boolean;
  v_prev        record;
  v_changed     boolean := true;
  v_scored      int := 0;
  v_entries     int := 0;
  v_pool        uuid;
BEGIN
  -- Serialise per fixture. Two sync runs can observe the same completion, and
  -- both would otherwise recompute the same totals concurrently.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_fixture_id::text, 1));

  SELECT f.season_id, m.matchweek_id, m.matchweek_number, f.fixture_number, f.kickoff_at,
         f.home_goals, f.away_goals, f.is_completed, f.status
    INTO v_season, v_mw_id, v_mw_number, v_fx_number, v_kickoff, v_home, v_away, v_completed, v_status
    FROM league_fixtures f
    JOIN league_matchweeks m ON m.matchweek_id = f.matchweek_id
   WHERE f.fixture_id = p_fixture_id;

  IF v_season IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'fixture not found');
  END IF;

  -- Migration 063. A LIVE fixture scores too — this is the whole in-match
  -- feature. The gate is now "is it being played, and do we have a score",
  -- not "is it over".
  --
  --   live      -> score it, provisionally; every goal re-scores it
  --   completed -> score it, finally
  --   scheduled -> nothing has happened
  --   postponed / cancelled -> REFUSED even if goals somehow exist, because an
  --     abandoned match's score is not a result and must not enter a standing
  --
  -- Both goals are still checked rather than assumed: `completed_ck` forbids
  -- is_completed with NULL home_goals, but away_goals is only tied to home by
  -- `result_pair_ck`, and a live fixture has neither constraint helping it.
  IF v_status NOT IN ('live', 'completed') OR v_home IS NULL OR v_away IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'fixture not scoreable',
                              'status', v_status, 'scored', 0);
  END IF;

  -- The result expressed as an OUTCOME, which is what a Results-depth pool is
  -- predicting. Derived here rather than stored: it is a pure function of the
  -- score, and a second stored copy is a second thing that can disagree.
  v_outcome := CASE WHEN v_home > v_away THEN 'home'
                    WHEN v_home < v_away THEN 'away'
                    ELSE 'draw' END;

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
      lp.predicted_outcome    AS pout,
      -- NULL for every pool created before migration 064, which is exactly the
      -- Scores behaviour those pools already had.
      po.league_depth         AS depth,
      COALESCE(ps.group_exact_score, 100)        AS px_exact,
      COALESCE(ps.group_correct_difference, 75)  AS px_gd,
      COALESCE(ps.group_correct_result, 50)      AS px_win,
      -- The price of a correct TAP. Deliberately the pool's top price: in a
      -- Results pool getting the outcome right is the most that can be achieved,
      -- and `group_exact_score` is otherwise unused there. Defaults to 100, which
      -- is L-C's stated default. L-D gives this its own `results_correct` column
      -- on `league_pool_settings` and this line becomes a one-word change.
      COALESCE(ps.group_exact_score, 100)        AS px_results
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
  -- Migration 066. JUDGE first, PRICE second. They used to be one CASE
  -- evaluated twice, which meant the ladder was written out twice and could
  -- drift between the two copies. Splitting them is what lets Results add a rung
  -- to the judgement without touching the pricing at all.
  judged AS (
    SELECT
      entry_id, pool_id, ph, pa, pout, depth,
      px_exact, px_gd, px_win, px_results,
      CASE
        -- RESULTS depth: one tap, right or wrong. There is no scoreline to get
        -- exactly right and no margin, so the four-rung ladder collapses to two.
        -- `exact_count` is therefore permanently 0 for these pools and the rank
        -- cascade quietly runs four rungs instead of five — expected, per L-C.
        WHEN depth = 'results' THEN
          CASE WHEN pout = v_outcome THEN 'winner' ELSE 'miss' END
        -- SCORES depth, and NULL, which is every pool predating migration 064.
        WHEN ph = v_home AND pa = v_away THEN 'exact'
        WHEN sign(ph - pa) = sign(v_home - v_away) AND (ph - pa) = (v_home - v_away) THEN 'winner_gd'
        WHEN sign(ph - pa) = sign(v_home - v_away) THEN 'winner'
        ELSE 'miss'
      END AS score_type
    FROM priced
  ),
  scored_rows AS (
    SELECT j.entry_id, j.pool_id, j.ph, j.pa, j.pout, j.score_type,
      CASE j.score_type
        WHEN 'exact'     THEN j.px_exact
        WHEN 'winner_gd' THEN j.px_gd
        -- 'winner' means two different things by depth: the whole prize in a
        -- Results pool, the bottom rung in a Scores one. Depth is fixed per pool
        -- so it is never ambiguous within one leaderboard.
        WHEN 'winner'    THEN CASE WHEN j.depth = 'results' THEN j.px_results ELSE j.px_win END
        ELSE 0
      END AS pts
    FROM judged j
  ),
  upserted AS (
    INSERT INTO league_match_scores (
      entry_id, fixture_id, pool_id, matchweek_number, fixture_number, kicked_off_at,
      score_type, base_points, total_points,
      predicted_home_score, predicted_away_score, predicted_outcome,
      actual_home_score, actual_away_score,
      calculated_at)
    SELECT entry_id, p_fixture_id, pool_id, v_mw_number, v_fx_number, v_kickoff,
           score_type, pts, pts, ph, pa, pout, v_home, v_away, now()
      FROM scored_rows
    ON CONFLICT (entry_id, fixture_id) DO UPDATE SET
      score_type           = EXCLUDED.score_type,
      base_points          = EXCLUDED.base_points,
      total_points         = EXCLUDED.total_points,
      predicted_home_score = EXCLUDED.predicted_home_score,
      predicted_away_score = EXCLUDED.predicted_away_score,
      predicted_outcome    = EXCLUDED.predicted_outcome,
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

  -- The witness records what was ACTUALLY scored. `status` used to be hardcoded
  -- 'completed', which was harmless while only finished fixtures scored and is
  -- now wrong: migration 061's snapshot guard reads `is_completed` from this row
  -- to decide whether a matchweek is fully scored, so a live fixture must leave
  -- a witness that says so.
  INSERT INTO league_fixture_state (fixture_id, home_goals, away_goals, status, is_completed, scored_at)
  VALUES (p_fixture_id, v_home, v_away, v_status, v_completed, now())
  ON CONFLICT (fixture_id) DO UPDATE SET
    home_goals = EXCLUDED.home_goals, away_goals = EXCLUDED.away_goals,
    status = EXCLUDED.status, is_completed = EXCLUDED.is_completed, scored_at = now();

  -- ------------------------------------------------------------------
  -- Ranks, the movement snapshot, and the outbox.
  --
  -- Ranking happens HERE, in SQL, immediately after the totals it ranks —
  -- per the architecture rule, the backend computes and stores once and the
  -- frontends only display. A leaderboard that ranks at read time is the
  -- read-saturation bug this product already paid for once.
  -- ------------------------------------------------------------------
  FOR v_pool IN
    SELECT DISTINCT lms.pool_id FROM league_match_scores lms WHERE lms.fixture_id = p_fixture_id
  LOOP
    PERFORM league_finalize_ranks(v_pool);

    -- One row per (pool, fixture, kind) while unprocessed — the partial unique
    -- index enforces it, so a re-score does not queue the same work twice.
    INSERT INTO league_score_events (pool_id, fixture_id, kind)
    VALUES (v_pool, p_fixture_id, 'fixture_scored')
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Freeze the movement arrows if this fixture finished its matchweek. Called
  -- unconditionally and idempotent: the function itself decides whether the
  -- matchweek is complete and whether it has already been snapshotted.
  PERFORM league_snapshot_matchweek_ranks(v_mw_id);

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
--   npx tsx scripts/verify-results-depth.ts        -- both ladders, side by side
--   npx tsx scripts/verify-league-live-scoring.ts  -- Scores unchanged
--   npx tsx scripts/verify-league-leaderboard.ts   -- ranks/arrows/outbox unchanged
