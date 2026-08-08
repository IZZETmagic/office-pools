-- 044 — an archived pool is read-only, enforced at the database.
--
-- Archiving hid a pool from every list and, since 71279ae, hides the admin tabs
-- when you open one. Neither is enforcement: the API routes and any direct
-- PostgREST write still went through. Only `predictions` was actually locked
-- (its INSERT/UPDATE policies already test archived_at); the other writes —
-- settings, membership, entries, bracket picks, round submissions — were open.
--
-- Scope is deliberate: the tables whose change would rewrite the record or the
-- scoring. Banter is left writable — an archived pool stays readable and
-- chattable as a memento, which costs nothing.
--
-- Reversibility is free. Every gate below asks `archived_at IS NULL`, so
-- restoring a pool makes it writable again in the same instant, with no
-- cleanup step and nothing cached.
--
-- Two things this deliberately does NOT lock, so there is always a way back in:
--   * the service role, which bypasses RLS entirely — /api/pools/[id]/archive
--     and /restore both use createAdminClient(), so they cannot lock themselves
--     out, and neither can the scoring engine or the crons.
--   * super-admin policies, left exactly as they were.

-- APPLIED to production 2026-08-08, in three parts (044 helpers, 044b the
-- pool-scoped policies, 044c the FOR ALL split). Verified afterwards:
--
--   Every write policy on the eight tables gated, except the four left open on
--   purpose — super-admin ALL/DELETE, pools INSERT and pool_settings INSERT
--   (neither can target an already-archived pool).
--   Every SELECT policy UNGATED, which is the point: an archived pool stays
--   readable.
--   Functionally, against the one archived pool and an open one:
--     archived pool / member / entry  -> false, false, false
--     open pool / entry               -> true, true
--     unknown id                      -> true  (fail-open, as designed)
--
-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so a policy can see pools.archived_at regardless of
-- the caller's own visibility, STABLE so the planner can cache within a query.
--
-- All three answer "not archived" rather than "archived", and a row whose pool
-- cannot be found reads as writable. Fail-open is right here: an orphaned row
-- is a foreign-key problem, and failing closed would block legitimate inserts
-- whose parent is created in the same transaction.
-- ---------------------------------------------------------------------------

create or replace function public.pool_writable(p_pool_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from pools where pool_id = p_pool_id and archived_at is not null
  )
$$;

create or replace function public.member_pool_writable(p_member_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1
    from pool_members pm
    join pools p on p.pool_id = pm.pool_id
    where pm.member_id = p_member_id and p.archived_at is not null
  )
$$;

create or replace function public.entry_pool_writable(p_entry_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1
    from pool_entries pe
    join pool_members pm on pm.member_id = pe.member_id
    join pools p on p.pool_id = pm.pool_id
    where pe.entry_id = p_entry_id and p.archived_at is not null
  )
$$;

-- ---------------------------------------------------------------------------
-- pools — settings, branding, deadlines
-- INSERT is untouched: a pool cannot be created already archived.
-- ---------------------------------------------------------------------------

drop policy if exists "Pool admins can update pools" on pools;
create policy "Pool admins can update pools" on pools
  for update to authenticated
  using (is_pool_admin(pool_id) and pool_writable(pool_id));

drop policy if exists "Pool admins can update their pools" on pools;
create policy "Pool admins can update their pools" on pools
  for update
  using (
    exists (select 1 from users where users.user_id = pools.admin_user_id
              and users.auth_user_id = (select auth.uid()))
    and pool_writable(pool_id)
  );

-- ---------------------------------------------------------------------------
-- pool_settings — scoring configuration
-- INSERT ("Allow pool settings creation") is untouched: it only fires when a
-- pool is being created.
-- ---------------------------------------------------------------------------

drop policy if exists "Pool admins can update pool settings" on pool_settings;
create policy "Pool admins can update pool settings" on pool_settings
  for update to authenticated
  using (is_pool_admin(pool_id) and pool_writable(pool_id));

-- ---------------------------------------------------------------------------
-- pool_members — who is in the pool, and their role
-- ---------------------------------------------------------------------------

drop policy if exists "Pool admins can delete members" on pool_members;
create policy "Pool admins can delete members" on pool_members
  for delete to authenticated
  using (is_pool_admin(pool_id) and pool_writable(pool_id));

drop policy if exists "Users can leave pools" on pool_members;
create policy "Users can leave pools" on pool_members
  for delete
  using (
    exists (select 1 from users where users.user_id = pool_members.user_id
              and users.auth_user_id = (select auth.uid()))
    and pool_writable(pool_id)
  );

drop policy if exists "Users can join pools" on pool_members;
create policy "Users can join pools" on pool_members
  for insert to authenticated
  with check (
    exists (select 1 from users where users.user_id = pool_members.user_id
              and users.auth_user_id = (select auth.uid()))
    and pool_writable(pool_id)
  );

drop policy if exists "Pool admins can update members" on pool_members;
create policy "Pool admins can update members" on pool_members
  for update to authenticated
  using (is_pool_admin(pool_id) and pool_writable(pool_id));

drop policy if exists "Users can update own membership" on pool_members;
create policy "Users can update own membership" on pool_members
  for update
  using (
    exists (select 1 from users where users.user_id = pool_members.user_id
              and users.auth_user_id = (select auth.uid()))
    and pool_writable(pool_id)
  );

