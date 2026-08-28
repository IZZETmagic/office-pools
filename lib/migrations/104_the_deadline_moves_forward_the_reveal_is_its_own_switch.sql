-- =============================================================
-- 104 — THE DEADLINE MOVES FORWARD, AND THE REVEAL IS ITS OWN SWITCH
-- =============================================================
-- Supersedes migration 098, which was written on 2026-08-25 and NEVER APPLIED
-- to production — verified 2026-08-28 by hashing `prosrc` on both sides, which
-- is the only evidence a migration file's claim is worth (see 055). What
-- production actually runs is 077's original function, byte for byte:
--
--   'league_table_lock_at is fixed at pool creation (% -> %).
--    It is the deadline members were shown.'
--
-- So the admin cannot move a table deadline at all today, and because the
-- Settings form sends every field in one UPDATE, the trigger takes the pool
-- name and the entry fee down with it.
--
-- Do NOT apply 098 after this. It carries a clock-keyed freeze this migration
-- deliberately removes, and applying it later would silently reinstate it.
--
-- =============================================================
-- ## The rule, in one line
-- =============================================================
--
--   A table deadline can always be moved to a future instant.
--   It can never be moved to a past one.
--
-- That is Ryan's call, 2026-08-28, and it is narrower and better than either
-- 077 (never moves) or 098 (moves only while still open). It comes from three
-- scenarios, and it is worth writing them down because every clause below is
-- one of them:
--
--   1. The pool is set up before the season. The admin picks a deadline — an
--      hour before the first game, a day, whatever they like. Everybody joins,
--      everybody files a table, the deadline passes, everything locks and
--      everything is revealed.
--
--   2. The pool is set up MID-SEASON, say after three matchweeks. The admin
--      picks any deadline they like. This is fine and needs no special
--      handling: every member faces the same deadline with the same three
--      matchweeks already played, so they are all working from the same
--      information. (This is the case 077 could not express at all, and the
--      reason 098 was written.)
--
--   3. The pool is set up either way, and ONE MEMBER FORGETS. The deadline
--      passes with their table empty. The admin moves the deadline forward,
--      which unlocks editing for EVERYONE, and every member is told: the
--      deadline moved, your table is open again, you may change it until then.
--      Everyone can revise on the same new information, so nobody is
--      advantaged — which is the only thing that makes the extension fair.
--
-- Scenario 3 is the one 098 forbade. It refused any move once `now()` had
-- passed the deadline, which is precisely when an admin FINDS OUT there is a
-- straggler. The generous reading of 098 is that it was protecting the members
-- who filed on time; the accurate one is that it was protecting them from an
-- unfairness this migration removes instead — see below.
--
-- ⚠ NOT enforced, on purpose: nothing stops an admin PULLING an open deadline
-- IN, from Friday to Thursday, as long as Thursday is still in the future.
-- 077 objected to exactly that ("retroactively close a window members were told
-- was open"), and the objection has force. It is allowed anyway because the
-- rule Ryan stated is about the current date, not about the old value; because
-- a shortened window is still the same window for everybody; and because every
-- change fires the announcement, so no member discovers it by finding the door
-- shut. Named here so it stays a decision rather than becoming an accident.
--
-- =============================================================
-- ## Why the reveal had to be split off — the reason scenario 3 was unsafe
-- =============================================================
--
-- Before this migration, ONE expression did two unrelated jobs:
--
--   the write lock   enforce_league_table_before_lock:
--                    IF v_lock_at IS NOT NULL AND now() >= v_lock_at
--                      THEN RETURN NULL  -- silent skip
--
--   the reveal       RLS policy "Members can view all table predictions after
--                    the lock":
--                    po.league_table_lock_at IS NOT NULL
--                    AND now() >= po.league_table_lock_at
--
-- Identical condition, so they were one switch. Play scenario 3 against it:
--
--   Fri 19:00  the deadline passes. Writes stop — correct. AND every member
--              who filed can now open every rival's complete table.
--   Sat 10:00  the admin notices the straggler and extends to Sunday.
--              `now() >= lock_at` is false again, so the tables hide again —
--              but they were readable for fifteen hours, and now everybody
--              can edit.
--
-- A member could copy the leader's table verbatim. The window is not a
-- theoretical race: in scenario 3 it is GUARANTEED to be open, because the only
-- way to learn there is a straggler is to let the deadline pass.
--
-- That is the thing an admin cannot consent to on other members' behalf, and it
-- is what 098's freeze was really guarding against — by removing the admin's
-- power instead of fixing the leak. Fix the leak and the power is safe to give.
--
-- So: the clock keeps the WRITE lock, unchanged, and a set-once stamp
-- `pools.league_table_revealed_at` takes over the REVEAL.
--
--   scenario 1  everyone filed  -> the deadline passes -> revealed. As before.
--   scenario 2  everyone filed  -> the deadline passes -> revealed. As before.
--   scenario 3  someone has not -> the deadline passes -> writes stop, and
--                                  NOTHING is revealed. The admin extends and
--                                  nobody has seen anything.
--
-- "Everyone in, or nobody sees" is already the recorded decision
-- (SPORTPOOL_PROGRAMME.md -> Predict the Table). This is the first migration
-- that actually implements it, and it falls straight out of the three
-- scenarios rather than being an extra concept bolted on.
--
-- Once stamped, `league_table_revealed_at` never moves and the deadline freezes
-- with it. That is the other half of the recorded decision — "once revealed,
-- frozen, including for the admin" — and it is now keyed on the thing that
-- actually causes the harm (people have seen the answers) rather than on the
-- clock.
--
-- =============================================================
-- BEFORE YOU RUN THIS — one live function is REPLACED, two policies DROPPED
-- =============================================================
--   SELECT prosrc FROM pg_proc WHERE proname = 'enforce_league_mode_immutable';
--
-- It should be 077's, and nothing else. If 098 has been applied in the
-- meantime it will contain 'cannot be reopened' — that is still fine, this
-- replaces it wholesale, but check that nothing ELSE has been added.
--
--   SELECT polname FROM pg_policy
--    WHERE polrelid = 'public.league_table_predictions'::regclass;
--
-- Expect 078's six. The two SELECT policies named below are recreated; the
-- other four (own view / insert / update / delete) are untouched.
-- =============================================================


-- ------------------------------------------------ 1. the reveal is a stamp
--
-- NULL means "not revealed". A timestamp means "revealed, at this instant, for
-- ever". It is deliberately NOT derived from the clock: the whole point is that
-- it survives the deadline moving underneath it.
ALTER TABLE pools ADD COLUMN IF NOT EXISTS league_table_revealed_at timestamptz;

COMMENT ON COLUMN pools.league_table_revealed_at IS
  'When every member''s table became visible to every other member. NULL until then. Set once and never cleared or moved (migration 104) — a reveal cannot be taken back, because the members have already read each other''s tables. This, not the clock, is what the read policies on league_table_predictions gate on, and what freezes league_table_lock_at.';

-- Partial index: the sweeper below only ever looks for table pools that have
-- not revealed yet, which is a shrinking set.
CREATE INDEX IF NOT EXISTS pools_table_awaiting_reveal_idx
  ON pools (league_table_lock_at)
  WHERE league_mode = 'table' AND league_table_revealed_at IS NULL;


-- --------------------------------------------------------- 2. the guard
CREATE OR REPLACE FUNCTION public.enforce_league_mode_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- UNCHANGED FROM 077, wording included. Guarded on OLD being non-NULL so that
  -- stamping a mode onto a pool that has none yet still works; only a CHANGE is
  -- refused. A changed mode strands every prediction already made.
  IF OLD.league_mode IS NOT NULL
     AND NEW.league_mode IS DISTINCT FROM OLD.league_mode THEN
    RAISE EXCEPTION
      'league_mode is fixed at pool creation (% -> %). Changing mode mid-season strands every prediction already made — twenty club positions and 380 fixture picks do not convert into one another.',
      OLD.league_mode, NEW.league_mode;
  END IF;

  -- THE REVEAL IS SET ONCE. Not moved, not cleared, not back-dated. Every
  -- member has read every other member's table by the time this is non-NULL,
  -- and no UPDATE can make that un-happen — so pretending otherwise in the data
  -- would just mean the pool lied about it afterwards.
  IF OLD.league_table_revealed_at IS NOT NULL
     AND NEW.league_table_revealed_at IS DISTINCT FROM OLD.league_table_revealed_at THEN
    RAISE EXCEPTION
      'league_table_revealed_at is set once (% -> %). The tables in this pool have already been shown to everyone in it; that cannot be undone by moving a timestamp.',
      OLD.league_table_revealed_at, NEW.league_table_revealed_at;
  END IF;

  -- THE DEADLINE. Forward always, backward never.
  IF OLD.league_table_lock_at IS NOT NULL
     AND NEW.league_table_lock_at IS DISTINCT FROM OLD.league_table_lock_at THEN

    -- Once the tables are out, the competition is over as a prediction. Note
    -- this keys on the REVEAL, not on `now() >= OLD.league_table_lock_at` —
    -- that difference is the entire scenario-3 fix and is why 098 is
    -- superseded rather than amended.
    IF OLD.league_table_revealed_at IS NOT NULL THEN
      RAISE EXCEPTION
        'the tables in this pool were revealed at % and the deadline is fixed from then on. Reopening now would let somebody rewrite a table having already read everybody else''s.',
        OLD.league_table_revealed_at;
    END IF;

    -- Never into the past. A deadline that has already gone by is not a
    -- deadline, it is a closed door with a sign on it, and members are looking
    -- at the old one right now. NULL is allowed through: clearing the deadline
    -- is not a table pool any more, and the mode guard above governs that.
    IF NEW.league_table_lock_at IS NOT NULL AND NEW.league_table_lock_at <= now() THEN
      RAISE EXCEPTION
        'a table deadline cannot be set in the past (%). It must be a future instant that members can still work to.',
        NEW.league_table_lock_at;
    END IF;

    -- DELIBERATELY ABSENT: any check on whether OLD has already passed. That
    -- is scenario 3 — the straggler — and reopening is the point.
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_league_mode_immutable() IS
  'Migration 104. league_mode is immutable; league_table_revealed_at is set-once; league_table_lock_at may be moved to any FUTURE instant, including after it has already passed (the straggler case), but never once the tables have been revealed. Supersedes 098, which froze the deadline on the clock instead of on the reveal — do not apply 098 after this.';

COMMENT ON COLUMN pools.league_table_lock_at IS
  'When the table prediction closes to writes. Seeded at creation from the admin''s chosen deadline (falling back to the first un-locked matchweek''s kickoff), and movable by the admin to any future instant until the tables are revealed — migration 104. Read by trg_enforce_league_table_before_lock, which silently refuses any prediction written at or after it. It no longer controls VISIBILITY: league_table_revealed_at does.';


-- ------------------------------------------- 3. who has filed, without contents
--
-- The admin has to be able to answer "is anybody missing?" in order to make the
-- scenario-3 decision at all. They must NOT be able to answer "and what did
-- they put?" — an admin who is also playing would otherwise read every rival's
-- table at will, which is the accusation Decision 7 exists to prevent.
--
-- So this returns the SHAPE of the answer and never its content: one row per
-- competing entry, with a boolean. Named entries, no orderings.
--
-- SECURITY DEFINER, narrowly: it has to see rows the caller's RLS hides, and it
-- is what makes hiding them from the caller affordable. It returns no club and
-- no position, so there is nothing here to leak.
CREATE OR REPLACE FUNCTION public.league_table_filing_status(p_pool_id uuid)
RETURNS TABLE (entry_id uuid, member_id uuid, user_id uuid, has_filed boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT pe.entry_id,
         pe.member_id,
         pm.user_id,
         EXISTS (SELECT 1 FROM league_table_predictions ltp
                  WHERE ltp.entry_id = pe.entry_id) AS has_filed
    FROM pool_entries pe
    JOIN pool_members pm ON pm.member_id = pe.member_id
   WHERE pm.pool_id = p_pool_id
     -- The same definition of "competing" that league_finalize_ranks uses.
     -- A detached or retired entry is not owed a window and must not hold the
     -- reveal shut for everybody else.
     AND pe.member_id IS NOT NULL
     AND pe.retired_at IS NULL;
$fn$;

COMMENT ON FUNCTION public.league_table_filing_status(uuid) IS
  'One row per competing entry: has this entry filed a table at all? DEFINER because the admin screen needs the count while the read policies hide the contents — and it returns no club and no position, so the contents stay hidden. "Competing" matches league_finalize_ranks: member_id NOT NULL and retired_at NULL.';


-- ------------------------------------------------------ 4. firing the reveal
--
-- ⚠ WHY THIS CANNOT BE A TRIGGER. The condition is "the deadline has passed AND
-- everybody has filed". Filing is impossible once the deadline has passed —
-- enforce_league_table_before_lock silently skips those writes — so the second
-- half can never change after the first half becomes true. The condition
-- therefore flips at exactly one instant, the deadline, and nothing writes to
-- the database at that instant. It is a clock event with no row behind it.
--
-- "Has filed" means AT LEAST ONE ROW, not a complete twenty. A partial ordering
-- is a real prediction and the engine scores what is there; requiring a full
-- table would let one club-count mismatch hold a pool's reveal shut for ever,
-- which is a much worse failure than revealing a short table.
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

  SELECT count(*), count(*) FILTER (WHERE has_filed)
    INTO v_total, v_filed
    FROM league_table_filing_status(p_pool_id);

  -- Nobody at all: an empty pool has nothing to reveal and no one to wrong.
  -- Revealing it is harmless and stops it sitting in the sweeper for ever.
  IF v_total > 0 AND v_filed < v_total THEN
    RETURN jsonb_build_object(
      'held', true, 'reason', 'not everyone has filed',
      'filed', v_filed, 'total', v_total, 'missing', v_total - v_filed);
  END IF;

  -- updated_at is left alone: update_pools_updated_at maintains it.
  UPDATE pools SET league_table_revealed_at = now()
   WHERE pool_id = p_pool_id AND league_table_revealed_at IS NULL
   RETURNING league_table_revealed_at INTO v_revealed;

  RETURN jsonb_build_object('revealed', true, 'revealed_at', v_revealed,
                            'filed', v_filed, 'total', v_total);
END;
$fn$;

COMMENT ON FUNCTION public.league_reveal_table_if_ready(uuid) IS
  'Stamps league_table_revealed_at when the deadline has passed AND every competing entry has filed a table. Idempotent and cheap: a no-op on every call but the one that matters. Not a trigger — the condition flips on the clock, with no row written at that instant.';


-- The admin's other choice in scenario 3: go without the straggler. Same stamp,
-- same set-once guard, minus the everybody-has-filed test — but it STILL
-- requires the deadline to have passed, because revealing while the window is
-- open is the one move that is unfair no matter who asks for it.
CREATE OR REPLACE FUNCTION public.league_reveal_table_now(p_pool_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_mode     text;
  v_lock_at  timestamptz;
  v_revealed timestamptz;
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
    RAISE EXCEPTION
      'this pool''s tables cannot be revealed until its deadline (%) has passed. Members are still editing.',
      v_lock_at;
  END IF;

  -- updated_at is left alone: update_pools_updated_at maintains it.
  UPDATE pools SET league_table_revealed_at = now()
   WHERE pool_id = p_pool_id AND league_table_revealed_at IS NULL
   RETURNING league_table_revealed_at INTO v_revealed;

  RETURN jsonb_build_object('revealed', true, 'revealed_at', v_revealed,
                            'without_stragglers', true);
END;
$fn$;

COMMENT ON FUNCTION public.league_reveal_table_now(uuid) IS
  'The admin''s "reveal without them" in scenario 3, for a straggler who never files. Requires the deadline to have passed; refuses to reveal an open pool no matter who asks.';


-- Sweeper, for whichever cron eventually runs it. NOTE 2026-08-28: no league
-- cron is scheduled at all — cron.job has no league-notices, league-outbox or
-- league-standings entry — so until one exists the read path calls
-- league_reveal_table_if_ready directly. This is here so that when the cron
-- lands there is one statement to add rather than a design to rediscover.
CREATE OR REPLACE FUNCTION public.league_sweep_table_reveals()
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  r          record;
  v_revealed integer := 0;
  v_held     integer := 0;
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
      ELSE v_held := v_held + 1;
    END IF;
  END LOOP;

  -- `held` is the number of pools waiting on a straggler — the admin has a
  -- decision to make in each one. Reported rather than swallowed so the count
  -- can be surfaced instead of discovered in November.
  RETURN jsonb_build_object('revealed', v_revealed, 'held', v_held);
END;
$fn$;

COMMENT ON FUNCTION public.league_sweep_table_reveals() IS
  'Reveals every table pool whose deadline has passed with everybody filed. Returns {revealed, held} — held counts pools waiting on a straggler, each of which needs an admin decision.';


-- ------------------------------------------- 5. the engines are not public
--
-- Same posture migration 102 takes for the scoring engines, applied here at the
-- point of creation rather than retrofitted. These write `pools`; the only
-- callers are the API routes, which use the service-role client.
REVOKE ALL ON FUNCTION public.league_reveal_table_if_ready(uuid) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.league_reveal_table_now(uuid)      FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.league_sweep_table_reveals()       FROM PUBLIC, authenticated, anon;
-- The filing status IS read by an admin screen through the user-scoped client,
-- so it keeps its grant. It returns booleans, not orderings.
GRANT EXECUTE ON FUNCTION public.league_table_filing_status(uuid) TO authenticated;


-- ------------------------------------------------------- 6. the read gate
--
-- Both SELECT policies move off the clock and onto the stamp.
DROP POLICY IF EXISTS "Members can view all table predictions after the lock"
  ON league_table_predictions;

CREATE POLICY "Members can view all table predictions once revealed"
  ON league_table_predictions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM pool_entries pe
        JOIN pool_members owner_pm  ON pe.member_id = owner_pm.member_id
        JOIN pools po               ON po.pool_id = owner_pm.pool_id
        JOIN pool_members viewer_pm ON viewer_pm.pool_id = po.pool_id
        JOIN users u                ON viewer_pm.user_id = u.user_id
       WHERE pe.entry_id = league_table_predictions.entry_id
         AND u.auth_user_id = (SELECT auth.uid())
         AND po.league_table_revealed_at IS NOT NULL
    )
  );

-- ⚠ THE ADMIN POLICY GAINS A GATE IT NEVER HAD.
--
-- 078's version carried no lock check whatsoever, and TableEntryModal.tsx says
-- so in its header: it refuses rival tables in the COMPONENT precisely because
-- "an admin who is also playing would otherwise open this and read every
-- rival's table while the window was still open". A UI guard is not a gate —
-- GET /api/pools/[pool_id]/table-prediction?entryId=<rival> uses the
-- user-scoped client and would have answered a playing admin in full.
--
-- In a pool of colleagues the admin is nearly always also a player, so this was
-- the ordinary case, not the exotic one. Support access to a live pool's
-- unrevealed tables is a service-role action, as pool deletion already is.
DROP POLICY IF EXISTS "Pool admins can view all table predictions"
  ON league_table_predictions;

CREATE POLICY "Pool admins can view all table predictions once revealed"
  ON league_table_predictions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM pool_entries pe
        JOIN pool_members pm ON pe.member_id = pm.member_id
        JOIN pools po        ON po.pool_id = pm.pool_id
       WHERE pe.entry_id = league_table_predictions.entry_id
         AND is_pool_admin(pm.pool_id)
         AND po.league_table_revealed_at IS NOT NULL
    )
  );


-- ------------------------------------------------------- 7. the back-fill
--
-- Any table pool whose deadline has ALREADY passed was, under the old rule,
-- revealed the moment it did. Leaving revealed_at NULL would silently re-hide
-- tables members can already see, and — worse — would tell the guard above that
-- this pool's deadline is still movable when its members have read each other's
-- answers. Stamp them with the deadline itself: that is when it happened.
--
-- ⚠ EXPECTED TO AFFECT 0 ROWS on 2026-08-28 — checked, every table pool's
-- deadline is still in the future. A non-zero count here means time has
-- passed since this was written; read the rows before accepting it, because
-- each one is a pool whose deadline this statement freezes.
UPDATE pools
   SET league_table_revealed_at = league_table_lock_at
 WHERE league_mode = 'table'
   AND league_table_revealed_at IS NULL
   AND league_table_lock_at IS NOT NULL
   AND now() >= league_table_lock_at;
