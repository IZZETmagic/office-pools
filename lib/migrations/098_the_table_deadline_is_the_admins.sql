-- =============================================================
-- 098 — THE TABLE DEADLINE BELONGS TO THE ADMIN
-- =============================================================
-- Overturns half of migration 077, deliberately and on Ryan's call
-- (2026-08-25). Read 077's reasoning first — it is not being discarded, it is
-- being narrowed.
--
-- ## What 077 decided, and why it was too strict
--
-- 077 froze `pools.league_table_lock_at` at creation:
--
--   "The deadline is a promise. Moving it forward would retroactively close a
--    window members were told was open; moving it back would reopen one they
--    were told had shut, letting a late entry predict a table already
--    part-decided."
--
-- Both halves of that are still true and are still enforced below. What 077 did
-- not anticipate is the pool that starts MID-SEASON. Creation derives the
-- deadline as "the first kickoff of the first matchweek that has not locked",
-- so a pool created in October closes in three days whether or not anybody has
-- joined. The admin cannot say "everyone gets until the 31st to file a table",
-- which is the ordinary way a group of colleagues actually starts one.
--
-- The freeze was protecting FAIRNESS BETWEEN MEMBERS. It was doing so by
-- removing a decision that belongs to the admin.
--
-- ## What is enforced instead
--
-- Two rules, each one half of 077's sentence, stated as a condition rather than
-- as "never":
--
--   1. A deadline can never be moved INTO THE PAST. That is what "retroactively
--      closing a window members were told was open" actually looks like, and it
--      is still forbidden.
--
--   2. A deadline that has ALREADY PASSED can never be moved at all. Once the
--      table has shut, everyone who filed one in time is locked; reopening it
--      would hand somebody else a table that is further decided than the one
--      they were scored against. This is 077's second clause, kept whole.
--
-- Between those, an admin may move an OPEN deadline to any future instant. A
-- member cannot lose a window they had, and nobody gets one after the door shut.
--
-- ⚠ What this does NOT do: it does not stop an admin extending the deadline
-- deep into a season, so a member who files in November predicts a table that is
-- a third decided. That is the whole point of the change and it is the admin's
-- call for their own pool — the deadline is shown on the screen where members
-- predict, so nobody is misled about which one they are working to.
--
-- ⚠ Members are not told automatically. `deadline-changed` notifications fire
-- for `prediction_deadline` only; wiring the table deadline into that is
-- follow-up work, not part of this migration.
--
-- =============================================================
-- BEFORE YOU RUN THIS — the function is being REPLACED, not altered
-- =============================================================
-- CREATE OR REPLACE overwrites whatever production actually holds, and a
-- migration file is a claim about that, not evidence (055 was 682 bytes short
-- of the live function and would have eaten ten comment lines). Diff first:
--
--   SELECT pg_get_functiondef('public.enforce_league_mode_immutable'::regproc);
--
-- If what comes back is not 077's function plus nothing, STOP and reconcile
-- before applying this.
-- =============================================================

CREATE OR REPLACE FUNCTION public.enforce_league_mode_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- UNCHANGED FROM 077. Guarded on OLD being non-NULL so that stamping a mode
  -- onto a pool that has none yet still works; only a CHANGE is refused. Same
  -- shape as enforce_league_depth_immutable, deliberately. A changed mode
  -- strands every prediction already made.
  IF OLD.league_mode IS NOT NULL
     AND NEW.league_mode IS DISTINCT FROM OLD.league_mode THEN
    RAISE EXCEPTION
      'league_mode is immutable once set (% -> %). Every prediction already made assumes it.',
      OLD.league_mode, NEW.league_mode;
  END IF;

  -- THE TABLE DEADLINE. Movable while it is open; fixed the moment it passes.
  IF OLD.league_table_lock_at IS NOT NULL
     AND NEW.league_table_lock_at IS DISTINCT FROM OLD.league_table_lock_at THEN

    -- 077 clause two, kept whole: the window has shut and everyone who filed a
    -- table in time is locked against it. Reopening it is not an admin
    -- decision, it is a different competition.
    IF now() >= OLD.league_table_lock_at THEN
      RAISE EXCEPTION
        'the table prediction for this pool closed at % and cannot be reopened. Members who predicted are already locked against that deadline.',
        OLD.league_table_lock_at;
    END IF;

    -- 077 clause one: never retroactively close a window members can see is
    -- open. NULL is allowed through — clearing the deadline is not a table pool
    -- any more, and the mode guard above already governs that.
    IF NEW.league_table_lock_at IS NOT NULL AND NEW.league_table_lock_at <= now() THEN
      RAISE EXCEPTION
        'a table deadline cannot be set in the past (%). Members are looking at the old one right now.',
        NEW.league_table_lock_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON COLUMN pools.league_table_lock_at IS
  'When the table prediction closes. Seeded at creation from the admin''s chosen deadline (falling back to the first un-locked matchweek''s kickoff), and movable by the admin for as long as it has not passed — migration 098. Read by trg_enforce_league_table_before_lock, which silently refuses any prediction written at or after it, and by league_table_breakdown, which uses it to decide when rivals'' tables become visible.';