-- ---------------------------------------------------------------------------
-- pool_entries — the entries themselves
-- "Super admins can manage entries" (FOR ALL) is left alone on purpose.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can delete own entries" on pool_entries;
create policy "Users can delete own entries" on pool_entries
  for delete to authenticated
  using (
    member_id in (select member_id from get_user_member_ids())
    and member_pool_writable(member_id)
  );

drop policy if exists "Users can insert own entries" on pool_entries;
create policy "Users can insert own entries" on pool_entries
  for insert to authenticated
  with check (
    member_id in (select member_id from get_user_member_ids())
    and member_pool_writable(member_id)
  );

drop policy if exists "Pool admins can update entries" on pool_entries;
create policy "Pool admins can update entries" on pool_entries
  for update to authenticated
  using (
    exists (select 1 from pool_members pm
              where pm.member_id = pool_entries.member_id and is_pool_admin(pm.pool_id))
    and member_pool_writable(member_id)
  );

drop policy if exists "Users can update own entries" on pool_entries;
create policy "Users can update own entries" on pool_entries
  for update to authenticated
  using (
    member_id in (select member_id from get_user_member_ids())
    and member_pool_writable(member_id)
  );

-- ---------------------------------------------------------------------------
-- Bracket-picker picks and round submissions.
--
-- These four were single FOR ALL policies, and an ALL policy's USING clause
-- governs SELECT as well as the writes. Adding the gate there would have made
-- an archived pool's own picks unreadable — breaking the read-only view this
-- whole change exists to serve. So each is split: SELECT keeps the original
-- ownership test untouched, and the three write commands carry the gate.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'bracket_picker_group_rankings',
    'bracket_picker_third_place_rankings',
    'bracket_picker_knockout_picks'
  ] loop
    execute format('drop policy if exists %I on %I', 'Users can manage own group rankings', t);
    execute format('drop policy if exists %I on %I', 'Users can manage own third place rankings', t);
    execute format('drop policy if exists %I on %I', 'Users can manage own knockout picks', t);

    execute format($f$
      create policy "Owners can read own picks" on %I
        for select using (
          entry_id in (
            select pe.entry_id from pool_entries pe
            join pool_members pm on pe.member_id = pm.member_id
            join users u on pm.user_id = u.user_id
            where u.auth_user_id = (select auth.uid())
          ))$f$, t);

    execute format($f$
      create policy "Owners can write own picks" on %I
        for insert with check (
          entry_id in (
            select pe.entry_id from pool_entries pe
            join pool_members pm on pe.member_id = pm.member_id
            join users u on pm.user_id = u.user_id
            where u.auth_user_id = (select auth.uid()))
          and entry_pool_writable(entry_id))$f$, t);

    execute format($f$
      create policy "Owners can update own picks" on %I
        for update using (
          entry_id in (
            select pe.entry_id from pool_entries pe
            join pool_members pm on pe.member_id = pm.member_id
            join users u on pm.user_id = u.user_id
            where u.auth_user_id = (select auth.uid()))
          and entry_pool_writable(entry_id))$f$, t);

    execute format($f$
      create policy "Owners can delete own picks" on %I
        for delete using (
          entry_id in (
            select pe.entry_id from pool_entries pe
            join pool_members pm on pe.member_id = pm.member_id
            join users u on pm.user_id = u.user_id
            where u.auth_user_id = (select auth.uid()))
          and entry_pool_writable(entry_id))$f$, t);
  end loop;
end $$;

drop policy if exists "Entry owners can manage their round submissions" on entry_round_submissions;

create policy "Entry owners can read their round submissions" on entry_round_submissions
  for select using (
    exists (select 1 from pool_entries pe
              join pool_members pm on pm.member_id = pe.member_id
              join users u on u.user_id = pm.user_id
            where pe.entry_id = entry_round_submissions.entry_id
              and u.auth_user_id = (select auth.uid())));

create policy "Entry owners can insert their round submissions" on entry_round_submissions
  for insert with check (
    exists (select 1 from pool_entries pe
              join pool_members pm on pm.member_id = pe.member_id
              join users u on u.user_id = pm.user_id
            where pe.entry_id = entry_round_submissions.entry_id
              and u.auth_user_id = (select auth.uid()))
    and entry_pool_writable(entry_id));

create policy "Entry owners can update their round submissions" on entry_round_submissions
  for update using (
    exists (select 1 from pool_entries pe
              join pool_members pm on pm.member_id = pe.member_id
              join users u on u.user_id = pm.user_id
            where pe.entry_id = entry_round_submissions.entry_id
              and u.auth_user_id = (select auth.uid()))
    and entry_pool_writable(entry_id));

create policy "Entry owners can delete their round submissions" on entry_round_submissions
  for delete using (
    exists (select 1 from pool_entries pe
              join pool_members pm on pm.member_id = pe.member_id
              join users u on u.user_id = pm.user_id
            where pe.entry_id = entry_round_submissions.entry_id
              and u.auth_user_id = (select auth.uid()))
    and entry_pool_writable(entry_id));

-- Rollback
-- --------
-- Restore the four FOR ALL policies and drop the split ones, then re-create the
-- pools / pool_settings / pool_members / pool_entries policies without their
-- `*_writable(...)` conjunct. The originals are recorded verbatim in the commit
-- that introduced this file. The three helpers can be dropped afterwards:
--   drop function if exists pool_writable(uuid);
--   drop function if exists member_pool_writable(uuid);
--   drop function if exists entry_pool_writable(uuid);
