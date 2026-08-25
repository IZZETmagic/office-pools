-- Migration 063: the engine scores a LIVE fixture, not only a finished one.
--
-- Plan: drafts/2026-08-24_league_pools_full_plan.md §0.4. Product intent, the
-- artifact *A Season in a League Pool* §4: "3.32pm. Arsenal go 2-0 up and that's
-- exactly what you predicted, so you jump from fifth to second while the game is
-- still on. 3.51pm, Everton pull one back ... and you slide to fourth. Nobody
-- refreshes anything."
--
-- ============================================================
-- ⚠ THIS DIVERGES FROM §0.4 AS WRITTEN, DELIBERATELY
-- ============================================================
-- §0.4 says: "Change the call-site condition, not the engine (it is already
-- idempotent)." That is not achievable, and the reason matters more than the
-- change: the ENGINE refuses a live fixture on its own —
--
--     IF NOT v_completed OR v_home IS NULL OR v_away IS NULL THEN
--       RETURN ... 'fixture not completed'
--
-- so opening only the call site would have produced a sync arm that dutifully
-- called the engine on every goal and an engine that dutifully declined, with
-- `ok: false` swallowed by the caller as "not an error, the next tick will get
-- it". Silent, and indistinguishable from working. Flagged to Ryan and approved
-- 2026-08-24 rather than diverging quietly.
--
-- The rest of §0.4 stands: the scoring MATHS is untouched, the engine is already
-- idempotent, and totals are recomputed rather than incremented — which is what
-- makes re-scoring the same fixture five times as a match unfolds safe.
--
-- ============================================================
-- THE GATE
-- ============================================================
--   live      -> scored, provisionally. Every goal re-scores it.
--   completed -> scored, finally.
--   scheduled -> nothing has happened yet.
--   postponed / cancelled -> REFUSED even if goals exist. An abandoned match's
--     score is not a result and must never enter a standing.
--
-- ============================================================
-- WHAT ALREADY HANDLED THIS, AND WHAT HAD TO CHANGE
-- ============================================================
-- Already correct, by luck and by design:
--   * Totals are RECOMPUTED from the score rows, so a goal that is later
--     disallowed takes its points back — the same property that made
--     after-full-time corrections safe.
--   * The outbox's partial unique index means a three-goal match queues ONE
--     pending event at a time, not three.
--   * Migration 061's snapshot guard requires every fixture in a matchweek to
--     have a witness with is_completed = true, so a live fixture correctly holds
--     the weekly movement arrows open until the match actually ends.
--
-- Had to change:
--   * `league_fixture_state.status` was hardcoded 'completed'. Harmless while
--     only finished fixtures scored; now actively wrong, because 061 reads
--     `is_completed` off that row to decide whether a matchweek is fully scored.
--     It now records what was really scored.
--
-- ============================================================
-- COST
-- ============================================================
-- Re-scoring a fixture five times instead of once is a rounding error: when the
-- World Cup's load was analysed, ALL scoring together was ~1.3% of database
-- time, against reads at 70% and realtime at 26%
-- (memory/project_scalable_architecture.md). The engine only runs for fixtures
-- whose values actually MOVED on that tick, so a live match costs one re-score
-- per goal, not one per minute.

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
-- ⚠ SUPERSEDED IN PART BY MIGRATION 061
-- ============================================================
-- The snapshot condition below was wrong: it fired as soon as the matchweek
-- looked complete (`completed_fixture_count >= fixture_count`), but complete and
-- SCORED are different moments. On a normal Saturday several 3pm fixtures finish
-- together, the sync marks them all complete, then scores them ONE AT A TIME —
-- so the first score call froze the arrows against a half-counted standing.
-- 061 additionally requires every fixture to have a `league_fixture_state`
-- witness. Caught by scripts/verify-league-leaderboard.ts before it ever ran
-- against a member.
--
-- ============================================================
-- VERIFY
-- ============================================================
--   npx tsx scripts/verify-soft-delete.ts
--
-- Section 5 must now PASS rather than print a FINDING: after retiring an
-- attached entry, re-scoring a fixture must leave its total unchanged.

REVOKE EXECUTE ON FUNCTION public.league_score_fixture(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_score_fixture(uuid) TO service_role;

-- ============================================================
-- VERIFY
-- ============================================================
--   npx tsx scripts/verify-league-live-scoring.ts   -- a match, goal by goal
--   npx tsx scripts/verify-league-leaderboard.ts    -- ranks/arrows/outbox unchanged
--   npx tsx scripts/verify-soft-delete.ts           -- scoring maths unchanged
