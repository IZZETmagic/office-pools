-- 023_predictions_select_rls_tighten.sql
-- Applied to prod 2026-07-13 (Supabase migration: tighten_predictions_select_rls_owner_admin).
--
-- Tighten predictions SELECT RLS from "any pool member can read any entry" to
-- owner-or-pool-admin — matching the bracket_picker_* tables and this table's own
-- UPDATE/DELETE sibling policies. Closes a latent pre-deadline leak: the previous
-- policy let any member read others' score picks directly via the anon client
-- (mobile reads predictions that way), before kickoff. See
-- drafts/2026-07-13_member_predictions_visibility.md for the full design.
--
-- Idempotent + ordered CREATE-then-DROP so member reads never lose coverage even
-- absent a wrapping transaction.

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

DROP POLICY IF EXISTS "Users can view pool predictions" ON public.predictions;
