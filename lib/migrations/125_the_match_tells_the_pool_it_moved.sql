-- =============================================================
-- 125 — THE MATCH TELLS THE POOL IT MOVED
-- =============================================================
-- ⚠ ADDITIVE ONLY. One new function, one new trigger. Nothing existing is
-- replaced, so there is no `md5(prosrc)` pre-check to run.
-- =============================================================
--
-- Ryan, 2026-08-31: *"the score and the time and the switching to live for the
-- matches should be broadcasted using the same broadcast feature."*
--
-- ## What was wrong
--
-- The duel card's fixture state — the score, the ticking minute, the flip from
-- "19:00" to LIVE — arrived by HTTP. A goal fired the leaderboard broadcast,
-- and the client then fetched `/api/pools/:id/duel-live` to find out what had
-- happened to the match. That is precisely the pattern migration 060's client
-- comment celebrates escaping:
--
--     "it was a doorbell, and then everyone fetched /live over HTTP anyway"
--
-- Fifty people watching one goal meant fifty HTTP round trips to learn a number
-- the database already knew and was already sending a message about.
--
-- Now the fixture state IS the message.
--
-- ## ⚠ THE OLD-vs-NEW COMPARISON IS THE WHOLE DESIGN
--
-- `league_apply_fixture_sync` (053, current body 105) writes in TWO arms:
--
--   (a) a liveness stamp — `SET last_synced_at = p_now` on EVERY row the sync
--       compared, changed or not, every tick, forever;
--   (b) the value write, which carries an `IS DISTINCT FROM` predicate and so
--       only matches rows that genuinely moved.
--
-- A trigger that fires on any UPDATE fires on arm (a) too. That is a message
-- per pool every sync tick, all season, including at 4am in February with no
-- football on — the exact shape of waste that made realtime 25.6% of database
-- time (memory/project_scalable_architecture.md).
--
-- ⚠ The obvious fix is an `AFTER UPDATE OF <columns>` list, the way
-- `trg_refresh_league_matchweek_window_upd` is declared and the way migration
-- 053 keeps the stamp from provoking a matchweek recompute. **It is not
-- available here.** Postgres refuses outright:
--
--     0A000: transition tables cannot be specified for triggers with column lists
--
-- So the filter moved inside the function, and the trigger takes BOTH
-- transition tables to do it. This is strictly stronger than a column list
-- would have been: `UPDATE OF` fires on a column being ASSIGNED, not on its
-- value changing, and arm (b) assigns all eight columns every time it runs. The
-- join below compares the eight values old-to-new and keeps only rows that
-- actually moved — so a re-write of identical data stays silent too, which a
-- column list would not have caught.
--
-- Arm (a) therefore costs one join over ~10 rows and sends nothing.
--
-- ## Why statement-level
--
-- Ten fixtures kicking off together is ONE statement. Per-row would send ten
-- messages per pool where one carries the same information, and this is a
-- simultaneity problem, not a volume one: everybody is watching the same match
-- at the same moment, so messages-per-write is the number that matters. Same
-- reasoning as 060.
--
-- ⚠ A statement trigger fires even when the UPDATE matched NO rows, so the
-- empty transition table is a real case and is checked first.
--
-- ## Why the existing pool topic, and not a new season topic
--
-- A fixture belongs to a SEASON and a topic belongs to a POOL, so one match
-- moving has to reach every pool playing that season (14 pools across 4 seasons
-- today). A `league:{season}` topic would be one send instead of N — but it
-- would need its own `realtime.messages` policy, a new channel, and a second
-- subscription on every client.
--
-- Riding `pool:{id}:leaderboard` costs nothing anywhere else: the socket is
-- already open, the JWT is already set, the policy already authorizes it by
-- pool membership, and this is simply a second EVENT on it. Per-recipient
-- billing is unchanged either way — a viewer receives one message per goal
-- under both designs. What a season topic would save is sends, and sends are
-- not what this system is short of.
--
-- ## Two kill switches, deliberately
--
--   league_fixture_broadcast_enabled  — stops THIS, and nothing else
--   leaderboard_broadcast_enabled     — the master, already understood by
--                                       operations, stops this and 060 together
--
-- Absent means ON for both, so a fresh environment works without seeding rows.
-- With either off the client keeps working: `duel-live` remains as the fallback
-- poll, which is also what covers a message dropped while a socket was down —
-- Realtime is a pipe, not a log.
--
-- ## Not a disclosure question
--
-- Nothing here is held back or timed. A match score is a public fact about a
-- football match, sent the moment the database learns it, to everyone at once.
-- The 48-hour hold in 123 governs who you PLAY next; it has never governed what
-- the score IS.
--
-- ## GUARD RULE — every column this body dereferences, verified live 2026-08-31
--   league_fixtures:    season_id, matchweek_id, fixture_number, status,
--                       home_goals, away_goals, is_completed, live_minute,
--                       live_period, live_added, status_detail, last_synced_at
--   league_matchweeks:  matchweek_id, matchweek_number
--   pools:              pool_id, league_season_id, archived_at
--   sync_settings:      setting_key, setting_value (jsonb)
-- =============================================================

