-- =============================================================
-- Prove migration 183's lock — and leave NOTHING behind
-- =============================================================
-- Run AFTER 183 is applied, as one query (Supabase SQL editor, or the MCP's execute_sql).
--
-- ⭐ IT ALWAYS ENDS IN AN ERROR, ON PURPOSE. A multi-statement query runs as one transaction, so
-- the final RAISE rolls back every gate, grant and avatar change the tests made. The results are
-- in the error message. Verified 2026-10-09 that a failing query leaves no table behind.
--
-- ⚠ Tests run as REAL non-super-admin members (picked below) with `authenticated` + their JWT
-- claims — the privilege-escalation lesson: prove it as an ordinary member, never as an admin.
-- Their rows are touched only inside the rolled-back transaction.
--
-- Expected: T0 rows=1 · T2 23514 · T3/T4/T9/T11/T12/T14 42501 · T5 rows=2 · T6 rows=1 ·
-- T7 rows=1 hair=test-183-gift · T8 rows=1 · T10 hair=null glasses=null · T13 23503 · T15 rows=1
-- =============================================================

select set_config('lock_timeout', '3s', true);

do $t$
declare
  m uuid;
  n uuid;
  m_auth uuid;
  worn text;
  r text[] := '{}';
  c int;
  v text;
  v2 text;
begin
  select user_id, auth_user_id into m, m_auth from public.users
   where auth_user_id is not null and coalesce(is_super_admin, false) = false and avatar_build is not null
   order by created_at desc limit 1;
  select user_id into n from public.users
   where auth_user_id is not null and coalesce(is_super_admin, false) = false and avatar_build is not null
     and user_id <> m
   order by created_at desc limit 1;
  -- ⚠ A worn hairstyle that is NOT already gated — a real gift its owner wears would hit the
  -- primary key (23505) instead of the rule-18 check this test exists for.
  select u.avatar_build ->> 'hair' into worn from public.users u
   where u.avatar_build ->> 'hair' is not null
     and not exists (select 1 from public.avatar_gated_assets g
                      where g.slot = 'hair' and g.asset_key = u.avatar_build ->> 'hair')
   limit 1;
  if m is null or n is null or worn is null then
    raise exception 'need two non-admin members with a built avatar, and one worn hairstyle';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', m_auth, 'role', 'authenticated')::text, true);

  begin
    set local role authenticated;
    update public.users set avatar_build = jsonb_set(avatar_build, '{shirt}', '"#3B6EFF"') where user_id = m;
    get diagnostics c = row_count;
    reset role;
    r := r || ('T0 control: member can update own build, rows=' || c);
  exception when others then r := r || ('T0 FAIL ' || sqlstate || ' ' || sqlerrm); end;

  begin
    insert into public.avatar_gated_assets(slot, asset_key, note)
    values ('hair','test-183-gift','t'), ('glasses','test-183-specs','t');
    r := r || 'T1 gate two new assets: ok'::text;
  exception when others then r := r || ('T1 FAIL ' || sqlstate || ' ' || sqlerrm); end;

  begin
    insert into public.avatar_gated_assets(slot, asset_key) values ('hair', worn);
    r := r || 'T2 FAIL: gated an asset someone wears'::text;
  exception when others then r := r || ('T2 gating a worn asset refused: ' || sqlstate); end;

  begin
    set local role authenticated;
    update public.users set avatar_build = jsonb_set(avatar_build, '{hair}', '"test-183-gift"') where user_id = m;
    get diagnostics c = row_count;
    reset role;
    r := r || ('T3 FAIL: member equipped unowned asset, rows=' || c);
  exception when others then r := r || ('T3 member equipping unowned refused: ' || sqlstate); end;

  begin
    set local role authenticated;
    insert into public.avatar_asset_grants(user_id, slot, asset_key, source) values (m, 'hair', 'test-183-gift', 'gift');
    reset role;
    r := r || 'T4 FAIL: member granted themselves'::text;
  exception when others then r := r || ('T4 member self-grant refused: ' || sqlstate); end;

  begin
    set local role authenticated;
    select count(*) into c from public.avatar_gated_assets where asset_key like 'test-183-%';
    reset role;
    r := r || ('T5 member reads gated list, rows=' || c);
  exception when others then r := r || ('T5 FAIL ' || sqlstate || ' ' || sqlerrm); end;

  begin
    insert into public.avatar_asset_grants(user_id, slot, asset_key, source) values (m, 'hair', 'test-183-gift', 'gift');
    insert into public.avatar_asset_grants(user_id, slot, asset_key, source) values (n, 'glasses', 'test-183-specs', 'gift');
    set local role authenticated;
    select count(*) into c from public.avatar_asset_grants where asset_key like 'test-183-%';
    reset role;
    r := r || ('T6 member sees only own grants (expect 1 of 2), rows=' || c);
  exception when others then r := r || ('T6 FAIL ' || sqlstate || ' ' || sqlerrm); end;

  begin
    set local role authenticated;
    update public.users set avatar_build = jsonb_set(avatar_build, '{hair}', '"test-183-gift"') where user_id = m;
    get diagnostics c = row_count;
    reset role;
    select avatar_build ->> 'hair' into v from public.users where user_id = m;
    r := r || ('T7 member equips owned asset, rows=' || c || ' hair=' || v);
  exception when others then r := r || ('T7 FAIL ' || sqlstate || ' ' || sqlerrm); end;

  begin
    set local role authenticated;
    update public.users set avatar_build = jsonb_set(avatar_build, '{shirt}', '"#111111"') where user_id = m;
    get diagnostics c = row_count;
    reset role;
    r := r || ('T8 member edits another field while wearing it, rows=' || c);
  exception when others then r := r || ('T8 FAIL ' || sqlstate || ' ' || sqlerrm); end;

  begin
    set local role authenticated;
    delete from public.avatar_asset_grants where user_id = m;
    get diagnostics c = row_count;
    reset role;
    r := r || ('T9 FAIL: member deleted a grant, rows=' || c);
  exception when others then r := r || ('T9 member cannot delete grants: ' || sqlstate); end;

  begin
    insert into public.avatar_asset_grants(user_id, slot, asset_key, source) values (m, 'glasses', 'test-183-specs', 'gift');
    set local role authenticated;
    update public.users set avatar_build = jsonb_set(avatar_build, '{glasses}', '"test-183-specs"') where user_id = m;
    reset role;
    delete from public.avatar_asset_grants where user_id = m and asset_key like 'test-183-%';
    get diagnostics c = row_count;
    select avatar_build -> 'hair', avatar_build -> 'glasses' into v, v2 from public.users where user_id = m;
    r := r || ('T10 bulk revoke of ' || c || ' grants strips both: hair=' || v || ' glasses=' || v2);
  exception when others then r := r || ('T10 FAIL ' || sqlstate || ' ' || sqlerrm); end;

  begin
    set local role anon;
    select count(*) into c from public.avatar_gated_assets;
    reset role;
    r := r || ('T11 FAIL: anon read gated list, rows=' || c);
  exception when others then r := r || ('T11 anon refused: ' || sqlstate); end;

  begin
    update public.users set avatar_build = jsonb_set(avatar_build, '{hair}', '"test-183-gift"') where user_id = n;
    r := r || 'T12 FAIL: service role equipped unowned asset'::text;
  exception when others then r := r || ('T12 service role not exempt: ' || sqlstate); end;

  begin
    delete from public.avatar_gated_assets where slot = 'glasses' and asset_key = 'test-183-specs';
    r := r || 'T13 FAIL: un-gated an asset that has an owner'::text;
  exception when others then r := r || ('T13 un-gating an owned asset refused: ' || sqlstate); end;

  begin
    insert into public.users(email, username, avatar_build)
    values ('t183@example.invalid', 't183_probe', '{"base":"base-neck-100","hair":"test-183-gift"}'::jsonb);
    r := r || 'T14 FAIL: inserted a user wearing an unowned asset'::text;
  exception when others then r := r || ('T14 insert path refused: ' || sqlstate); end;

  begin
    update public.users set avatar_build = jsonb_set(avatar_build, '{shirt}', '"#222222"') where user_id = n;
    get diagnostics c = row_count;
    r := r || ('T15 ungated write by service role unaffected, rows=' || c);
  exception when others then r := r || ('T15 FAIL ' || sqlstate || ' ' || sqlerrm); end;

  raise exception E'ROLLED BACK. RESULTS:\n%', array_to_string(r, E'\n');
end;
$t$;
