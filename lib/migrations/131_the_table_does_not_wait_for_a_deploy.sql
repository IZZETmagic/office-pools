-- =============================================================
-- 131 — THE TABLE DOES NOT WAIT FOR A DEPLOY
-- =============================================================
-- ⚠ ADDITIVE ONLY. Two new functions and two new triggers; nothing existing is
-- replaced, so there is no `md5(prosrc)` pre-check to run.
--
-- Plan: drafts/2026-09-02_table_mode_fix_and_rn_league_plan.md §A1.
-- Risk:  SPORTPOOL_PROGRAMME.md → R25.
--
-- ✅ APPLIED TO PRODUCTION 2026-09-02 (ujthamlehjyubbzxbnes). Both bodies
-- re-hashed against this file afterwards and identical:
--   league_standings_after_insert  1302040fcc35d8548608f176caffcd75  (448 b)
--   league_standings_after_update  0ef5035a0c09d4d86b5477e51c747538  (662 b)
--
-- ## Exercised against REAL production rows in rolled-back transactions
--
-- Because `plpgsql` resolves names at RUN time, a clean apply proves nothing —
-- the 081->082 lesson. What was actually proved, before applying:
--
--   * a `fetched_at`-only rewrite of all 20 rows — the shape of every sync tick
--     during an international break — changed **0** bonus_points. The diff guard
--     is the difference between this trigger and one that rescores forever
--   * a REAL rank move rescored the pools in that season and **only** those:
--     0 non-table pools touched
--   * `league_standings_final` gained **0** rows — the season-end snapshot
--     correctly declined while fixtures remain
--   * ⭐ the two pools frozen in production unfroze: *Predict the Table* rescored
--     5 of 6 entries (the 6th has no prediction and correctly stays 0), and
--     *Premier League Test Table Prediction* moved **760 -> 940**
--
-- ⚠ NOT observed live yet, and cannot be until 11 September: the trigger fires
-- when the standings are written, the standings are written when a fixture
-- completes, and there are no fixtures in flight during the international break.
-- The rolled-back run is the evidence; the first real one is matchweek 4.
-- =============================================================
--
-- Table mode's score is `league_entry_totals.bonus_points`, and
-- `league_score_table` is its ONLY writer — `league_finalize_ranks` merely READS
-- it as rung 4 of the sort cascade. So everything turns on what calls the
-- engine. Measured in production 2026-09-02, exactly one thing did:
--
--   * the member's own save (`table-prediction/route.ts`) — `last_scored`
--     landed within 200 ms of `last_member_save` in three separate pools
--
-- and the caller that SHOULD have, `league_after_standings_change`, existed in
-- the database and was wired to nothing. Its only caller lives in
-- `syncLeagueFixtures.ts`, which is not in the deployed build.
--
-- The consequence is not subtle: a table pool's score moved only while members
-- could still edit, and **after the deadline it stopped for good.** Two pools
-- were already frozen — *Predict the Table* (locked 28 Aug) and *Premier League
-- Test Table Prediction* (locked 30 Aug).
--
-- ## Why a trigger rather than "just deploy"
--
-- The deploy does fix it, and it is the bigger half. But it leaves the recompute
-- depending on WHICH code path happened to write the standings — the sync, the
-- unscheduled `league-standings` cron, a backfill, a script. That is the exact
-- condition migration **126** removed for fixtures, in one sentence: *the engine
-- does not wait for a deploy.* Table mode is the mode that just proved why that
-- sentence matters, so it gets the same treatment.
--
-- ## ⚠ STATEMENT-LEVEL, NOT ROW-LEVEL
--
-- `syncLeagueStandings` writes with ONE upsert of ~20 rows
-- (`onConflict: 'season_id,club_id'`). A row-level trigger would call
-- `league_after_standings_change` **twenty times** per sync, and that function
-- loops every table pool in the season and snapshots the final standings.
--
-- ## ⚠ TWO TRIGGERS, AND BOTH FIRE ON EVERY UPSERT
--
-- Verified on this database in a rolled-back transaction rather than assumed,
-- because it decides the shape:
--
--   first upsert (3 new rows):     INSERT new_rows = 3   UPDATE new_rows = 0
--   second upsert (all conflict):  INSERT new_rows = 0   UPDATE new_rows = 3
--
-- `INSERT ... ON CONFLICT DO UPDATE` fires BOTH statement triggers every time,
-- but the transition tables partition the rows correctly. So each arm simply
-- does nothing when its own transition table is empty, and the engine is called
-- once per statement, not twice. An INSERT trigger cannot reference `OLD TABLE`
-- at all, which is the other reason this is two functions and not one.
--
-- ## ⚠ THE DIFF IS THE POINT — `fetched_at` MOVES EVERY SYNC
--
-- The upsert rewrites all 20 rows on every run whether or not the table moved,
-- and stamps a fresh `fetched_at` each time. An undiffed trigger would therefore
-- rescore every table pool on every standings sync forever, including through
-- an international break when nothing has happened.
--
-- Diffed on the columns that actually reach a score:
--
--   rank         `league_score_table` reads club_id + rank, and nothing else
--   description  feeds `league_default_bands` → the top-N / Europa / relegation
--                band boundaries, which is what the bonuses are paid on
--   points, goals_diff, played
--                frozen by `league_snapshot_final_standings` into
--                `league_standings_final`, which is the record a FINISHED season
--                is paid against
--
-- Deliberately NOT in the diff: `fetched_at` (moves every sync — the whole
-- point), `form`, `movement`, `group_label` (display only).
--
-- ⚠ The set is the UNION of both consumers and is biased toward firing on
-- purpose. The costs are asymmetric: a missed fire is a frozen score, which is
-- the bug this migration exists to end; a surplus fire is a recompute over five
-- pools. When in doubt, fire.
--
-- ## ⚠ ERRORS ARE SWALLOWED, exactly as 126 swallows them
--
-- Raising here would roll back the feed's own standings write — losing the
-- ingest to protect a recompute, which is the wrong way round. A failure warns
-- into the Postgres log, and the next standings change tries again.
--
-- ## ⚠ IT SNAPSHOTS BEFORE IT SCORES, and that is load-bearing
--
-- `league_after_standings_change` calls `league_snapshot_final_standings` FIRST,
-- so that if this is the tick that ends the season, pools are paid against the
-- frozen table rather than a live third-party read a June correction could still
-- move. The diff guard protects it: a failed or empty fetch writes nothing, so
-- nothing fires, so a partial table is never snapshotted as final.
--
-- ## The switch
--
-- Shares `sync_settings.league_db_scoring_enabled` with 126, so all DB-side
-- league scoring has ONE switch rather than one per engine.
-- ⚠ That row DOES NOT EXIST today. Both triggers COALESCE to `true`, so scoring
-- is on — by fallback rather than by decision, and it cannot be turned OFF
-- without inserting the row first. Same shape as `sweep_time_box_enabled` (V3),
-- which the XL→Medium item called "the last flag to flip" when it could only be
-- created. Recorded, not fixed here: inserting a row to make it explicit is a
-- change of behaviour for 126 as well, and belongs in its own migration.

