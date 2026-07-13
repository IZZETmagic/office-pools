-- Trophy Case "lifetime" read fix (ROADMAP: Lifetime trophy tracker — left-pool gap)
--
-- PROBLEM: badge_unlocks SELECT is gated on CURRENT pool membership
--   ("Members can view badge unlocks in their pools": pool_id in get_user_pool_ids()).
--   So a user's own unlocks in a pool they've LEFT are invisible to their own
--   profile Trophy Case — not truly "lifetime".
--
-- FIX: an additive PERMISSIVE SELECT policy letting a user read rows that are
--   THEIRS (user_id maps to their auth.uid() via public.users.auth_user_id).
--   Permissive policies combine with OR, so this only broadens a user's access
--   to their own rows; it never exposes other users' unlocks.
-- Applied to prod as migration `badge_unlocks_self_read` (2026-07-13).

create policy "Users can view their own badge unlocks"
  on public.badge_unlocks for select to authenticated
  using (
    user_id = (select user_id from public.users where auth_user_id = (select auth.uid()))
  );
