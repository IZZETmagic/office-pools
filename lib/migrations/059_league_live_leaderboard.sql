-- Migration 059: the leaderboard becomes live — ranks, movement, and the outbox.
--
-- Plan: drafts/2026-08-24_league_pools_full_plan.md §4 L-B, decisions 3, 4 and 5.
-- Product intent: *A Season in a League Pool* §4 — "3.32pm. Arsenal go 2-0 up and
-- that's exactly what you predicted, so you jump from fifth to second while the
-- game is still on."
--
-- ============================================================
-- WHAT WAS MISSING
-- ============================================================
-- `league_score_fixture` computed totals correctly and stopped there. Nothing
-- ever wrote `league_entry_totals.final_rank` or `.previous_final_rank` — ZERO
-- rows carried either — so a league leaderboard had totals but no position, no
-- movement arrows, and nothing to broadcast. `league_score_events` existed with
-- its unique-pending index and had no producer at all.
--
-- ============================================================
-- 1. league_finalize_ranks(pool) — Decision 9's cascade, verbatim
-- ============================================================
--   total_points DESC, exact_count DESC, correct_count DESC, bonus_points DESC,
--   then rung 5.
--
-- Rung 5 is `MIN(league_predictions.created_at)` per entry — "joined and picked
-- first" (decision 3). It CANNOT be `pool_entries.predictions_submitted_at`:
-- that column stays NULL for every league entry by design, because the league
-- write path never touches `pool_entries` — the load-bearing containment
-- constraint. Using it would collapse rung 5 for the whole league.
--
-- `entry_id` is appended as a final rung so the order is TOTAL. Without it two
-- entries identical to rung 5 get an arbitrary order that can flip between runs,
-- and a leaderboard that reshuffles on an unrelated re-score looks broken.
--
-- ⚠ A retired or detached entry is NOT ranked, and has its rank CLEARED.
-- Migrations 056/057: leaving a pool detaches an entry (member_id IS NULL) and
-- stopping participation retires it (retired_at IS NOT NULL). Neither competes,
-- so neither may occupy a position — otherwise the visible leaderboard reads
-- 1, 3, 4 with a silent gap where somebody used to be.
--
-- ============================================================
-- 2. league_snapshot_matchweek_ranks(matchweek) — the weekly arrow
-- ============================================================
-- Decision 4: `previous_final_rank` compares against the PREVIOUS MATCHWEEK,
-- not the previous score. `final_rank` stays live and moves during a match;
-- only the ARROW is weekly, or it would twitch on every goal.
--
-- The ordering is the subtle part. The snapshot runs AFTER ranks are finalised
-- for the fixture that completes a matchweek, so `previous_final_rank` holds the
-- standing INCLUDING that matchweek — which is then what the following
-- matchweek's arrows are measured against. Snapshotting before would measure
-- against a mid-week position nobody ever saw.
--
-- `league_matchweeks.ranks_snapshot_at` has existed unused since migration 050
-- for exactly this. It doubles as the idempotency guard: set once, never again.
--
-- ============================================================
-- 3. The outbox gets a producer, and `kind` is widened once
-- ============================================================
-- `league_score_fixture` now writes `league_score_events`. The partial unique
-- index `uq_lse_pending (pool_id, fixture_id, kind) WHERE processed_at IS NULL`
-- already guarantees one pending row per unit of work, so `ON CONFLICT DO
-- NOTHING` makes a re-score enqueue nothing new.
--
-- The `kind` CHECK is widened HERE (decision 5) to the notification kinds that
-- nothing writes yet, so the notifications phase is "write the producers and
-- handlers" rather than "migrate the outbox first, then build".
--
-- ============================================================
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ============================================================
--   * No consumer. This migration only PRODUCES events; draining them is the
--     cron route, and an outbox with no consumer is strictly better than the
--     current state of no outbox at all.
--   * No realtime trigger — migration 060.
--   * No change to how points are calculated. Every existing scoring assertion
--     must still hold; `scripts/verify-soft-delete.ts` is the proof.

-- ------------------------------------------------------------------ 1. kinds
ALTER TABLE league_score_events DROP CONSTRAINT IF EXISTS league_score_events_kind_ck;
ALTER TABLE league_score_events ADD CONSTRAINT league_score_events_kind_ck
  CHECK (kind IN (
    -- produced now
    'fixture_scored', 'pool_rescored',
    -- reserved for the notifications phase; nothing writes these yet
    'matchweek_opened', 'lock_reminder', 'matchweek_completed', 'table_deadline'
  ));

