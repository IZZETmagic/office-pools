-- =============================================================
-- SCHEDULING THE LEAGUE CRONS — 2026-08-28
-- =============================================================
-- Three routes have existed since phase 6 with no `cron.job` row, so the entire
-- league notification stack has never run once. This is what turns it on.
--
-- ⚠ RUN MIGRATION 108 FIRST. Without it, `league_queue_matchweek_notices`
-- queues matchweek notices for EVERY pool in the season regardless of mode, and
-- switching on the two jobs below would hand every Predict the Table and Last
-- Man Standing pool thirty-eight weeks of "you haven't picked yet" — a reminder
-- whose condition those modes can never satisfy, because the consumer reads
-- `league_predictions` and neither mode writes to it.
--
--   SELECT prosrc ILIKE '%league_mode IN (''pickem'', ''showdown'')%'
--     FROM pg_proc WHERE proname = 'league_queue_matchweek_notices';
--   -- must be TRUE before running section 2.
--
-- ## What Predict the Table actually needs, and what it already has
--
-- Only the first two jobs are notifications, and only one of the three is
-- strictly required for the mode to function:
--
--   ALREADY RUNNING, no new cron          job 8 (`sync-fixtures`, every minute)
--     · scores every Table pool whenever the real table moves
--     · takes the season-end snapshot, so a June feed correction cannot
--       restate an award already paid
--   ALREADY RUNNING, no cron at all       database triggers
--     · the deadline closes writes; duels and LMS rounds settle
--   NEEDS THESE JOBS
--     · the pre-deadline reminder — the one notification this mode cannot
--       survive without, because a missed table costs the whole season
--     · the band counts it scores against
--
-- =============================================================


-- ---------------------------------------------------- 1. the off switches
--
-- ⚠ CREATE THESE FIRST, and not as ceremony. All three routes guard on
--
--     if (row?.setting_value === false) return skipped
--
-- and none of the rows exist. With no row the read returns null,
-- `undefined === false` is false, and the route proceeds — so the switches
-- already default to ON. That is what we want when scheduling them, but it also
-- means there is currently no way to turn them OFF short of editing `cron.job`.
--
-- This is the same shape as job 18, whose flag also fails open and which can
-- therefore only be stopped by `active = false`. Create the rows before the jobs
-- so the brake exists before the engine.
INSERT INTO sync_settings (setting_key, setting_value) VALUES
  ('league_outbox_enabled',         'true'::jsonb),
  ('league_notices_enabled',        'true'::jsonb),
  ('league_standings_poll_enabled', 'true'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;


-- ---------------------------------------------------- 2. the three jobs
--
-- Command shape copied from job 15 verbatim: `pg_net` POST, bearer token read
-- from the vault, 60s timeout. Do not inline the secret.

-- THE DRAIN, SCHEDULED BEFORE THE PRODUCER.
--
-- Queueing without draining sends nothing and accumulates; draining an empty
-- queue is a no-op. So this one goes on first and is safe on its own.
--
-- ⚠ Every two minutes, not every five, and NOT because notifications are
-- urgent. This route also invalidates pool cache on fixture events, which sits
-- on the live-scoring path — the leaderboard moving on the goal is a product
-- guarantee, and a five-minute stale payload is a visible breach of it. The
-- notification half would be happy with far less.
SELECT cron.schedule(
  'league-outbox',
  '*/2 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://sportpool.io/api/cron/league-outbox',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_cron_secret'),
      'Content-Type',  'application/json'
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

-- THE PRODUCER. Hourly is ample: the lock reminder looks 24 hours ahead and the
-- table deadline reminder 72, so an hour of resolution costs nothing. Matches
-- the cadence the two dormant edge-function reminders used.
SELECT cron.schedule(
  'league-notices',
  '0 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://sportpool.io/api/cron/league-notices',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_cron_secret'),
      'Content-Type',  'application/json'
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

-- THE BANDS. Not a notification, and the one Table mode scores against.
--
-- The table's NUMBERS are already refreshed on every fixture completion by job
-- 8, which is far more often than this. What that does not cover is
-- `description` — the column `league_default_bands` reads to decide how many
-- Champions League, Europa and relegation places a competition has. That
-- changes for reasons unrelated to any match finishing: a coefficient award, a
-- rule change, a club barred from Europe. Weekly is generous for something that
-- moves a few times a decade, and cheap.
SELECT cron.schedule(
  'league-standings',
  '0 6 * * 1',
  $job$
  SELECT net.http_post(
    url := 'https://sportpool.io/api/cron/league-standings',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_cron_secret'),
      'Content-Type',  'application/json'
    ),
    timeout_milliseconds := 60000
  );
  $job$
);


-- ---------------------------------------------------- 3. verify
SELECT jobid, jobname, schedule, active
  FROM cron.job
 WHERE jobname IN ('league-outbox', 'league-notices', 'league-standings')
 ORDER BY jobname;

-- After the first hour, this should be non-zero for pickem and showdown pools
-- and ZERO for table and last_man_standing — that is migration 108 working.
SELECT COALESCE(po.league_mode, '(none)') AS mode, e.kind, count(*)
  FROM league_score_events e
  JOIN pools po ON po.pool_id = e.pool_id
 WHERE e.created_at > now() - interval '2 hours'
 GROUP BY 1, 2 ORDER BY 1, 2;


-- ---------------------------------------------------- 4. rollback
--
-- Unscheduling loses the job rows; the settings rows are what let you pause
-- without that, which is why section 1 exists.
--
--   UPDATE sync_settings SET setting_value = 'false'::jsonb
--    WHERE setting_key IN ('league_outbox_enabled', 'league_notices_enabled',
--                          'league_standings_poll_enabled');
--
--   SELECT cron.unschedule('league-outbox');
--   SELECT cron.unschedule('league-notices');
--   SELECT cron.unschedule('league-standings');
