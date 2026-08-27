-- =============================================================
-- 099 — THE TABLE DEADLINE REMINDS ITSELF
-- =============================================================
-- `table_deadline` has been a declared outbox kind since migration 059, listed
-- there as "reserved for the notifications phase; nothing writes these yet".
-- Phase 6 then built the three MATCHWEEK notices and left this one behind, and
-- it has sat unproduced ever since.
--
-- It is the one that matters most.
--
-- A missed matchweek costs a member one week out of thirty-eight. A missed
-- TABLE deadline costs them the entire season: the mode is a single decision,
-- it locks once, and migration 098 will not reopen it afterwards for anybody.
-- A member who simply never opens the screen currently hears nothing at all and
-- scores zero — which is the one failure this mode cannot survive, and the
-- opposite of "no bad feelings".
--
-- ## Why the kind could not be written even though it existed
--
-- Migration 071 constrained every outbox row to name exactly one target:
--
--   (fixture_id IS NOT NULL AND matchweek_id IS NULL)
--   OR (fixture_id IS NULL AND matchweek_id IS NOT NULL)
--
-- A table deadline is neither. It is a POOL-level fact — one date, on
-- `pools.league_table_lock_at`, with no matchweek and no fixture behind it. So
-- the kind was legal and the row was not.
--
-- This adds the third shape rather than inventing a target for it. Hanging the
-- event off, say, the next matchweek would be a lie in the data: the reminder
-- has nothing to do with that matchweek, and any consumer grouping by matchweek
-- would pick it up wrongly.
--
-- ⚠ The third shape is scoped to `table_deadline` ALONE. A pool-level row of
-- any other kind is still refused, so this does not quietly become a place to
-- put events that could not be modelled properly.
--
-- ## Once, and only to people who have not filed a table
--
-- CLAUDE.md's disclosure gate, in one sentence to the person receiving it:
--
--   "If you haven't put your table in order yet, we remind you once before the
--    deadline."
--
-- Both halves are load-bearing, exactly as they are for `lock_reminder`.
-- Reminding somebody who has already predicted carries no information and is
-- engagement bait; reminding twice is nagging. "Once" is enforced here by
-- `pools.table_deadline_reminder_sent_at`, stamped in the same statement that
-- queues. "Only those who have not filed" is enforced in the CONSUMER, because
-- who has predicted is a per-member fact while this row is per pool.
--
-- ## Why 72 hours and not the 24 the matchweek reminder uses
--
-- A matchweek reminder is 24h because the task is ten taps and it repeats every
-- week; being told the night before is enough. Ordering twenty clubs is a
-- sit-down decision made ONCE, and there is no next week to make up for it. 72
-- hours puts a weekend inside the window for a deadline that usually falls on a
-- Friday. It is a default, overridable per call.
--
-- =============================================================

-- ---------------------------------------------------- 1. the third target
ALTER TABLE league_score_events DROP CONSTRAINT IF EXISTS league_score_events_target_ck;
ALTER TABLE league_score_events ADD CONSTRAINT league_score_events_target_ck
  CHECK (
    (fixture_id IS NOT NULL AND matchweek_id IS NULL)
    OR
    (fixture_id IS NULL AND matchweek_id IS NOT NULL)
    OR
    -- Pool-level. Deliberately not open to every kind: a row with no target is
    -- only meaningful for an event that genuinely has none.
    (fixture_id IS NULL AND matchweek_id IS NULL AND kind = 'table_deadline')
  );

COMMENT ON CONSTRAINT league_score_events_target_ck ON league_score_events IS
  'An event names exactly one target: a fixture, a matchweek, or — for table_deadline alone — the pool itself. The consumer switches on which one is present, so a row with the wrong shape would be claimed and never handled.';

-- Same once-only guarantee the other two shapes get, for the pool-level shape.
-- Without it a producer that ran twice before the first row was drained would
-- queue two reminders for the same pool.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lse_pending_pool
  ON league_score_events (pool_id, kind)
  WHERE processed_at IS NULL AND fixture_id IS NULL AND matchweek_id IS NULL;

-- ---------------------------------------------------- 2. the once-only stamp
ALTER TABLE pools ADD COLUMN IF NOT EXISTS table_deadline_reminder_sent_at timestamptz;

COMMENT ON COLUMN pools.table_deadline_reminder_sent_at IS
  'When the single pre-deadline reminder was QUEUED for this table pool. Stamped by league_queue_table_deadline_notices in the same statement that queues, so a second run in the same minute queues nothing. Mirrors league_matchweeks.lock_reminder_sent_at.';

-- ---------------------------------------------------- 3. the producer
DROP FUNCTION IF EXISTS public.league_queue_table_deadline_notices(uuid, interval);

CREATE FUNCTION public.league_queue_table_deadline_notices(
  p_season_id       uuid DEFAULT NULL,
  p_reminder_window interval DEFAULT interval '72 hours'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_reminded int := 0;
BEGIN
  WITH due AS (
    SELECT po.pool_id
      FROM pools po
     WHERE po.league_mode = 'table'
       AND po.archived_at IS NULL
       AND (p_season_id IS NULL OR po.league_season_id = p_season_id)
       AND po.table_deadline_reminder_sent_at IS NULL
       AND po.league_table_lock_at IS NOT NULL
       -- Inside the window...
       AND po.league_table_lock_at <= now() + p_reminder_window
       -- ...and NOT already gone. A reminder for a deadline that has passed is
       -- worse than none: nothing can be done about it, and migration 098
       -- guarantees it cannot be reopened.
       AND po.league_table_lock_at > now()
  ),
  queued AS (
    INSERT INTO league_score_events (pool_id, kind)
    SELECT d.pool_id, 'table_deadline' FROM due d
    ON CONFLICT DO NOTHING
    RETURNING 1
  ),
  stamped AS (
    -- Stamped for every pool that was DUE, not only those that queued a row.
    -- A conflict means a reminder is already sitting in the outbox undrained,
    -- and leaving the stamp NULL there would re-queue it every hour once that
    -- row was processed.
    UPDATE pools po SET table_deadline_reminder_sent_at = now(), updated_at = now()
      FROM due d WHERE po.pool_id = d.pool_id
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM queued) INTO v_reminded;

  RETURN jsonb_build_object('table_deadline', v_reminded);
END;
$fn$;

COMMENT ON FUNCTION public.league_queue_table_deadline_notices(uuid, interval) IS
  'Queues one table_deadline outbox event per table pool whose deadline falls inside the window and has not passed. p_season_id NULL means every season (the cron); pass one to scope it, which is how it is tested without touching real members. Once-only per pool via pools.table_deadline_reminder_sent_at, stamped in the same statement that queues. Skips archived pools. WHO gets the reminder is the consumer''s job, because "has not filed a table" is a per-member fact.';

REVOKE EXECUTE ON FUNCTION public.league_queue_table_deadline_notices(uuid, interval) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_queue_table_deadline_notices(uuid, interval) TO service_role;
