-- =============================================================
-- 107 — A NEW DEADLINE IS A NEW REMINDER
-- =============================================================
-- Migrations 099 and 104 are individually correct and, together, leave the
-- straggler unreminded. Found by applying them in the same session; it would
-- otherwise have shown up as "the person we reopened the pool for still didn't
-- file", which reads like apathy rather than a bug.
--
-- ## The interaction
--
-- 099 makes the pre-deadline reminder fire ONCE, enforced by
-- `pools.table_deadline_reminder_sent_at`, stamped in the same statement that
-- queues. Under 098's rule — a passed deadline can never reopen — once per
-- pool and once per deadline were the same thing, so the column meant both.
--
-- 104 pulled them apart. A deadline can now be moved forward AFTER it has
-- passed, which is a second window with a second closing date. But the stamp is
-- still set from the first, so:
--
--   Fri 19:00  the deadline passes. Alice never filed a table.
--   Sat 10:00  the admin extends to Wednesday. Everybody is told once, by
--              notifyTableDeadlineMoved.
--   Sun–Tue    the reminder producer looks at this pool, sees a non-NULL
--              `table_deadline_reminder_sent_at`, and skips it. Alice — the
--              only reason the deadline moved at all — gets no reminder about
--              the new one.
--
-- The pool spent its whole settled answer to buy Alice a second window, and
-- then didn't tell her it was closing. That is the worst version of this
-- feature: the cost is paid by everyone and the benefit reaches nobody.
--
-- ## The fix, and why it is in the trigger
--
-- The stamp means "we have reminded people about THIS deadline". So when the
-- deadline changes, it is stale by definition and is cleared.
--
-- It goes in the BEFORE UPDATE trigger rather than in the API route because the
-- route is not the only writer — the same reasoning as
-- `trg_enforce_prediction_before_kickoff` (migration 012 territory): mobile
-- writes rows directly, and a script or a support fix can move a date without
-- going near Next.js. A rule that only holds when one particular caller
-- remembers it is not a rule.
--
-- ⚠ It also means an admin who nudges a deadline by an hour re-arms the
-- reminder. That is the right way round: the consumer only mails members with
-- no table, so a re-armed reminder reaches nobody if everybody has filed, while
-- a suppressed one strands the person it was for. Cheap when wrong, costly the
-- other way.
--
-- =============================================================
-- BEFORE YOU RUN THIS
-- =============================================================
--   SELECT prosrc FROM pg_proc WHERE proname = 'enforce_league_mode_immutable';
--
-- Expect 104's, containing 'DELIBERATELY ABSENT'. If it is 077's, 104 has not
-- been applied and this will overwrite it with a version that references
-- `table_deadline_reminder_sent_at` — harmless only because 099 adds that
-- column. Apply 099 and 104 first.
-- =============================================================

CREATE OR REPLACE FUNCTION public.enforce_league_mode_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- UNCHANGED FROM 077, wording included.
  IF OLD.league_mode IS NOT NULL
     AND NEW.league_mode IS DISTINCT FROM OLD.league_mode THEN
    RAISE EXCEPTION
      'league_mode is fixed at pool creation (% -> %). Changing mode mid-season strands every prediction already made — twenty club positions and 380 fixture picks do not convert into one another.',
      OLD.league_mode, NEW.league_mode;
  END IF;

  -- UNCHANGED FROM 104. The reveal is set once: every member has read every
  -- other member's table by the time this is non-NULL, and no UPDATE can make
  -- that un-happen.
  IF OLD.league_table_revealed_at IS NOT NULL
     AND NEW.league_table_revealed_at IS DISTINCT FROM OLD.league_table_revealed_at THEN
    RAISE EXCEPTION
      'league_table_revealed_at is set once (% -> %). The tables in this pool have already been shown to everyone in it; that cannot be undone by moving a timestamp.',
      OLD.league_table_revealed_at, NEW.league_table_revealed_at;
  END IF;

  -- THE DEADLINE. Forward always, backward never.
  IF OLD.league_table_lock_at IS NOT NULL
     AND NEW.league_table_lock_at IS DISTINCT FROM OLD.league_table_lock_at THEN

    IF OLD.league_table_revealed_at IS NOT NULL THEN
      RAISE EXCEPTION
        'the tables in this pool were revealed at % and the deadline is fixed from then on. Reopening now would let somebody rewrite a table having already read everybody else''s.',
        OLD.league_table_revealed_at;
    END IF;

    IF NEW.league_table_lock_at IS NOT NULL AND NEW.league_table_lock_at <= now() THEN
      RAISE EXCEPTION
        'a table deadline cannot be set in the past (%). It must be a future instant that members can still work to.',
        NEW.league_table_lock_at;
    END IF;

    -- DELIBERATELY ABSENT: any check on whether OLD has already passed. That
    -- is scenario 3 — the straggler — and reopening is the point.

    -- NEW IN 107. The stamp records that people were reminded about the
    -- deadline that just changed, so it is stale the moment it does. Clearing
    -- it re-arms `league_queue_table_deadline_notices` for the new window;
    -- without this the straggler the extension exists for is the one member who
    -- hears nothing about it.
    --
    -- A BEFORE trigger assigning to NEW is the whole reason this is safe from
    -- every writer at once — mobile, scripts and the API route included.
    NEW.table_deadline_reminder_sent_at := NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_league_mode_immutable() IS
  'Migrations 104 + 107. league_mode is immutable; league_table_revealed_at is set-once; league_table_lock_at may be moved to any FUTURE instant, including after it has already passed (the straggler case), but never once the tables have been revealed. Moving it also CLEARS table_deadline_reminder_sent_at, because a new deadline is a new window and 099''s reminder must fire again for it. Supersedes 098 — do not apply 098 after this.';

COMMENT ON COLUMN pools.table_deadline_reminder_sent_at IS
  'When the pre-deadline reminder was QUEUED for the CURRENT deadline. Stamped by league_queue_table_deadline_notices in the same statement that queues, and cleared by enforce_league_mode_immutable whenever league_table_lock_at moves (migration 107) — so it is once per DEADLINE, not once per pool. A reopened deadline is a new window that the members who missed the first one have heard nothing about.';
