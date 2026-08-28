-- =============================================================
-- 110 — THE DEADLINE IS THE ONLY SWITCH
-- =============================================================
-- Karon, 2026-08-28: *"maybe we don't need crons. We just use the deadline date
-- as the restrictor."*
--
-- Correct, and it reaches further than the cron. Since migration 109 removed the
-- everybody-has-filed hold, `pools.league_table_revealed_at` carries no
-- information that `pools.league_table_lock_at` does not already carry. It is
-- always, and only, "the deadline has passed". So it goes.
--
-- ## The evidence, from the two live pools
--
--   pool                                  deadline   stamp written   lag
--   Predict the Table                     19:00:00   19:15:26        15m 26s
--   Premier League Test Table Prediction  19:00:00   19:15:33        15m 33s
--
-- Nothing happened at 19:15. That is when a page load and a manual sweep
-- happened to fire. For fifteen minutes the rules said those tables were open
-- and the database said they were not — and the length of that window was
-- decided by when somebody next opened the app.
--
-- The stamp was never a fact about the pool. It was a record of when we got
-- round to writing it down.
--
-- ## Why the stamp existed at all, and why that reason is gone
--
-- 104 split reads from writes for a specific reason: the admin could reopen a
-- PASSED deadline for a member who forgot, and if the reveal rode on the clock
-- that reopening handed everybody a fresh edit having already read each other's
-- tables. The stamp let the reveal be held back until the decision was made.
--
-- 109 removed the hold and made a passed deadline final. With no reopen, there
-- is no window in which reads and writes can legitimately disagree — so the two
-- switches have nothing left to be separate about.
--
-- ## What this removes
--
--   · `league_table_revealed_at` and its index
--   · `league_reveal_table_if_ready` — the lazy write on the read path
--   · `league_sweep_table_reveals`   — the cron that was going to replace it
--   · the set-once guard and the reveal-freeze in the trigger
--   · the 15-minute lag, by having nothing to write
--   · the race 109 §3 had to guard against, by removing the thing that raced
--
-- The RLS policies go back to migration 078's expression, `now() >= lock_at`,
-- which was right all along for a mode where the deadline reveals everyone.
--
-- ## ⚠ WHAT IS NOT REMOVED, AND MUST NOT BE
--
-- The deadline-final guard from 109 §3 STAYS, and it is now the only thing
-- freezing the deadline — the reveal-stamp backstop is going with the stamp.
-- Without it an admin could move a passed deadline and re-hide tables the pool
-- has already read.
--
-- `league_table_filing_status` also stays. It is not part of the reveal; it is
-- how the admin screen counts who filed without being shown what they filed.
--
-- =============================================================
-- ⚠ ORDER IS LOAD-BEARING — the column is dropped LAST
-- =============================================================
-- Two dependencies have to be cleared before `ALTER TABLE ... DROP COLUMN`:
--
--   1. THE POLICIES. Postgres tracks a real dependency from a policy expression
--      to the column, and the DROP would need CASCADE — which would silently
--      take the policies with it and leave the table readable by nobody, or by
--      everybody, depending on what remained.
--   2. THE TRIGGER. plpgsql resolves column names at RUN time, not CREATE time
--      (the 081 → 082 lesson). A trigger still naming `NEW.league_table_revealed_at`
--      would create cleanly and then fail on the first pool UPDATE.
--
-- And on the application side, the same ordering as the 2026-08-22 outage:
-- **the code that stops reading the column ships before the column goes.**
-- `pools` is fetched with `select('*')`, so the drop will not error — the field
-- simply becomes `undefined`, `isRevealed` becomes false, and every table
-- renders hidden at HTTP 200. Run `scripts/verify-select-columns.ts` first.
--
-- BEFORE YOU RUN THIS:
--   SELECT prosrc FROM pg_proc WHERE proname = 'enforce_league_mode_immutable';
--   -- expect 109's, containing 'It cannot be reopened'
--   SELECT polname FROM pg_policy
--    WHERE polrelid = 'public.league_table_predictions'::regclass;
--   -- expect the two "once revealed" policies from 104
-- =============================================================


-- ------------------------------------------------ 1. reads go back on the clock
--
-- Verbatim migration 078, restored. The deadline passing IS the reveal.
DROP POLICY IF EXISTS "Members can view all table predictions once revealed"
  ON league_table_predictions;

CREATE POLICY "Members can view all table predictions after the lock"
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
         AND po.league_table_lock_at IS NOT NULL
         AND now() >= po.league_table_lock_at
    )
  );

