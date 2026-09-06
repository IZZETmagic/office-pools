-- ============================================================================
-- ROLLBACK SCRIPT — pool_members RLS policies
-- Captured: 2026-06-03
-- Purpose:  Restore the 9 policies that existed on public.pool_members BEFORE
--           the SELECT-policy consolidation migration.
--
-- TO USE:   Paste this entire file into the Supabase SQL editor and Run.
--           Execution is idempotent (DROPs use IF EXISTS).
--
-- This file is the ground truth for "what the policies looked like
-- before we touched anything". Keep it until you're confident the
-- migration is stable.
-- ============================================================================

BEGIN;

-- ---- Drop any policy that the migration may have created ----
DROP POLICY IF EXISTS "pool_members_select_consolidated" ON public.pool_members;

-- ---- Re-create the 3 ORIGINAL SELECT policies ----
DROP POLICY IF EXISTS "Members can view pool members" ON public.pool_members;
CREATE POLICY "Members can view pool members" ON public.pool_members
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((pool_id IN ( SELECT get_user_pool_ids.pool_id
   FROM get_user_pool_ids() get_user_pool_ids(pool_id))));

DROP POLICY IF EXISTS "Super admins can view all members" ON public.pool_members;
CREATE POLICY "Super admins can view all members" ON public.pool_members
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin());

DROP POLICY IF EXISTS "Users can view their pool memberships" ON public.pool_members;
CREATE POLICY "Users can view their pool memberships" ON public.pool_members
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((member_id IN ( SELECT get_user_member_ids.member_id
   FROM get_user_member_ids() get_user_member_ids(member_id))));

-- ---- (Reference only — the migration does NOT touch these. Listed here for
-- ---- a complete pre-state snapshot, in case the rollback ever needs to
-- ---- restore them too.) ----

-- DROP POLICY IF EXISTS "Pool admins can delete members" ON public.pool_members;
-- CREATE POLICY "Pool admins can delete members" ON public.pool_members
--   AS PERMISSIVE FOR DELETE TO authenticated
--   USING (is_pool_admin(pool_id));
--
-- DROP POLICY IF EXISTS "Super admins can delete members" ON public.pool_members;
-- CREATE POLICY "Super admins can delete members" ON public.pool_members
--   AS PERMISSIVE FOR DELETE TO authenticated
--   USING (is_super_admin());
--
-- DROP POLICY IF EXISTS "Users can leave pools" ON public.pool_members;
-- CREATE POLICY "Users can leave pools" ON public.pool_members
--   AS PERMISSIVE FOR DELETE TO public
--   USING ((EXISTS ( SELECT 1
--    FROM users
--   WHERE ((users.user_id = pool_members.user_id) AND (users.auth_user_id = auth.uid())))));
--
-- DROP POLICY IF EXISTS "Users can join pools" ON public.pool_members;
-- CREATE POLICY "Users can join pools" ON public.pool_members
--   AS PERMISSIVE FOR INSERT TO authenticated
--   WITH CHECK ((EXISTS ( SELECT 1
--    FROM users
--   WHERE ((users.user_id = pool_members.user_id) AND (users.auth_user_id = auth.uid())))));
--
-- DROP POLICY IF EXISTS "Pool admins can update members" ON public.pool_members;
-- CREATE POLICY "Pool admins can update members" ON public.pool_members
--   AS PERMISSIVE FOR UPDATE TO authenticated
--   USING (is_pool_admin(pool_id));
--
-- DROP POLICY IF EXISTS "Users can update own membership" ON public.pool_members;
-- CREATE POLICY "Users can update own membership" ON public.pool_members
--   AS PERMISSIVE FOR UPDATE TO public
--   USING ((EXISTS ( SELECT 1
--    FROM users
--   WHERE ((users.user_id = pool_members.user_id) AND (users.auth_user_id = auth.uid())))));

COMMIT;

-- ---- After running, verify with: ----
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname='public' AND tablename='pool_members' ORDER BY cmd, policyname;
-- Expected: 9 rows — the 3 SELECT policies restored, 6 others untouched.