-- ------------------------------------------------------------------ INSERT arm
-- A brand-new standings row means a season we have never scored, or a club
-- appearing for the first time. No diff is possible or wanted — there is nothing
-- to compare against, and "new row" is itself the change.
CREATE OR REPLACE FUNCTION public.league_standings_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  s record;
BEGIN
  IF COALESCE(
       (SELECT setting_value FROM sync_settings
         WHERE setting_key = 'league_db_scoring_enabled'),
       to_jsonb(true)) = to_jsonb(false)
  THEN
    RETURN NULL;
  END IF;

  FOR s IN SELECT DISTINCT season_id FROM new_rows LOOP
    BEGIN
      PERFORM league_after_standings_change(s.season_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'league_standings_after_insert: season % failed: %',
        s.season_id, SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
END;
$fn$;

-- ------------------------------------------------------------------ UPDATE arm
-- The steady state. Only seasons whose table actually MOVED.
CREATE OR REPLACE FUNCTION public.league_standings_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  s record;
BEGIN
  IF COALESCE(
       (SELECT setting_value FROM sync_settings
         WHERE setting_key = 'league_db_scoring_enabled'),
       to_jsonb(true)) = to_jsonb(false)
  THEN
    RETURN NULL;
  END IF;

  FOR s IN
    SELECT DISTINCT n.season_id
      FROM new_rows n
      JOIN old_rows o
        ON o.season_id = n.season_id
       AND o.club_id   = n.club_id
     WHERE (n.rank, n.points, n.goals_diff, n.played, n.description)
           IS DISTINCT FROM
           (o.rank, o.points, o.goals_diff, o.played, o.description)
  LOOP
    BEGIN
      PERFORM league_after_standings_change(s.season_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'league_standings_after_update: season % failed: %',
        s.season_id, SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS league_standings_ins ON public.league_standings;
CREATE TRIGGER league_standings_ins
  AFTER INSERT ON public.league_standings
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.league_standings_after_insert();

DROP TRIGGER IF EXISTS league_standings_upd ON public.league_standings;
CREATE TRIGGER league_standings_upd
  AFTER UPDATE ON public.league_standings
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.league_standings_after_update();

COMMENT ON FUNCTION public.league_standings_after_insert() IS
  'Statement-level AFTER INSERT on league_standings: rescores every table pool '
  'in each season that gained rows. Pairs with league_standings_after_update — '
  'INSERT ... ON CONFLICT DO UPDATE fires BOTH statement triggers, and each arm '
  'no-ops when its own transition table is empty. Migration 131 (R25).';

COMMENT ON FUNCTION public.league_standings_after_update() IS
  'Statement-level AFTER UPDATE on league_standings: rescores table pools only '
  'for seasons whose table actually moved, diffed on (rank, points, goals_diff, '
  'played, description) — the columns that reach a score. fetched_at is excluded '
  'deliberately: the sync rewrites all 20 rows with a fresh stamp every run, so '
  'an undiffed trigger would rescore forever. Errors are swallowed to a WARNING '
  'because raising would roll back the feed''s own write. Migration 131 (R25).';

-- Engine-adjacent: nothing signed in calls these, the trigger does.
REVOKE EXECUTE ON FUNCTION public.league_standings_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.league_standings_after_update() FROM PUBLIC, anon, authenticated;