-- ⚠ THE ADMIN GATE IS KEPT, and it is the one thing here that is NOT a revert.
-- 078's admin policy had no gate at all, so an admin who was also playing could
-- read every rival's table through the API while the window was open —
-- TableEntryModal refused it in the component, which is not a gate. 104 closed
-- that. The gate moves onto the clock with everything else; it does not go away.
DROP POLICY IF EXISTS "Pool admins can view all table predictions once revealed"
  ON league_table_predictions;

CREATE POLICY "Pool admins can view all table predictions after the lock"
  ON league_table_predictions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM pool_entries pe
        JOIN pool_members pm ON pe.member_id = pm.member_id
        JOIN pools po        ON po.pool_id = pm.pool_id
       WHERE pe.entry_id = league_table_predictions.entry_id
         AND is_pool_admin(pm.pool_id)
         AND po.league_table_lock_at IS NOT NULL
         AND now() >= po.league_table_lock_at
    )
  );


-- ------------------------------------------------------- 2. the trigger
--
-- Loses both reveal clauses. What remains is the whole rule:
--   · league_mode is immutable
--   · a deadline that has passed cannot be moved     (109)
--   · a deadline cannot be set in the past           (104)
--   · moving it re-arms the reminder                 (107)
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

    -- FROM 109, and now the ONLY thing freezing the deadline — the reveal-stamp
    -- backstop is going with the stamp. Without this an admin could move a
    -- passed deadline and re-hide tables the pool has already read.
    IF now() >= OLD.league_table_lock_at THEN
      RAISE EXCEPTION
        'the table prediction for this pool closed at % and everyone''s table is now open to the pool. It cannot be reopened.',
        OLD.league_table_lock_at;
    END IF;

    -- FROM 104. Moving an OPEN deadline is still allowed in either direction,
    -- so long as it lands in the future.
    IF NEW.league_table_lock_at IS NOT NULL AND NEW.league_table_lock_at <= now() THEN
      RAISE EXCEPTION
        'a table deadline cannot be set in the past (%). It must be a future instant that members can still work to.',
        NEW.league_table_lock_at;
    END IF;

    -- FROM 107. A new deadline is a new window and earns its own reminder.
    NEW.table_deadline_reminder_sent_at := NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_league_mode_immutable() IS
  'Migrations 104 + 107 + 109 + 110. league_mode is immutable; league_table_lock_at may be moved to any future instant WHILE IT IS STILL OPEN, and never once it has passed — because the deadline passing is what shows every table to the pool. Moving it clears table_deadline_reminder_sent_at. There is no reveal stamp: the deadline is the only switch (110).';


-- --------------------------------------------- 3. the reveal machinery goes
--
-- Both existed to write a stamp that is now derivable. `league_sweep_table_reveals`
-- in particular was the cron this migration makes unnecessary — deleted rather
-- than left scheduled-but-idle, because a function whose only job is to write a
-- dropped column is a trap for whoever finds it next.
DROP FUNCTION IF EXISTS public.league_reveal_table_if_ready(uuid);
DROP FUNCTION IF EXISTS public.league_sweep_table_reveals();


-- ------------------------------------------------------- 4. the column
--
-- Last, and only now that nothing references it.
DROP INDEX IF EXISTS pools_table_awaiting_reveal_idx;
ALTER TABLE pools DROP COLUMN IF EXISTS league_table_revealed_at;

COMMENT ON COLUMN pools.league_table_lock_at IS
  'When the table prediction closes. ONE switch, not two (migration 110): at this instant writes stop and every member''s table becomes visible to every other member. Seeded at creation from the admin''s chosen deadline (falling back to the first un-locked matchweek''s kickoff) and movable to any future instant while it is still open; final once it passes. Read by trg_enforce_league_table_before_lock for writes and by both SELECT policies on league_table_predictions for reads.';


-- ------------------------------------------------------- 5. verify
--
-- Both policies on the clock, no reveal functions, no column:
--
--   SELECT polname, pg_get_expr(polqual, polrelid) LIKE '%league_table_lock_at%' AS on_clock
--     FROM pg_policy WHERE polrelid = 'public.league_table_predictions'::regclass;
--
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('league_reveal_table_if_ready', 'league_sweep_table_reveals');
--   -- expect 0
--
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name = 'pools' AND column_name = 'league_table_revealed_at';
--   -- expect 0
