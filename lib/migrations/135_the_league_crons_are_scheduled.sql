-- =============================================================
-- 135 — the league crons are scheduled
-- =============================================================
-- Four routes have existed since the league build and NONE of them has ever
-- run. Confirmed against production `cron.job` on 2026-09-05: 17 jobs
-- scheduled, none of them a league cron.
--
-- ⚠⚠ DO NOT APPLY THIS UNTIL THE ROUTES ARE DEPLOYED.
--
-- These jobs `net.http_post` at https://sportpool.io/api/cron/league-*. On
-- 2026-09-05 all four returned **404** while the long-deployed
-- /api/cron/sync-fixtures returned 401 — the control that proves the difference
-- is deployment, not the secret. Scheduling ahead of the deploy creates four
-- jobs hammering 404s, one of them every two minutes, and they would show up in
-- `cron.job` looking healthy. That false assurance is exactly why this gap went
-- unnoticed for so long.
--
-- Check first, and expect 401 (gated) rather than 404 (absent):
--
--     for r in league-outbox league-notices league-standings league-reconcile; do
--       curl -s -o /dev/null -w "$r %{http_code}\n" https://sportpool.io/api/cron/$r
--     done
--
-- WHY IT MATTERS
--
-- `league-outbox` is the only thing that drains `league_score_events`. Until it
-- runs, no matchweek notification is ever sent and no pool cache is invalidated
-- on a goal. `league-reconcile` is the only thing that can see a fixture moved
-- to a future date, so without it re-homing moves nothing, ever — the
-- per-minute sync looks no further than 30 minutes ahead of a kickoff it
-- already holds, by which point the source matchweek has always locked.
--
-- Command shape, timeout and vault secret are copied from job 8
-- (`api-football-sync`); `sync_cron_secret` verified against three live jobs.
-- The secret is never inlined.
--
-- Idempotent: each job is unscheduled first if it exists, so re-applying this
-- migration re-points a job rather than erroring or duplicating it.
-- =============================================================

DO $mig$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT * FROM (VALUES
      -- THE DRAIN, SCHEDULED FIRST. Queueing without draining accumulates and
      -- sends nothing; draining an empty queue is a no-op. Safe on its own.
      --
      -- ⚠ Every two minutes, and NOT because notifications are urgent. This
      -- route also invalidates pool cache on fixture events, which sits on the
      -- live-scoring path — the leaderboard moving on the goal is a product
      -- guarantee, and a five-minute stale payload visibly breaks it. The
      -- notification half would be happy with far less.
      ('league-outbox',    '*/2 * * * *'),

      -- THE PRODUCER. Hourly is ample: the lock reminder looks 24 hours ahead
      -- and the table deadline reminder 72, so an hour of resolution costs
      -- nothing. Matches the cadence the two dormant edge-function reminders
      -- used.
      ('league-notices',   '0 * * * *'),

      -- THE BANDS. The table's NUMBERS are already refreshed on every fixture
      -- completion by job 8. What that misses is `description` — the column
      -- `league_default_bands` reads to decide how many Champions League,
      -- Europa and relegation places a competition has. That moves for reasons
      -- unrelated to any match finishing: a coefficient award, a rule change, a
      -- club barred from Europe. A few times a decade, so weekly is generous.
      ('league-standings', '0 6 * * 1'),

      -- THE RESCHEDULE. Daily, per the route's own header — it re-reads every
      -- league season's fixture list and corrects kickoffs that have moved,
      -- then re-homes what the move displaced.
      --
      -- ⚠ MISSING FROM THE ORIGINAL DRAFT (drafts/2026-08-28), which scheduled
      -- only the three above. It is the one whose absence is structural rather
      -- than merely late: nothing else in the system can see a fixture move
      -- before its original kickoff arrives, and by then the source matchweek
      -- has locked and `league_apply_rehome` correctly refuses it.
      --
      -- 03:00 UTC — clear of auto-submit (00:00), the perf-log prune (04:15)
      -- and league-standings (06:00 Monday).
      ('league-reconcile', '0 3 * * *')
    ) AS t(jobname, schedule)
  LOOP
    -- cron.unschedule raises if the job does not exist, so ask first.
    IF EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = v_job.jobname) THEN
      PERFORM cron.unschedule(v_job.jobname);
    END IF;

    PERFORM cron.schedule(
      v_job.jobname,
      v_job.schedule,
      format(
        $job$
        SELECT net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_cron_secret'),
            'Content-Type',  'application/json'
          ),
          timeout_milliseconds := 60000
        );
        $job$,
        'https://sportpool.io/api/cron/' || v_job.jobname
      )
    );
  END LOOP;
END
$mig$;

-- VERIFY (expect four rows, all active):
--
--   SELECT jobname, schedule, active FROM cron.job
--    WHERE jobname LIKE 'league-%' ORDER BY jobname;
--
-- Then watch the first runs — a 404 here means the deploy check above was
-- skipped, and the jobs should be unscheduled until it passes:
--
--   SELECT j.jobname, r.status, r.return_message, r.start_time
--     FROM cron.job_run_details r JOIN cron.job j USING (jobid)
--    WHERE j.jobname LIKE 'league-%'
--    ORDER BY r.start_time DESC LIMIT 20;
