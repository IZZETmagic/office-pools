-- Schedule the api-football sync via Supabase pg_cron + pg_net.
-- Runs every minute. The endpoint short-circuits when no live-window
-- match exists, so cost outside fixture windows is near-zero.
--
-- Replace ONE placeholder before running:
--   {{CRON_SECRET}}  the same value as CRON_SECRET in your Vercel env
--                    (the existing /api/cron/auto-submit route uses it too)

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent: if the job already exists, replace it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'api-football-sync') THEN
    PERFORM cron.unschedule('api-football-sync');
  END IF;
END $$;

SELECT cron.schedule(
  'api-football-sync',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://sportpool.io/api/cron/sync-fixtures',
    headers := jsonb_build_object(
      'Authorization', 'Bearer {{CRON_SECRET}}',
      'Content-Type',  'application/json'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- Inspect runs:
--   SELECT jobid, jobname, schedule, active FROM cron.job;
--   SELECT * FROM cron.job_run_details
--     WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'api-football-sync')
--     ORDER BY start_time DESC LIMIT 20;
--
-- Pause / resume:
--   UPDATE cron.job SET active = false WHERE jobname = 'api-football-sync';
--   UPDATE cron.job SET active = true  WHERE jobname = 'api-football-sync';
-- Remove entirely:
--   SELECT cron.unschedule('api-football-sync');
