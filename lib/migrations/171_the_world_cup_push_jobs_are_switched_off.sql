-- =============================================================
-- 171 — THE WORLD CUP PUSH JOBS ARE SWITCHED OFF
-- =============================================================
-- Ryan, 2026-10-05: "yes, switch them off and go ahead with N3."
--
-- Five pg_cron jobs that push to World Cup pools. They read World Cup data
-- only, the tournament ended on 16 July, and they have sent nothing since —
-- but they kept running every 30 minutes, and one carried a dated landmine:
--
--   push-predict-reminders pushes "Make your picks — predictions lock in Xd"
--   once a day to anyone with an unsubmitted entry in an open pool whose
--   prediction_deadline is under a week away. It never excluded LEAGUE pools,
--   whose prediction_deadline is the season's last kickoff (2027-05-22 to
--   2027-05-30) and whose entries never set has_submitted_predictions. From
--   about 15 May 2027 it would have reminded every league member, daily,
--   about a deadline that does not exist (2026-10-05: 69 of 69 qualified).
--
-- Switched OFF rather than moved onto the outbox (N3): converting dormant,
-- World-Cup-shaped code buys nothing and carries risk. When a tournament is
-- next on the calendar they are rebuilt on the outbox, and the two pushes that
-- sit awkwardly with "no bad feelings" — a daily reminder for up to a week,
-- and cold-streak pushes — are decided then.
--
-- The route handlers stay (app/api/cron/push-*), callable only with the cron
-- secret or by a super admin. Rescheduling one is a deliberate act: read this
-- first, and the predict reminder now excludes league pools in code as well.
-- =============================================================

select cron.unschedule(jobname)
from cron.job
where jobname in (
  'push-deadline-warnings',
  'push-match-starting',
  'push-matchday-recap',
  'push-predict-reminders',
  'push-weekly-recap'
);
