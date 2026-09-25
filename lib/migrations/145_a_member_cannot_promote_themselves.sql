-- 145 — a member cannot promote themselves
--
-- 🔴 FIXES A LIVE PRIVILEGE ESCALATION. Any logged-in member could make themselves a super
-- admin with a single PATCH. The chain was:
--
--   1. RLS policy "Users can update own profile" allows UPDATE where
--      auth_user_id = auth.uid(), with NO `with check` and no column restriction.
--   2. The `authenticated` role holds an UPDATE grant on `is_super_admin` specifically.
--   3. The only trigger on the table was `update_users_updated_at` — nothing guarded
--      the privilege columns.
--   4. `is_super_admin()` is SECURITY DEFINER and reads exactly that column.
--
-- So `PATCH /users?auth_user_id=eq.<their own>` with `{"is_super_admin": true}` satisfied
-- both the policy and the grant. RLS was doing its job on ROWS; nothing restricted COLUMNS.
--
-- ⚠ Supabase's own security advisors do NOT catch this — they returned nothing about
-- public.users at all.
--
-- ⚠⚠ WHY A TRIGGER AND NOT `REVOKE UPDATE (is_super_admin)`. The obvious fix breaks the
-- product: super admins promote and demote each other from `app/admin/super/UsersTab.tsx`
-- using the BROWSER client, so they act as the same `authenticated` role as everybody else.
-- A role-level revoke cannot tell the two apart and would disable promotion entirely.
-- Supabase's own guidance agrees — it recommends against column privileges and warns that
-- "if you turn off a column privilege you won't be able to use that column at all."
--
-- A trigger can ask WHO is making the change, which is the actual question.

create or replace function public.guard_users_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only interested in a real change. An upsert that echoes the same values back is fine,
  -- which is why this is `is distinct from` rather than a column-presence check.
  if new.is_super_admin is distinct from old.is_super_admin
     or new.auth_user_id  is distinct from old.auth_user_id
     or new.user_id       is distinct from old.user_id
     or new.created_at    is distinct from old.created_at
  then
    -- ⭐ auth.uid() is NULL for the service role, for migrations and for the SQL editor.
    -- Those are trusted server-side contexts and must keep working — the seed scripts and
    -- the admin client both land here. An end-user session always has a uid.
    if auth.uid() is not null and not public.is_super_admin() then
      raise exception
        'users: % may not change is_super_admin, auth_user_id, user_id or created_at',
        auth.uid()
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_users_privilege_columns() is
  'Blocks a member from changing privilege columns on their own users row. See 145. A super '
  'admin and the service role may still change them, which is why this is a trigger rather '
  'than a column-level REVOKE.';

drop trigger if exists users_guard_privilege_columns on public.users;

create trigger users_guard_privilege_columns
  before update on public.users
  for each row
  execute function public.guard_users_privilege_columns();

-- ⚠ NOT ADDRESSED HERE, deliberately, because each needs its own look:
--
--   • `email` is still member-writable on their own row. Nothing in the codebase writes it
--     through a user session, but "grep found nothing" is not proof of a flow's absence.
--   • The policy "Users can view all profiles" is granted to PUBLIC with `using (true)` and
--     `anon` holds SELECT, so every row — including `email` — is readable with the anon key.
--     Narrowing it risks breaking public/branded pages that may read members anonymously.
