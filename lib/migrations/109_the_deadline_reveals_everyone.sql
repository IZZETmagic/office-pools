-- =============================================================
-- 109 — THE DEADLINE REVEALS EVERYONE
-- =============================================================
-- Ryan's call, 2026-08-28, narrowing migration 104 the day it landed:
--
--   "The predictions should all be revealed when the deadline has passed."
--
-- 104 held the reveal until EVERY competing entry had filed a table, and gave
-- the admin a "reveal without them" override for the case where somebody never
-- did. Both halves go. The deadline passing is now the only condition.
--
-- ## What this overturns, explicitly
--
-- "Everyone in, or nobody sees" — recorded in SPORTPOOL_PROGRAMME.md under
-- *Predict the Table* and implemented in 104 — is withdrawn. It was a good rule
-- with a real cost: a single member who never opened the app could hold a
-- twenty-person pool in the dark indefinitely, and the only exits were an admin
-- noticing and pressing a button, or extending the deadline again and again.
-- The simpler rule needs no admin at all:
--
--   The deadline passes. Everyone's table is shown. That is the whole rule.
--
-- It survives the one-sentence test in CLAUDE.md's disclosure gate without a
-- subordinate clause, which the previous rule could not.
--
-- ## ⚠ WHAT THIS COSTS, AND IT IS NOT SMALL
--
-- Migration 104 freezes `league_table_lock_at` once `league_table_revealed_at`
-- is set, because reopening after a reveal would let a member rewrite their
-- table having read everybody else's. That freeze is unchanged here.
--
-- But the reveal now fires AT the deadline rather than when everyone is in. So
-- the two combine: **the deadline can no longer be moved once it has passed.**
--
-- That is the straggler case — scenario 3 in 104's header, and the reason 098
-- was superseded in the first place. It is gone. A member who forgets now
-- scores nothing for the season and there is no admin lever to rescue them.
-- Moving an OPEN deadline forward still works exactly as before; it is only the
-- reopen that dies.
--
-- This is a deliberate trade, not an oversight: the pool is never held hostage,
-- and in exchange nobody can be rescued. If the rescue is wanted back, the fix
-- is to drop the reveal-freeze rather than to restore the hold — say so
-- explicitly in a follow-up rather than half-reverting this.
--
-- ⚠ It also raises the stakes on migration 099's pre-deadline reminder, which
-- is applied but has no cron calling it. That reminder was the mode's safety
-- net when a missed deadline was recoverable. It is now the ONLY thing standing
-- between a member and a scoreless season.
--
-- =============================================================
-- BEFORE YOU RUN THIS
-- =============================================================
--   SELECT prosrc FROM pg_proc WHERE proname = 'league_reveal_table_if_ready';
-- Expect 104's, containing 'not everyone has filed'.
--
--   SELECT count(*) FROM pools
--    WHERE league_mode='table' AND league_table_revealed_at IS NULL
--      AND league_table_lock_at IS NOT NULL AND now() >= league_table_lock_at;
-- Every one of these reveals the next time anything calls the function. Read
-- them first — each is a pool whose members are about to see each other's
-- tables, and whose deadline becomes final in the same moment.
-- =============================================================


