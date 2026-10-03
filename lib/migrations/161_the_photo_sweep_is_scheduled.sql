-- =============================================================
-- 161 — the photo sweep is scheduled
-- =============================================================
-- Drains banter_media_deletions (160) and queues orphaned uploads, hourly.
-- The app and web already call /api/banter/media/sweep straight after a
-- photo is deleted; this is the backstop for any call that never landed,
-- and the ONLY thing that finds orphans (a send that failed after upload).
--
-- ⚠⚠ DO NOT APPLY THIS UNTIL THE ROUTE IS DEPLOYED TO PRODUCTION.
-- A job pointed at a route that 404s looks healthy in cron.job forever
-- (see 135). Check first — expect 401 (gated), not 404 (absent):
--
--     curl -s -o /dev/null -w "%{http_code}\n" -X POST https://sportpool.io/api/banter/media/sweep
--
-- Command shape and vault secret copied from 135 (`sync_cron_secret`, the
-- value of CRON_SECRET). Hourly at :07, clear of the league jobs.
-- Idempotent: unschedules an existing job of the same name first.
-- =============================================================

DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'banter-media-sweep') THEN
    PERFORM cron.unschedule('banter-media-sweep');
  END IF;

  PERFORM cron.schedule(
    'banter-media-sweep',
    '7 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://sportpool.io/api/banter/media/sweep',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_cron_secret'),
        'Content-Type',  'application/json'
      ),
      timeout_milliseconds := 60000
    );
    $job$
  );
END
$mig$;

-- VERIFY after applying (expect one active row, then 200s in net._http_response —
-- job_run_details only proves the SQL ran, not that the route answered):
--
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'banter-media-sweep';
