-- verify-pool-member-guard.sql — re-runnable proof that migration 151 (R32) holds.
--
-- Run it in the Supabase SQL editor (or via the MCP execute_sql). It changes NOTHING: the whole
-- block always ends by raising, so every write it makes is rolled back. The result is the error
-- message, which reads "GUARD CHECK (rolled back) — S1 … ✓ | S2 … ✓ | …". Any ✗ is a failure.
--
-- It picks its own subjects: a finished, unarchived, non-branded pool with exactly one admin and
-- at least two players, one of those players, and a second pool that player is not in. It acts
-- as each person exactly as PostgREST would — the JWT claims plus `set local role authenticated`.
-- A finished pool is used on purpose: nothing about it is live, and nothing persists anyway.
--
--   S1  a player makes themselves admin                  → blocked (42501)
--   S2  a player updates their own last_read_at          → allowed, 1 row
--   S3  a player marks their own entry fee paid          → blocked (42501)
--   S4  the pool admin promotes that player              → allowed, 1 row
--   S5  the pool admin moves the player to another pool  → blocked (42501)
--   S6  a player inserts a membership directly, as admin → blocked (RLS, 42501)
--   S7  the service role changes the role                → allowed, 1 row
--   S8  a player tries to demote the admin               → 0 rows (RLS)

do $t$
declare
  v_pool uuid; v_other uuid; v_member uuid; v_user uuid;
  v_player text; v_admin text;
  v_rows int; r text := '';
begin
  select p.pool_id into v_pool
    from public.pools p
   where p.status = 'completed' and p.archived_at is null and p.brand_slug is null
     and (select count(*) from public.pool_members pm where pm.pool_id = p.pool_id and pm.role = 'player') >= 2
     and (select count(*) from public.pool_members pm where pm.pool_id = p.pool_id and pm.role = 'admin') = 1
   order by p.created_at limit 1;

  select pm.member_id, pm.user_id, u.auth_user_id::text into v_member, v_user, v_player
    from public.pool_members pm join public.users u on u.user_id = pm.user_id
   where pm.pool_id = v_pool and pm.role = 'player' and not u.is_super_admin
   order by pm.joined_at limit 1;

  select u.auth_user_id::text into v_admin
    from public.pool_members pm join public.users u on u.user_id = pm.user_id
   where pm.pool_id = v_pool and pm.role = 'admin' limit 1;

  select p.pool_id into v_other
    from public.pools p
   where p.archived_at is null and p.pool_id <> v_pool
     and not exists (select 1 from public.pool_members pm where pm.pool_id = p.pool_id and pm.user_id = v_user)
   order by p.created_at limit 1;

  if v_pool is null or v_member is null or v_admin is null or v_other is null then
    raise exception 'GUARD CHECK could not find subjects (pool %, member %, admin %, other %)', v_pool, v_member, v_admin, v_other;
  end if;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_player, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_members set role = 'admin' where member_id = v_member;
    get diagnostics v_rows = row_count; r := r || format('S1 self-promote ALLOWED rows=%s ✗ | ', v_rows); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('S1 self-promote blocked (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_player, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_members set last_read_at = now(), has_seen_how_to_play = true where member_id = v_member;
    get diagnostics v_rows = row_count;
    r := r || format('S2 own read-state rows=%s %s | ', v_rows, case when v_rows = 1 then '✓' else '✗' end); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('S2 own read-state BLOCKED (%s) ✗ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_player, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_members set entry_fee_paid = true where member_id = v_member;
    get diagnostics v_rows = row_count; r := r || format('S3 self fee-paid ALLOWED rows=%s ✗ | ', v_rows); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('S3 self fee-paid blocked (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_members set role = 'admin' where member_id = v_member;
    get diagnostics v_rows = row_count;
    r := r || format('S4 admin promotes rows=%s %s | ', v_rows, case when v_rows = 1 then '✓' else '✗' end); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('S4 admin promotes BLOCKED (%s) ✗ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_members set pool_id = v_other where member_id = v_member;
    get diagnostics v_rows = row_count; r := r || format('S5 admin moves member ALLOWED rows=%s ✗ | ', v_rows); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('S5 admin moves member blocked (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_player, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.pool_members (pool_id, user_id, role) values (v_other, v_user, 'admin');
    r := r || 'S6 direct insert ALLOWED ✗ | '; raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('S6 direct insert blocked (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', '', true);
    update public.pool_members set role = 'admin' where member_id = v_member;
    get diagnostics v_rows = row_count;
    r := r || format('S7 service role rows=%s %s | ', v_rows, case when v_rows = 1 then '✓' else '✗' end); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('S7 service role BLOCKED (%s) ✗ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_player, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_members set role = 'player' where pool_id = v_pool and role = 'admin';
    get diagnostics v_rows = row_count;
    r := r || format('S8 player demotes admin rows=%s %s', v_rows, case when v_rows = 0 then '✓' else '✗' end); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('S8 player demotes admin blocked (%s) ✓', sqlstate); end if; end;

  raise exception 'GUARD CHECK (rolled back) — %', r;
end $t$;
