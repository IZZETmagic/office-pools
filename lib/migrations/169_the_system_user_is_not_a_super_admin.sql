-- =============================================================
-- 169 — The system user is no longer a super admin (2026-10-05)
-- =============================================================
-- user_id 30000000-0000-0000-0000-000000000001 (admin@hsbc.bm, "ryan_admin")
-- is the hard-coded system user that authored the World Cup countdown sends.
-- It has no auth account, so nobody can sign in as it, but it still carried
-- is_super_admin = true, which also put it in the `super_admins` email
-- segment (lib/email/segments.ts).
--
-- KEPT, by decision (Ryan, 2026-10-05: "Keep it, remove its super admin
-- access"). It could not simply be deleted anyway: five sent_announcements
-- rows reference it through a NO ACTION foreign key.
--
-- users_guard_privilege_columns blocks only a SIGNED-IN member who is not a
-- super admin from changing is_super_admin. A migration has no auth.uid(),
-- so it passes.
-- =============================================================

update public.users
set is_super_admin = false
where user_id = '30000000-0000-0000-0000-000000000001'
  and auth_user_id is null;