-- ------------------------------------------------------------------ 2. ranks
CREATE OR REPLACE FUNCTION public.league_finalize_ranks(p_pool_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_ranked int := 0;
BEGIN
  -- Competing entries get a position...
  WITH ranked AS (
    SELECT t.entry_id,
           ROW_NUMBER() OVER (
             ORDER BY t.total_points  DESC,
                      t.exact_count   DESC,
                      t.correct_count DESC,
                      t.bonus_points  DESC,
                      -- rung 5: joined and picked first (decision 3)
                      COALESCE(
                        (SELECT min(lp.created_at) FROM league_predictions lp
                          WHERE lp.entry_id = t.entry_id),
                        'infinity'::timestamptz
                      ) ASC,
                      -- total order, so an unrelated re-score never reshuffles
                      t.entry_id ASC
           )::int AS new_rank
      FROM league_entry_totals t
      JOIN pool_entries pe ON pe.entry_id = t.entry_id
     WHERE t.pool_id = p_pool_id
       AND pe.member_id IS NOT NULL   -- detached: left or was removed
       AND pe.retired_at IS NULL      -- retired: stopped participating
  )
  UPDATE league_entry_totals t
     SET final_rank = r.new_rank,
         updated_at = now()
    FROM ranked r
   WHERE t.entry_id = r.entry_id
     AND t.final_rank IS DISTINCT FROM r.new_rank;
  GET DIAGNOSTICS v_ranked = ROW_COUNT;

  -- ...and everyone else has theirs cleared, so a retired entry cannot leave a
  -- hole in the visible order or show a stale position if it is ever rendered.
  UPDATE league_entry_totals t
     SET final_rank = NULL, previous_final_rank = NULL, updated_at = now()
    FROM pool_entries pe
   WHERE pe.entry_id = t.entry_id
     AND t.pool_id = p_pool_id
     AND (pe.member_id IS NULL OR pe.retired_at IS NOT NULL)
     AND (t.final_rank IS NOT NULL OR t.previous_final_rank IS NOT NULL);

  RETURN v_ranked;
END;
$fn$;

COMMENT ON FUNCTION public.league_finalize_ranks(uuid) IS
  'Decision 9 cascade verbatim + rung 5 = MIN(league_predictions.created_at), '
  'with entry_id as a final rung for a total order. Excludes detached and '
  'retired entries and clears their rank. Called by league_score_fixture.';

-- --------------------------------------------------------------- 3. the arrow
CREATE OR REPLACE FUNCTION public.league_snapshot_matchweek_ranks(p_matchweek_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_season   uuid;
  v_complete boolean;
  v_done     timestamptz;
  v_rows     int := 0;
BEGIN
  SELECT m.season_id,
         (m.fixture_count > 0 AND m.completed_fixture_count >= m.fixture_count),
         m.ranks_snapshot_at
    INTO v_season, v_complete, v_done
    FROM league_matchweeks m
   WHERE m.matchweek_id = p_matchweek_id;

  -- Not finished yet, or already frozen. Both are ordinary, not errors: this is
  -- called after every fixture and must be a no-op for all but the last.
  IF v_season IS NULL OR NOT v_complete OR v_done IS NOT NULL THEN
    RETURN 0;
  END IF;

  UPDATE league_entry_totals t
     SET previous_final_rank = t.final_rank,
         updated_at = now()
    FROM pools po
   WHERE po.pool_id = t.pool_id
     AND po.league_season_id = v_season;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  UPDATE league_matchweeks SET ranks_snapshot_at = now(), updated_at = now()
   WHERE matchweek_id = p_matchweek_id;

  RETURN v_rows;
END;
$fn$;

COMMENT ON FUNCTION public.league_snapshot_matchweek_ranks(uuid) IS
  'Decision 4. Freezes previous_final_rank = final_rank once a matchweek is '
  'fully played, so movement arrows are weekly while final_rank stays live. '
  'ranks_snapshot_at is the idempotency guard. No-op until the matchweek ends.';

-- ------------------------------------------------------- 4. the engine, wired
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
         f.home_goals, f.away_goals, f.is_completed
    INTO v_season, v_mw_id, v_mw_number, v_fx_number, v_kickoff, v_home, v_away, v_completed
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

REVOKE EXECUTE ON FUNCTION public.league_finalize_ranks(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_finalize_ranks(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.league_snapshot_matchweek_ranks(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_snapshot_matchweek_ranks(uuid) TO service_role;

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
--   npx tsx scripts/verify-league-leaderboard.ts
--   npx tsx scripts/verify-soft-delete.ts     (scoring must be unchanged)
