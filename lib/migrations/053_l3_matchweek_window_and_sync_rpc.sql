-- NOTE: applied to production 2026-08-22 as migration 053 (051 and 052 were
-- taken by the round_number outage hotfix and its follow-up drop).
-- Re-probed against production inside a rolled-back DO block immediately
-- before applying: the CHECK validated against all 38 live rows; fixture_count>0
-- with a NULL lock was refused 23514; an empty matchweek with a FUTURE lock was
-- refused 23514; and deleting every fixture of the already-locked matchweek 1
-- SUCCEEDED with lock_at frozen at 2026-08-21 19:00:00+00.

-- ============================================================================
-- Migration 053 (L3): the league sync arm's database side.
--
--   1. Replace league_matchweeks_empty_has_no_lock_ck with a two-sided form that
--      the window trigger can actually satisfy.
--   2. Add matchweek_id to the window trigger's UPDATE OF list (defect D-2).
--   3. Add league_fixtures_completed_at_ck.
--   4. Create league_apply_fixture_sync(), the one statement every league sync
--      write goes through.
--   5. Data fix: original_kickoff_at back to NULL-unless-delayed semantics.
--
-- GUARD RULE (violated five times on this project; CREATE OR REPLACE succeeding
-- proves nothing because SQL and PL/pgSQL both bind column references at RUNTIME).
-- Every column this migration's function body references, verified present in
-- information_schema.columns on 2026-08-22:
--   league_fixtures: fixture_id, season_id, external_fixture_id, manual_override,
--     status, status_detail, home_goals, away_goals, is_completed, completed_at,
--     live_minute, live_period, live_added, last_synced_at, kickoff_at,
--     original_kickoff_at
--   league_matchweeks: matchweek_id, season_id, first_kickoff_at, last_kickoff_at,
--     fixture_count, completed_fixture_count, lock_at, updated_at
-- Constraints the function body must not break, verified live:
--   league_fixtures_result_pair_ck  CHECK ((home_goals IS NULL) = (away_goals IS NULL))
--   league_fixtures_completed_ck    CHECK ((NOT is_completed) OR (home_goals IS NOT NULL))
--   league_fixtures_status_ck       CHECK (status IN ('scheduled','live','completed','postponed','cancelled'))
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------- 1. The CHECK
ALTER TABLE league_matchweeks
  DROP CONSTRAINT league_matchweeks_empty_has_no_lock_ck;

ALTER TABLE league_matchweeks
  ADD CONSTRAINT league_matchweeks_lock_state_ck
  CHECK ( (fixture_count > 0 AND lock_at IS NOT NULL)
       OR (fixture_count = 0 AND (lock_at IS NULL OR lock_at <= now())) );