-- ------------------------------------------- 1. the deadline is the condition
CREATE OR REPLACE FUNCTION public.league_reveal_table_if_ready(p_pool_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_mode     text;
  v_lock_at  timestamptz;
  v_revealed timestamptz;
  v_total    integer;
  v_filed    integer;
BEGIN
  SELECT league_mode, league_table_lock_at, league_table_revealed_at
    INTO v_mode, v_lock_at, v_revealed
    FROM pools WHERE pool_id = p_pool_id;

  IF v_mode IS DISTINCT FROM 'table' THEN
    RETURN jsonb_build_object('skipped', 'not a table pool');
  END IF;
  IF v_revealed IS NOT NULL THEN
    RETURN jsonb_build_object('skipped', 'already revealed', 'revealed_at', v_revealed);
  END IF;
  IF v_lock_at IS NULL OR now() < v_lock_at THEN
    RETURN jsonb_build_object('skipped', 'deadline has not passed', 'lock_at', v_lock_at);
  END IF;

  -- REMOVED IN 109 — the hold. 104 returned {held: true} here whenever
  -- v_filed < v_total and waited for an admin. It no longer waits for anything.
  --
  -- The counts are still READ, and deliberately: they are the only record of
  -- how many members were caught by the deadline, they cost one index scan on a
  -- function that runs once per pool per season, and a reveal that cannot say
  -- how many people it left behind is a reveal nobody can audit afterwards.
  SELECT count(*), count(*) FILTER (WHERE has_filed)
    INTO v_total, v_filed
    FROM league_table_filing_status(p_pool_id);

  -- updated_at is left alone: update_pools_updated_at maintains it.
  UPDATE pools SET league_table_revealed_at = now()
   WHERE pool_id = p_pool_id AND league_table_revealed_at IS NULL
   RETURNING league_table_revealed_at INTO v_revealed;

  RETURN jsonb_build_object('revealed', true, 'revealed_at', v_revealed,
                            'filed', v_filed, 'total', v_total,
                            'missed', v_total - v_filed);
END;
$fn$;

COMMENT ON FUNCTION public.league_reveal_table_if_ready(uuid) IS
  'Stamps league_table_revealed_at once the deadline has passed — migration 109, and that is now the only condition. 104 also required every competing entry to have filed; that hold is withdrawn, because one member who never opens the app could otherwise keep a whole pool in the dark. Reports `missed` so a reveal can say how many people the deadline caught. Idempotent. Not a trigger — the condition flips on the clock, with no row written at that instant.';


-- --------------------------------------------------- 2. the override goes
--
-- `league_reveal_table_now` existed for exactly one situation: the deadline had
-- passed, somebody had not filed, and the admin chose to go ahead without them.
-- There is no such situation any more — the reveal has already happened by
-- itself — so the function is not merely unused, it is unreachable. Left in
-- place it would be a second way to set a set-once stamp, which is precisely
-- the kind of spare lever that gets found later and wired to something.
DROP FUNCTION IF EXISTS public.league_reveal_table_now(uuid);


-- ------------------------------------- 3. the deadline is final on the CLOCK
--
-- ⚠ WITHOUT THIS, THE RULE DEPENDS ON WHO LOADED A PAGE.
--
-- 104 freezes the deadline once `league_table_revealed_at` is set, and that was
-- sound while the reveal was a decision: the stamp was written deliberately, so
-- keying on it was keying on an event. Under 109 the reveal is a CONSEQUENCE of
-- the clock — and nothing writes to the database when a clock passes. The stamp
-- is written by whoever next loads the pool page.
--
-- So between the deadline passing and the first page load, `revealed_at` is
-- still NULL, and an admin who gets there first can move the deadline. Same
-- pool, same instant, different answer depending on whether a member happened
-- to open the app. That is not a rule, it is a race.
--
-- The fix is to say the thing directly: a deadline that has passed cannot be
-- moved. Both clauses are kept — the clock one is the guarantee, the reveal one
-- is the backstop for the case where a reveal somehow precedes it.
--
-- ⚠ THIS RESTORES MIGRATION 098's DEADLINE RULE, which 104 deliberately
-- overturned. It is the honest consequence of "reveal when the deadline passes"
-- and it should be recognised as such rather than discovered later: with the
-- reveal riding on the clock, "the deadline is final" and "the tables are out"
-- are the same sentence. The straggler has no second window.
CREATE OR REPLACE FUNCTION public.enforce_league_mode_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- UNCHANGED FROM 077.
  IF OLD.league_mode IS NOT NULL
     AND NEW.league_mode IS DISTINCT FROM OLD.league_mode THEN
    RAISE EXCEPTION
      'league_mode is fixed at pool creation (% -> %). Changing mode mid-season strands every prediction already made — twenty club positions and 380 fixture picks do not convert into one another.',
      OLD.league_mode, NEW.league_mode;
  END IF;

  -- UNCHANGED FROM 104. The reveal is set once.
  IF OLD.league_table_revealed_at IS NOT NULL
     AND NEW.league_table_revealed_at IS DISTINCT FROM OLD.league_table_revealed_at THEN
    RAISE EXCEPTION
      'league_table_revealed_at is set once (% -> %). The tables in this pool have already been shown to everyone in it; that cannot be undone by moving a timestamp.',
      OLD.league_table_revealed_at, NEW.league_table_revealed_at;
  END IF;

  IF OLD.league_table_lock_at IS NOT NULL
     AND NEW.league_table_lock_at IS DISTINCT FROM OLD.league_table_lock_at THEN

    -- NEW IN 109, and the guarantee. Does not wait for the reveal stamp,
    -- because that stamp is written lazily and an admin could otherwise beat it.
    IF now() >= OLD.league_table_lock_at THEN
      RAISE EXCEPTION
        'the table prediction for this pool closed at % and everyone''s table is now open to the pool. It cannot be reopened.',
        OLD.league_table_lock_at;
    END IF;

    -- Kept from 104 as a backstop.
    IF OLD.league_table_revealed_at IS NOT NULL THEN
      RAISE EXCEPTION
        'the tables in this pool were revealed at % and the deadline is fixed from then on.',
        OLD.league_table_revealed_at;
    END IF;

    -- Kept from 104. Moving an OPEN deadline is still allowed, forward or back,
    -- so long as it lands in the future.
    IF NEW.league_table_lock_at IS NOT NULL AND NEW.league_table_lock_at <= now() THEN
      RAISE EXCEPTION
        'a table deadline cannot be set in the past (%). It must be a future instant that members can still work to.',
        NEW.league_table_lock_at;
    END IF;

    -- Kept from 107. A new deadline is a new window and earns its own reminder.
    NEW.table_deadline_reminder_sent_at := NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_league_mode_immutable() IS
  'Migrations 104 + 107 + 109. league_mode is immutable; league_table_revealed_at is set-once; league_table_lock_at may be moved to any future instant WHILE IT IS STILL OPEN, and never once it has passed — because at that moment every table is revealed to the pool (109). Moving it clears table_deadline_reminder_sent_at, so the new window earns its own reminder.';


-- ------------------------------------------------------- 4. the sweeper
--
-- Unchanged in shape, but its `held` counter can now only ever be non-zero for
-- a pool that failed rather than one that is waiting. Renamed in the payload so
-- a future reader does not mistake it for the old "waiting on a straggler".
CREATE OR REPLACE FUNCTION public.league_sweep_table_reveals()
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  r          record;
  v_revealed integer := 0;
  v_failed   integer := 0;
BEGIN
  FOR r IN
    SELECT pool_id FROM pools
     WHERE league_mode = 'table'
       AND league_table_revealed_at IS NULL
       AND archived_at IS NULL
       AND league_table_lock_at IS NOT NULL
       AND now() >= league_table_lock_at
  LOOP
    IF (league_reveal_table_if_ready(r.pool_id) ->> 'revealed') = 'true'
      THEN v_revealed := v_revealed + 1;
      ELSE v_failed := v_failed + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('revealed', v_revealed, 'failed', v_failed);
END;
$fn$;

COMMENT ON FUNCTION public.league_sweep_table_reveals() IS
  'Reveals every table pool whose deadline has passed. Returns {revealed, failed} — since migration 109 a non-zero `failed` means something went wrong, not that a pool is waiting on a straggler; nothing waits any more.';