CREATE OR REPLACE FUNCTION public.broadcast_league_fixtures()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  s record;  -- one row per season touched by this statement
  p record;  -- one row per pool playing that season
BEGIN
  -- ⚠ FIRST, and cheap: a statement trigger fires on an UPDATE that matched
  -- nothing, and there is no reason to read settings to send nothing.
  IF NOT EXISTS (SELECT 1 FROM new_rows) THEN
    RETURN NULL;
  END IF;

  IF COALESCE(
       (SELECT setting_value FROM sync_settings
         WHERE setting_key = 'league_fixture_broadcast_enabled'),
       to_jsonb(true)) = to_jsonb(false)
     OR COALESCE(
       (SELECT setting_value FROM sync_settings
         WHERE setting_key = 'leaderboard_broadcast_enabled'),
       to_jsonb(true)) = to_jsonb(false)
  THEN
    RETURN NULL;
  END IF;

  -- ⚠ GROUPED BY SEASON rather than assuming one. The sync writes one season
  -- per statement, but an admin correction or a backfill need not, and a
  -- cross-season statement would otherwise send one season's scores to the
  -- other season's pools.
  FOR s IN
    SELECT f.season_id,
           jsonb_agg(
             jsonb_build_object(
               -- ⚠ KEYS MATCH THE CLIENT'S FIXTURE SHAPE EXACTLY, so a message
               -- can be spread over a fixture with no translation layer. The
               -- matchweek NUMBER rides along so a client watching week 2 can
               -- drop a message about week 3 without asking anything.
               'number',      f.fixture_number,
               'matchweek',   mw.matchweek_number,
               'homeScore',   f.home_goals,
               'awayScore',   f.away_goals,
               'status',      f.status,
               'isCompleted', f.is_completed,
               'liveMinute',  f.live_minute,
               'livePeriod',  f.live_period,
               'liveAdded',   f.live_added
             ) ORDER BY f.fixture_number
           ) AS fixtures
      FROM new_rows f
      -- ⚠ THE FILTER. Same eight values, compared to what they were. Arm (a)
      -- of the sync touches only last_synced_at, so every row it stamped fails
      -- this predicate and the statement sends nothing at all.
      JOIN old_rows o ON o.fixture_id = f.fixture_id
       AND (o.status, o.status_detail, o.home_goals, o.away_goals,
            o.is_completed, o.live_minute, o.live_period, o.live_added)
           IS DISTINCT FROM
           (f.status, f.status_detail, f.home_goals, f.away_goals,
            f.is_completed, f.live_minute, f.live_period, f.live_added)
      -- INNER JOIN: a fixture with no matchweek cannot be placed on any card,
      -- so there is nothing to say about it.
      JOIN league_matchweeks mw ON mw.matchweek_id = f.matchweek_id
     GROUP BY f.season_id
  LOOP
    FOR p IN
      SELECT pool_id FROM pools
       WHERE league_season_id = s.season_id
         AND archived_at IS NULL      -- nobody is watching an archived pool
    LOOP
      PERFORM realtime.send(
        jsonb_build_object('season_id', s.season_id, 'fixtures', s.fixtures),
        'fixtures_update',
        'pool:' || p.pool_id::text || ':leaderboard',
        true                          -- private: same topic, same policy as 060
      );
    END LOOP;
  END LOOP;

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.broadcast_league_fixtures() IS
  'Sends live fixture state — score, status, minute — to every pool playing '
  'the season, as a `fixtures_update` event on the pool:{id}:leaderboard topic '
  'that migration 060 already established. Statement-level over a transition '
  'table: ten fixtures kicking off together is one message per pool, not ten. '
  'MUST be attached with BOTH transition tables — it compares the eight live '
  'columns old-to-new and sends nothing when they match, which is what keeps '
  'league_apply_fixture_sync''s per-tick last_synced_at stamp silent. A column '
  'list would be the usual way to do that and Postgres forbids one alongside a '
  'transition table (0A000). Honours league_fixture_broadcast_enabled and the '
  'leaderboard_broadcast_enabled master switch; absent means on. Migration 125.';

-- ⚠ BOTH TRANSITION TABLES. `old_rows` is not optional decoration — it is how
-- the function tells a real change from the liveness stamp. See the header for
-- why a column list cannot do this job.
DROP TRIGGER IF EXISTS broadcast_league_fixtures_upd ON league_fixtures;
CREATE TRIGGER broadcast_league_fixtures_upd
  AFTER UPDATE ON league_fixtures
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION broadcast_league_fixtures();

-- =============================================================
-- VERIFY
-- =============================================================
--   select pg_get_triggerdef(oid) from pg_trigger
--    where tgrelid = 'league_fixtures'::regclass and not tgisinternal
--      and tgname = 'broadcast_league_fixtures_upd';
--   -- must reference BOTH transition tables
--
-- That a liveness-only write stays silent is the property worth proving, and it
-- is provable without a browser:
--
--   select count(*) from realtime.messages
--    where topic like 'pool:%:leaderboard' and event = 'fixtures_update';
--   update league_fixtures set last_synced_at = now() where fixture_id = '<id>';
--   -- re-run the count: it must be UNCHANGED.
--
-- Whether a browser then re-paints is the half no SQL can prove.