COMMENT ON CONSTRAINT league_matchweeks_lock_state_ck ON league_matchweeks IS
  'Replaces league_matchweeks_empty_has_no_lock_ck, a biconditional that was unsatisfiable in a '
  'reachable state: refresh_league_matchweek_window''s lock CASE keeps a PASSED lock_at while the '
  'aggregate reports fixture_count 0, so deleting the last fixture of a locked matchweek raised '
  '23514 and rolled back the DELETE — aborting a sync run in production. '
  'BOTH halves of the original are kept, deliberately. (a) fixture_count > 0 REQUIRES a lock: that '
  'is what lets enforce_league_prediction_before_lock be a time comparison instead of a race — with '
  'lock_at NULL the gate collapses to a per-fixture is_completed read taken from the writer''s own '
  'READ COMMITTED snapshot, and a member can commit a prediction on a match that finished 100ms '
  'earlier. (b) fixture_count = 0 with a FUTURE lock stays forbidden: that is the silent-emptiness '
  'class (an "open" matchweek with no games). What is NEW is that fixture_count = 0 with a PAST '
  'lock is now legal, and means "this week ran and its fixtures were subsequently removed" — the '
  'freeze invariant: once a matchweek locks, its lock instant never moves. '
  'now() is not IMMUTABLE and that is deliberate: for a fixed row "lock_at <= now()" is MONOTONE — '
  'once true it never becomes false — so a row valid at pg_dump time is valid at restore time, and '
  'the invalid combination (empty + future lock) is invalid at both ends. Do not "tidy" this into a '
  'static predicate without re-deriving that argument. '
  'CONSEQUENCE FOR L12: an admin "reopen this matchweek" override must MOVE lock_at to a future '
  'instant, never NULL it. NULLing is refused here. '
  'CONSEQUENCE FOR L7: league_round_states must map fixture_count = 0 to a terminal state, never '
  '''open''.';

-- ---------------------------------------- 2. Defect D-2: matchweek_id must fire
-- AFTER UPDATE OF kickoff_at, is_completed did not include matchweek_id, so moving
-- a fixture between matchweeks left BOTH sides' fixture_count / first_kickoff_at /
-- lock_at stale forever, silently — and manufactured the abort fixed in step 1.
-- The function body is FOR EACH STATEMENT and recomputes every matchweek, so one
-- firing repairs both the source and the destination.
DROP TRIGGER trg_refresh_league_matchweek_window_upd ON league_fixtures;
CREATE TRIGGER trg_refresh_league_matchweek_window_upd
  AFTER UPDATE OF kickoff_at, is_completed, matchweek_id ON league_fixtures
  FOR EACH STATEMENT EXECUTE FUNCTION refresh_league_matchweek_window();

-- refresh_league_matchweek_window()'s BODY IS DELIBERATELY UNCHANGED. Its lock CASE
-- stays `WHEN mw.lock_at IS NULL OR mw.lock_at > now() THEN agg.first_k ELSE mw.lock_at END`.
-- The freeze is now expressible because step 1 stopped forbidding the state it produces.

-- ------------------------------------------------- 3. completed_at consistency
-- The sync can flip is_completed true -> false (a provider re-reports an FT with
-- NULL goals, or re-rules an abandonment). Nothing tied completed_at to it, so the
-- database would have accepted "not completed, but completed_at is set", which L7
-- and L8 will reasonably read as "this finished".
ALTER TABLE league_fixtures
  ADD CONSTRAINT league_fixtures_completed_at_ck
  CHECK (completed_at IS NULL OR is_completed);

-- ------------------------------------------------------------------- 4. The RPC
CREATE OR REPLACE FUNCTION public.league_apply_fixture_sync(
  p_season_id uuid,
  p_seen      text[],
  p_rows      jsonb,
  p_now       timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_seen    int   := 0;
  v_changed jsonb := '[]'::jsonb;
BEGIN
  -- Serialise ingest per season. Nothing else does: the route's sweep lock covers
  -- the recalc sweep, not the target loop, and two overlapping runs leave
  -- completed_fixture_count permanently undercounted (the statement trigger's
  -- snapshot aggregate vs its EvalPlanQual re-check). Transaction-scoped, free
  -- when uncontended.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_season_id::text, 0));

  -- (a) Liveness stamp for EVERY row the arm compared, changed or not. Assigns
  --     ONLY last_synced_at, which is absent from
  --     trg_refresh_league_matchweek_window_upd's UPDATE OF list, so this costs no
  --     matchweek recompute. Without it, "the arm looked and found nothing to do"
  --     is indistinguishable in the durable store from "the arm never ran".
  --     manual_override rows are excluded here too: we did not look at them.
  IF p_seen IS NOT NULL AND array_length(p_seen, 1) > 0 THEN
    UPDATE league_fixtures f
       SET last_synced_at = p_now
     WHERE f.season_id = p_season_id
       AND f.external_fixture_id = ANY (p_seen)
       AND NOT f.manual_override;
    GET DIAGNOSTICS v_seen = ROW_COUNT;
  END IF;

  -- (b) The value write. Skipped entirely when there is nothing to write, so a
  --     quiet tick fires the window trigger zero times (a statement trigger fires
  --     even when the UPDATE matches no rows).
  IF p_rows IS NOT NULL AND jsonb_array_length(p_rows) > 0 THEN
    WITH r AS (
      -- Every optional field is paired with an explicit set_* flag. jsonb_to_recordset
      -- renders an ABSENT key and an explicit JSON null identically as SQL NULL, so
      -- without the flags "clear the score" and "do not touch the score" would be the
      -- same payload — and `status` is NOT NULL, `is_completed` is NOT NULL DEFAULT
      -- false, so getting it wrong either errors loudly or silently un-completes a
      -- finished fixture.
      SELECT * FROM jsonb_to_recordset(p_rows) AS x(
        external_fixture_id text,
        set_status          boolean,
        status              text,
        set_status_detail   boolean,
        status_detail       text,
        set_goals           boolean,
        home_goals          integer,
        away_goals          integer,
        set_completed       boolean,
        is_completed        boolean,
        set_live            boolean,
        live_minute         integer,
        live_period         text,
        live_added          integer
      )
    ),
    resolved AS (
      SELECT
        f.fixture_id,
        CASE WHEN COALESCE(r.set_status,        false) THEN r.status                        ELSE f.status        END AS n_status,
        CASE WHEN COALESCE(r.set_status_detail, false) THEN r.status_detail                 ELSE f.status_detail END AS n_status_detail,
        CASE WHEN COALESCE(r.set_goals,         false) THEN r.home_goals                    ELSE f.home_goals    END AS n_home_goals,
        CASE WHEN COALESCE(r.set_goals,         false) THEN r.away_goals                    ELSE f.away_goals    END AS n_away_goals,
        CASE WHEN COALESCE(r.set_completed,     false) THEN COALESCE(r.is_completed, false) ELSE f.is_completed  END AS n_is_completed,
        CASE WHEN COALESCE(r.set_live,          false) THEN r.live_minute                   ELSE f.live_minute   END AS n_live_minute,
        CASE WHEN COALESCE(r.set_live,          false) THEN r.live_period                   ELSE f.live_period   END AS n_live_period,
        CASE WHEN COALESCE(r.set_live,          false) THEN r.live_added                    ELSE f.live_added    END AS n_live_added
      FROM r
      JOIN league_fixtures f
        ON f.season_id           = p_season_id
       AND f.external_fixture_id = r.external_fixture_id
      -- manual_override enforced in SQL as well as in TypeScript. An unknown
      -- external_fixture_id simply fails to join: never inserted, never an error.
      WHERE NOT f.manual_override
    ),
    upd AS (
      UPDATE league_fixtures f
         SET status         = v.n_status,
             status_detail  = v.n_status_detail,
             home_goals     = v.n_home_goals,
             away_goals     = v.n_away_goals,
             is_completed   = v.n_is_completed,
             -- rising edge only; cleared when a completion is withdrawn (see
             -- league_fixtures_completed_at_ck).
             completed_at   = CASE WHEN v.n_is_completed THEN COALESCE(f.completed_at, p_now) ELSE NULL END,
             live_minute    = v.n_live_minute,
             live_period    = v.n_live_period,
             live_added     = v.n_live_added,
             last_synced_at = p_now
        FROM resolved v
       WHERE f.fixture_id = v.fixture_id
         -- RETURNING must count values APPLIED, not rows MATCHED. Without this
         -- predicate a cast bug that writes NULL to six fixtures still returns six
         -- rows and reports changed=6.
         AND (f.status, f.status_detail, f.home_goals, f.away_goals,
              f.is_completed, f.live_minute, f.live_period, f.live_added)
             IS DISTINCT FROM
             (v.n_status, v.n_status_detail, v.n_home_goals, v.n_away_goals,
              v.n_is_completed, v.n_live_minute, v.n_live_period, v.n_live_added)
      RETURNING f.fixture_id, f.external_fixture_id, f.status,
                f.home_goals, f.away_goals, f.is_completed
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb) INTO v_changed FROM upd u;
  END IF;

  RETURN jsonb_build_object('seen', v_seen, 'changed', v_changed);
END;
$fn$;

COMMENT ON FUNCTION public.league_apply_fixture_sync(uuid, text[], jsonb, timestamptz) IS
  'The single write path for league fixture sync. Returns {"seen": int, "changed": [ {fixture_id, '
  'external_fixture_id, status, home_goals, away_goals, is_completed}, ... ]}. '
  'SECURITY INVOKER is deliberate and differs from try_acquire_sweep_lock / release_sweep_lock, '
  'which are DEFINER: service_role has BYPASSRLS so this works for the cron, and any other caller '
  'updates 0 rows because league_fixtures carries a SELECT-only policy — which the caller''s '
  'written != proposed check turns into a loud error rather than a silent partial write. '
  'Do not "fix" this to SECURITY DEFINER. '
  'Never writes: kickoff_at, original_kickoff_at (L11 owns rescheduling), matchweek_id (L6), '
  'manual_override(_by), result_pushes_sent_at, result_push_recipients (L8), updated_at '
  '(trigger-maintained), or any identity column.';

REVOKE EXECUTE ON FUNCTION public.league_apply_fixture_sync(uuid, text[], jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_apply_fixture_sync(uuid, text[], jsonb, timestamptz)
  TO service_role;

-- ------------------------------------------------------- 5. original_kickoff_at
-- importLeagueSeason.ts:489 writes original_kickoff_at = kickoff_at at import, so
-- all 380 rows carry a non-NULL value equal to kickoff_at. The `matches` analogue,
-- original_match_date, is NULL unless delayed, and lib/matchStatus.ts:51-55 badges
-- "Delayed" whenever it is set on a not-started match — so reusing the shared
-- helper at L13 would badge the entire season Delayed, and the "has this moved?"
-- signal is dead on arrival.
-- Recoverable if wrong: the values it removes are all exactly equal to kickoff_at.
-- Shipped in the same commit as the importer fix, so a 2027/28 import does not
-- re-create them.
UPDATE league_fixtures
   SET original_kickoff_at = NULL
 WHERE original_kickoff_at = kickoff_at;   -- 380 rows on 2026-08-22

COMMIT;
