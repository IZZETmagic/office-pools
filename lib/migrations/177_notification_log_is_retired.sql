-- =============================================================
-- 177 — NOTIFICATION_LOG IS RETIRED
-- =============================================================
-- N4, step 2. The delivery record (migration 176) is what notification_log was
-- meant to be. It never held a row: nothing ever wrote to it, and its one
-- reference — the account-delete route clearing its user_id — went in the same
-- commit as 176.
--
-- ⚠ APPLY ONLY AFTER THAT COMMIT IS DEPLOYED. Until then the live delete route
-- still names this table. Checked 2026-10-07: 0 rows, no triggers, no cron job,
-- no function or view reads it, and its only foreign key is its own, to users.
-- =============================================================

drop table if exists public.notification_log;
