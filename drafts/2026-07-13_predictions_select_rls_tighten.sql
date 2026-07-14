-- ============================================================================
-- Phase 0 — Tighten predictions SELECT RLS  (member-predictions-visibility feature)
-- Date:   2026-07-13
-- Status: APPLIED to prod 2026-07-13 via Supabase apply_migration
--         (name: tighten_predictions_select_rls_owner_admin). Verified: non-admin
--         reads own only (others → 0 rows), admin reads all, no new advisor notices.
--         NOTE: applied version ordered CREATE-then-DROP (see below) so reads never
--         lose coverage even absent a wrapping txn; this file keeps DROP-first for
--         readability. Behavior identical.
--
-- WHY
-- The live SELECT policy "Users can view pool predictions" lets ANY member of a
-- pool read ANY entry's score picks — no owner check, no deadline gate. Because
-- mobile reads `predictions` directly via the anon (RLS-bound) client, this is a
-- latent PRE-DEADLINE LEAK: a technical member can pull others' group/knockout
-- picks before kickoff. (The `bracket_picker_*` tables are already correct —
-- owner-only + pool-admin — and are untouched here.)
--
-- WHAT
-- Replace the permissive SELECT with the SAME owner-or-admin shape the bracket
-- tables already use, mirroring this table's own sibling policies:
--   * owner  clause  <- mirrors "Users can update own predictions" (minus the
--                       predictions_locked condition — you may always VIEW your
--                       own picks, locked or not)
--   * admin  clause  <- mirrors "Pool admins can delete predictions" (is_pool_admin)
--
-- BLAST RADIUS (verified 2026-07-13 — see the design doc §3.2)
-- Every current reader survives: all server cross-entry reads use the
-- service-role client (bypass RLS); all client reads are own-scoped (owner
-- clause) or the admin replay (admin clause, gated to pool admins). Web
-- allPredictions is service-role in lib/poolData.ts:199-225. No functional
-- regression expected.
--
-- ROLLBACK: at the bottom (commented).
-- ============================================================================

BEGIN;

-- Drop the over-permissive "any pool member" SELECT policy.
DROP POLICY IF EXISTS "Users can view pool predictions" ON public.predictions;

-- Owner may read their own entry's predictions (locked or not).
DROP POLICY IF EXISTS "Users can view own predictions" ON public.predictions;
CREATE POLICY "Users can view own predictions"
  ON public.predictions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM ((public.pool_entries pe
        JOIN public.pool_members pm ON (pe.member_id = pm.member_id))
        JOIN public.users u ON (pm.user_id = u.user_id))
      WHERE pe.entry_id = predictions.entry_id
        AND u.auth_user_id = (SELECT auth.uid())
    )
  );

-- Pool admins may read every entry's predictions in pools they administer.
DROP POLICY IF EXISTS "Pool admins can view all predictions" ON public.predictions;
CREATE POLICY "Pool admins can view all predictions"
  ON public.predictions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM (public.pool_entries pe
        JOIN public.pool_members pm ON (pe.member_id = pm.member_id))
      WHERE pe.entry_id = predictions.entry_id
        AND public.is_pool_admin(pm.pool_id)
    )
  );

COMMIT;

-- ---------------------------------------------------------------------------
-- POST-APPLY VERIFICATION (run manually; expect exactly these 3 SELECT rows +
-- the unchanged INSERT/UPDATE/DELETE policies):
--
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename='predictions' ORDER BY cmd, policyname;
--
-- Expect SELECT: "Users can view own predictions", "Pool admins can view all predictions"
-- (and NOT "Users can view pool predictions").
-- ---------------------------------------------------------------------------

-- ROLLBACK (restores prior behavior — any pool member can read any entry):
--   BEGIN;
--   DROP POLICY IF EXISTS "Users can view own predictions" ON public.predictions;
--   DROP POLICY IF EXISTS "Pool admins can view all predictions" ON public.predictions;
--   CREATE POLICY "Users can view pool predictions"
--     ON public.predictions FOR SELECT TO authenticated
--     USING (
--       EXISTS (
--         SELECT 1 FROM (public.pool_entries pe
--           JOIN public.pool_members pm ON (pe.member_id = pm.member_id))
--         WHERE pe.entry_id = predictions.entry_id
--           AND pm.pool_id IN (SELECT pool_id FROM get_user_pool_ids())
--       )
--     );
--   COMMIT;
