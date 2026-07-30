-- 041: pool archive, part 2 of 2 — THE POLICY CHANGES
--
-- ✅ Applied to prod 2026-07-30 (Supabase migration: pool_archive_policies),
-- AFTER the production deploy of master ee09020, in the correct order.
-- Post-apply, verified: "Pool admins can delete pools" 0, "Pool admins can
-- delete predictions" 0, "Super admins can delete pools" 1 (support path
-- intact), predictions INSERT/UPDATE both carrying the archived_at guard,
-- 623 pools and 287,789 predictions unchanged. R1 is closed in production.
--
-- ⚠️ ONE RESIDUAL, until the mobile OTA ships: installed copies of the app
-- still show a Delete Pool button. With this migration applied that button is
-- now HARMLESS but MISLEADING — its single `pools` delete is filtered by RLS,
-- which returns 0 rows and no error, so the app reports success and navigates
-- home while the pool survives. Non-destructive; confusing. Ship the OTA.
--
-- ⚠️ APPLY THIS *WITH* OR *AFTER* THE CODE DEPLOY, NEVER BEFORE.
-- Requires 040 (the columns) to be applied first.
--
-- This is the half that actually closes R1. If it is applied while the old
-- Delete Pool buttons are still live in production, an admin's tap does:
--     delete predictions   -> BLOCKED, but RLS filters silently: 0 rows, "success"
--     delete own entries   -> deletes only their own (pre-existing asymmetry)
--     delete pool_members  -> STILL ALLOWED, cascades, destroys everything
--     delete pool_settings -> succeeds
--     delete pools         -> BLOCKED, 0 rows, "success"
-- i.e. every member's data is still destroyed and the pool row survives as an
-- empty husk, with the UI reporting success throughout. Removing the buttons is
-- what stops destruction; this makes it unreachable afterwards.
--
-- WHAT THE DESTRUCTION CHAIN ACTUALLY IS (verified 2026-07-30 against pg_constraint)
--   pools  --DELETE-->  pool_members_pool_id_fkey ON DELETE CASCADE
--                   ->  pool_entries_member_id_fkey ON DELETE CASCADE
--                   ->  21 children CASCADE: predictions, group_predictions,
--                       special_predictions, the three bracket_picker_* tables,
--                       entry_round_submissions, match_scores, bonus_scores,
--                       player_scores, point_adjustments, badge_unlocks,
--                       entry_xp_state, and 8 shadow_* tables.
--
-- So the load-bearing door is the DELETE policy on `pools`, not the one on
-- `predictions`. The risk register records "drop the predictions admin-delete
-- policy — this alone kills R1's blast radius"; that is WRONG, and this
-- migration does not rely on it.

BEGIN;

-- 2. Close the pool-destruction door ---------------------------------------
-- A pool admin can no longer delete a pool at all. Archive replaces it, and
-- true deletion becomes a service-role support action (decision 2026-07-25).
-- The super-admin policy is deliberately LEFT IN PLACE — that is the support path.

DROP POLICY IF EXISTS "Pool admins can delete pools" ON pools;

-- 3. Close the asymmetric predictions door ---------------------------------
-- This policy let an admin delete ALL members' predictions while the
-- pool_entries policy only ever let them delete their OWN entries — the
-- asymmetry that made the web flow destroy other people's data first and
-- silently. Nothing in the product needs an admin to delete a prediction.

DROP POLICY IF EXISTS "Pool admins can delete predictions" ON predictions;

-- 4. An archived pool is read-only -----------------------------------------
-- Recreated verbatim from the live definitions plus `po.archived_at IS NULL`.
-- The `(SELECT auth.uid())` wrapping is load-bearing: it is the initplan
-- optimisation from `optimize_rls_initplan_wrap_auth_in_select`. Do not unwrap it.

DROP POLICY IF EXISTS "Users can insert predictions" ON predictions;
CREATE POLICY "Users can insert predictions" ON predictions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM pool_entries pe
    JOIN pool_members pm ON pe.member_id = pm.member_id
    JOIN users u         ON pm.user_id   = u.user_id
    JOIN pools po        ON po.pool_id   = pm.pool_id
    WHERE pe.entry_id = predictions.entry_id
      AND u.auth_user_id = (SELECT auth.uid())
      AND pe.predictions_locked = false
      AND po.archived_at IS NULL
  ));

DROP POLICY IF EXISTS "Users can update own predictions" ON predictions;
CREATE POLICY "Users can update own predictions" ON predictions
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM pool_entries pe
    JOIN pool_members pm ON pe.member_id = pm.member_id
    JOIN users u         ON pm.user_id   = u.user_id
    JOIN pools po        ON po.pool_id   = pm.pool_id
    WHERE pe.entry_id = predictions.entry_id
      AND u.auth_user_id = (SELECT auth.uid())
      AND pe.predictions_locked = false
      AND po.archived_at IS NULL
  ));

COMMIT;

-- WHAT THIS DOES NOT FIX ---------------------------------------------------
-- R12. Three of the four membership-exit doors contain no application code at
-- all — the destruction is the same DB cascade, reached from `pool_members` or
-- `users`. In particular "Pool admins can delete members" is LEFT IN PLACE
-- because removing a member is a legitimate shipped feature (it has its own
-- notification route). An admin can therefore still destroy a pool's data by
-- removing every member one at a time. That is R12, it is gated on Gate A2
-- (what leaving a pool should do to a member's history), and it needs its own
-- fix. Do not read this migration as closing the destruction class.

-- ROLLBACK -----------------------------------------------------------------
-- BEGIN;
-- CREATE POLICY "Pool admins can delete pools" ON pools
--   FOR DELETE TO authenticated
--   USING (pool_id IN (
--     SELECT pm.pool_id FROM pool_members pm
--     JOIN users u ON pm.user_id = u.user_id
--     WHERE u.auth_user_id = (SELECT auth.uid()) AND pm.role = 'admin'));
-- CREATE POLICY "Pool admins can delete predictions" ON predictions
--   FOR DELETE TO authenticated
--   USING (EXISTS (
--     SELECT 1 FROM pool_entries pe
--     JOIN pool_members pm ON pe.member_id = pm.member_id
--     WHERE pe.entry_id = predictions.entry_id AND is_pool_admin(pm.pool_id)));
-- -- and re-create the two predictions policies above without the
-- -- `po.archived_at IS NULL` clause and without the `pools` join.
-- ALTER TABLE pools DROP COLUMN IF EXISTS archived_by;
-- ALTER TABLE pools DROP COLUMN IF EXISTS archived_at;
-- COMMIT;
