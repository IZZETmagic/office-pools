-- =============================================================
-- 114 — THE DEADLINE REOPENS
-- =============================================================
-- Ryan's call, 2026-08-29: *"I want the admin to be able to update the
-- deadline."* The straggler rescue comes back.
--
-- This is the follow-up migration 109 asked for by name. Its header:
--
--   "If the rescue is wanted back, the fix is to drop the reveal-freeze rather
--    than to restore the hold — say so explicitly in a follow-up rather than
--    half-reverting this."
--
-- So: the reveal-freeze goes, and the hold does NOT come back. A pool is still
-- never held hostage by one member who never opened the app (109 stands), and
-- the admin can now reach that member anyway.
--
-- ## What was actually happening
--
-- An admin on a passed-deadline pool typed a new date, was shown a
-- confirmation dialog offering to "Reopen and tell everyone", pressed it — and
-- got a trigger exception in raw Postgres:
--
--   the table prediction for this pool closed at 2026-08-28 19:00:00+00 and
--   everyone's table is now open to the pool. It cannot be reopened.
--
-- The entire reopen path was already built and wired: the modal's `reopen`
-- branch, the "Your table is open again" push, the `wasReopened` email variant.
-- 109 made it unreachable without removing it. This migration reconnects it.
--
-- =============================================================
-- ⚠ WHAT THIS COSTS. READ THIS BEFORE CHANGING THE COPY.
-- =============================================================
-- Since 110 both SELECT policies on `league_table_predictions` read
-- `now() >= pools.league_table_lock_at`. There is no reveal stamp any more —
-- visibility is a live function of the clock. So moving a PASSED deadline into
-- the future does two things at once, and the second one is the dangerous one:
--
--   1. writes reopen         (enforce_league_table_before_lock, 078)
--   2. every table RE-HIDES  (both SELECT policies, 110)
--
-- Re-hiding is not un-seeing. Between the old deadline and the reopen, every
-- member could read every rival's order. Anyone who looked now gets a fresh
-- edit holding information the others may not have. The database cannot detect
-- that and must not pretend to: there is no record of who read what.
--
-- ⚠ THIS IS THEREFORE A DISCLOSED HARM, NOT A PREVENTED ONE. It clears CLAUDE.md's
-- disclosure gate only because the admin is told the mechanism, in those words,
-- on the dialog they press — "anyone who already looked can now re-order
-- knowing what their rivals put". Delete that sentence from SettingsTab and this
-- migration stops being defensible. The guard test in
-- lib/league/__tests__/tableDeadlineMoves.test.ts holds the copy in place.
--
-- The trade against 109's version is the honest one: a passed deadline that
-- CANNOT move means a member who forgets scores nothing for a whole season and
-- no one can help them. That is a certain harm to a known person. This is a
-- possible harm, visible to the admin making the call, in a pool of people who
-- know each other. Ryan's call, and it matches "no bad feelings" better than
-- telling someone their season is over on a technicality.
--
-- ## What is NOT changing
--
--   · `league_mode` stays immutable
--   · a deadline still cannot be set in the PAST (104) — reopening means
--     forward, to a real future instant members can work to
--   · moving it still re-arms the reminder (107)
--   · no reveal stamp comes back (110 stands) — one switch, still
--   · the write trigger (078) is untouched: it reads the clock, so writes
--     reopen on their own the moment the new deadline is in the future
--
-- BEFORE YOU RUN THIS:
--   SELECT prosrc FROM pg_proc WHERE proname = 'enforce_league_mode_immutable';
--   -- expect 110's, containing 'It cannot be reopened'
-- =============================================================


-- ------------------------------------------------- 1. the freeze comes out
--
-- Whole function replaced, as 109 and 110 did — a CREATE OR REPLACE that
-- dropped a clause by accident would silently undo an earlier migration rather
-- than fail, so every surviving guard is restated here in full.
CREATE OR REPLACE FUNCTION public.enforce_league_mode_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF OLD.league_mode IS NOT NULL
     AND NEW.league_mode IS DISTINCT FROM OLD.league_mode THEN
    RAISE EXCEPTION
      'league_mode is fixed at pool creation (% -> %). Changing mode mid-season strands every prediction already made — twenty club positions and 380 fixture picks do not convert into one another.',
      OLD.league_mode, NEW.league_mode;
  END IF;

  IF OLD.league_table_lock_at IS NOT NULL
     AND NEW.league_table_lock_at IS DISTINCT FROM OLD.league_table_lock_at THEN

    -- ⚠ 109's deadline-final block STOOD HERE and is deliberately gone. A
    -- passed deadline may now be moved forward, which reopens writes and
    -- re-hides every table. See this migration's header for what that costs
    -- and where the admin is told about it.

    -- FROM 104, AND NOW THE ONLY CONSTRAINT ON THE MOVE. It is load-bearing in
    -- a way it was not before: with the freeze gone, this is what stops a
    -- reopen landing in the past, which would reopen writes and re-reveal in
    -- the same instant and leave the pool in a state nobody chose.
    IF NEW.league_table_lock_at IS NOT NULL AND NEW.league_table_lock_at <= now() THEN
      RAISE EXCEPTION
        'a table deadline cannot be set in the past (%). It must be a future instant that members can still work to.',
        NEW.league_table_lock_at;
    END IF;

    -- FROM 107. A new deadline is a new window and earns its own reminder —
    -- and after a reopen it is the notice that reaches the member who forgot.
    NEW.table_deadline_reminder_sent_at := NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_league_mode_immutable() IS
  'Migrations 104 + 107 + 110 + 114. league_mode is immutable; league_table_lock_at may be moved to any FUTURE instant at any time, including after it has passed (114 — the straggler rescue 109 removed). Moving it clears table_deadline_reminder_sent_at. Reopening a passed deadline re-hides every table, because visibility is now() >= lock_at with no stamp (110); the admin is told so before confirming.';


-- ------------------------------------------------------- 2. the column note
--
-- The comment is the thing most likely to be read by whoever touches this next,
-- so it carries the reopen consequence rather than just the rule.
COMMENT ON COLUMN pools.league_table_lock_at IS
  'When the table prediction closes. ONE switch, not two (migration 110): at this instant writes stop and every member''s table becomes visible to every other member. Seeded at creation from the admin''s chosen deadline (falling back to the first un-locked matchweek''s kickoff). Movable to any FUTURE instant at any time — including after it has passed (114), which reopens writes AND re-hides every table, since visibility is a live function of this column. Read by trg_enforce_league_table_before_lock for writes and by both SELECT policies on league_table_predictions for reads.';


-- ------------------------------------------------------- 3. verify
--
-- The freeze is gone, the past-deadline guard is not:
--
--   SELECT prosrc LIKE '%It cannot be reopened%'  AS still_frozen,
--          prosrc LIKE '%cannot be set in the past%' AS past_guarded,
--          prosrc LIKE '%league_mode is fixed%'      AS mode_guarded
--     FROM pg_proc WHERE proname = 'enforce_league_mode_immutable';
--   -- expect  f | t | t
--
-- And the move itself, on a pool whose deadline has passed:
--
--   UPDATE pools SET league_table_lock_at = now() + interval '2 days'
--    WHERE pool_id = '<a passed table pool>';
--   -- expect 1 row, no exception
--
--   UPDATE pools SET league_table_lock_at = now() - interval '1 day'
--    WHERE pool_id = '<the same pool>';
--   -- expect: a table deadline cannot be set in the past
