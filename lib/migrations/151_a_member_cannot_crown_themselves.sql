-- 151 — a member cannot make themselves pool admin
--
-- 🔴 FIXES A LIVE PRIVILEGE ESCALATION (programme risk R32). Any member of any pool could make
-- themselves that pool's admin with a single PATCH. It is migration 145's bug, one table over:
--
--   1. RLS policy "Users can update own membership" allows UPDATE on your own pool_members row,
--      with NO `with check` and no column restriction.
--   2. The `authenticated` role holds an UPDATE grant on `pool_members.role`.
--   3. There was no trigger on UPDATE at all — only `trg_pool_member_tier_cap`, on INSERT.
--   4. `is_pool_admin()` is SECURITY DEFINER and reads exactly that column.
--
-- So `PATCH /pool_members?member_id=eq.<own>` with `{"role":"admin"}` satisfied the policy and
-- the grant. Proven on production on 2026-10-02 inside a rolled-back transaction, as a player in
-- a finished pool: rows=1, role became 'admin', is_pool_admin() returned true. Nothing persisted.
--
-- The same chain let a member change any other column of their own membership —
-- `entry_fee_paid` (mark yourself paid), `pool_id`, `user_id` — and let a pool admin move a
-- member's row into a different pool.
--
-- ⚠ Whether it has already been used is UNKNOWN. 70 admin rows across 48 pools are not the
-- pool's creator; most are presumably real co-admin promotions, but nothing records who
-- promoted whom, so self-promotion cannot be told apart.
--
-- ⚠⚠ WHY A TRIGGER AND NOT `REVOKE UPDATE (role)` — the same reason as 145. Pool admins promote
-- and demote from the BROWSER client (app/pools/[pool_id]/admin/MembersTab.tsx,
-- mobile/app/pool/[id]/member/[memberId].tsx), so they act as the same `authenticated` role as
-- everybody else. A column revoke cannot tell an admin from a member. A trigger can ask WHO is
-- making the change, which is the actual question.
--
-- THE RULE, for a signed-in caller (auth.uid() is not null):
--   · a super admin may change anything;
--   · nobody else may change a membership's member_id, pool_id, user_id or joined_at;
--   · a pool admin may change the rest (role, fees) on members of their own pool;
--   · anyone else is a member editing their own row, and may change ONLY their own reading
--     state: has_seen_how_to_play and last_read_at. Everything else must come back unchanged.
--     It is an ALLOW-list, so a column added later is protected by default.
--
-- The service role, migrations and the SQL editor have auth.uid() = NULL and pass untouched —
-- the join and create routes, the admin client, and every seed/verify script land there.
--
-- AND THE INSERT DOOR. Policy "Users can join pools" let a signed-in user insert their own
-- membership row directly, which (a) could set `role = 'admin'` on the way in and (b) skipped
-- everything POST /api/pools/join checks: status, accepting_members, the tier cap's error
-- handling, entry creation and restore. Nothing in the web or the app inserts a membership
-- through a user session — every join is the API route on the service role, and no mobile
-- release ever inserted directly (checked through git history) — so the policy is DROPPED.
-- Joining stays exactly as it is for every real path.
--
-- ⚠ NOT ADDRESSED HERE, deliberately, each needs its own look:
--   • pool_entries has the same shape, and it is worse: "Users can update own entries" has no
--     `with check`, and `authenticated` can UPDATE scored_total_points, current_rank,
--     point_adjustment and retired_at. Many legitimate client writers touch that table, so it
--     needs its own writer audit before an allow-list. Raised with Ryan.
--   • POST /api/pools/join accepts a bare pool_id and never checks is_private. It runs on the
--     service role, so this trigger cannot see it. It belongs to the three-level privacy item;
--     ⚠ the web invite page joins by pool_id, so it must switch to the code first.
--   • Super-admin "transfer admin" and "add member" (app/api/admin/pools/[id]/actions/route.ts,
--     app/api/admin/users/[id]/actions/route.ts) write pool_members through the SESSION client.
--     There is no super-admin UPDATE or INSERT policy on pool_members, so those calls already
--     affect zero rows / fail today. This migration lets super admins through the trigger, but
--     does not add the missing policies.

create or replace function public.guard_pool_member_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ⭐ auth.uid() is NULL for the service role, for migrations and for the SQL editor — trusted
  -- server-side contexts. A super admin may change anything too.
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  -- Nobody else moves a membership between pools or people, or rewrites when it began.
  if new.member_id is distinct from old.member_id
     or new.pool_id  is distinct from old.pool_id
     or new.user_id  is distinct from old.user_id
     or new.joined_at is distinct from old.joined_at
  then
    raise exception 'pool_members: % may not change a membership''s member_id, pool_id, user_id or joined_at',
      auth.uid()
      using errcode = '42501';
  end if;

  -- A pool admin manages their own pool's members: role and fees. The RLS policy "Pool admins can
  -- update members" already limits them to rows of pools they administer; this re-checks it so
  -- the trigger does not depend on which policy let the row through.
  if public.is_pool_admin(old.pool_id) then
    return new;
  end if;

  -- Everyone else is a member editing their own row: only their own reading state may change.
  if (to_jsonb(new) - array['has_seen_how_to_play', 'last_read_at'])
     is distinct from
     (to_jsonb(old) - array['has_seen_how_to_play', 'last_read_at'])
  then
    raise exception 'pool_members: % may only change has_seen_how_to_play and last_read_at on their own membership',
      auth.uid()
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_pool_member_privileges() is
  'Blocks a member from changing role (or anything but their own reading state) on their own '
  'pool_members row, and anyone but the service role or a super admin from moving a membership. '
  'Pool admins keep role and fee control over their own pool. See 151 (R32); same shape as 145.';

drop trigger if exists pool_members_guard_privileges on public.pool_members;

create trigger pool_members_guard_privileges
  before update on public.pool_members
  for each row
  execute function public.guard_pool_member_privileges();

-- The insert door: every real join goes through POST /api/pools/join on the service role.
drop policy if exists "Users can join pools" on public.pool_members;
