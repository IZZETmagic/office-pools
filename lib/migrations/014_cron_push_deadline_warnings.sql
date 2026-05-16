-- Cron registration for the pre-deadline push warnings.
--
-- Mirrors the api-football-sync pattern: pg_cron calls a Vercel-hosted
-- endpoint with the cron Bearer secret. Runs every 30 minutes — enough
-- precision for the 24h/6h/1h windows without flooding the dispatcher.
--
-- NOTE: Run this in the Supabase SQL editor (not via the migration MCP)
-- only AFTER the /api/cron/push-deadline-warnings endpoint is deployed
-- to production. Otherwise the cron fires against a 404 every 30 min.
--
-- The dispatcher is idempotent and dedups via push_deadline_warnings_sent,
-- so re-running this command is safe.

SELECT cron.schedule(
  'push-deadline-warnings',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://sportpool.io/api/cron/push-deadline-warnings',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_cron_secret'),
      'Content-Type',  'application/json'
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- To unschedule (rollback):
-- SELECT cron.unschedule('push-deadline-warnings');
