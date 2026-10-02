-- verify-pool-entry-guard.sql — re-runnable proof that migration 152 (R34) holds.
--
-- Run it in the Supabase SQL editor (or via the MCP execute_sql). It changes NOTHING: the block
-- always ends by raising, so every write is rolled back. The result is the error message:
-- "ENTRY GUARD CHECK (rolled back) — pool … · M1 … ✓ | …". Any ✗ is a failure.
--
-- Subjects it picks for itself: a finished, unarchived, non-branded pool whose only admin is NOT a
-- super admin; a non-super player in it with a submitted, unretired entry; another player's entry.
-- ⚠⚠ Two traps this file exists to avoid, both hit on 2026-10-02:
--   · a SUPER ADMIN passes the guard by design, so a super-admin "pool admin" proves nothing about
--     the pool-admin rule — the admin is required to be non-super;
--   · setting a column to the value it already holds is not a change, so it rightly passes — every
--     "is this blocked?" write FLIPS the value (`not fee_paid`, `+ 500`) rather than setting one.
--
--   M1  member gives themselves points (point_adjustment)        → blocked
--   M2  member rewrites their total and rank                      → blocked
--   M3  member retires / un-retires themselves                    → blocked
--   M4  member flips their own fee                                → blocked
--   M5  member flips predictions_locked                           → blocked
--   M6  member renames, marks recap seen, saves                   → allowed
--   M7  member backdates their submission time                    → kept unchanged
--   M8  member un-submits                                         → blocked
--   M9  member inserts an entry loaded with points, claiming another pool → lands clean, own pool
--   M10 member hard-deletes their own entry                       → 0 rows
--   M11 member touches someone else's entry                       → 0 rows
--   A1  pool admin adjusts a player's points                      → allowed
--   A2  pool admin rewrites a total directly                      → blocked
--   A3  pool admin flips a fee                                    → allowed
--   A4  pool admin unlocks; member resubmits with a 2020 device time → stamped with server time
--   A5  pool admin adjusts, then lite_recalc_entry re-derives the total → allowed, total = parts
--   S1  service role rewrites a total                             → allowed

do $t$
declare
  v_pool uuid; v_member text; v_admin text; v_entry uuid; v_mem_id uuid; v_other uuid; v_elsewhere uuid;
  v_old_ts timestamptz; v_base int;
  v_rows int; v_ts timestamptz; v_adj int; v_got_pool uuid; v_sub boolean; r text := '';
begin
  select p.pool_id into v_pool
    from public.pools p
   where p.status = 'completed' and p.archived_at is null and p.brand_slug is null
     and (select count(*) from public.pool_members pm where pm.pool_id = p.pool_id and pm.role = 'admin') = 1
     and not exists (select 1 from public.pool_members pm join public.users u on u.user_id = pm.user_id
                      where pm.pool_id = p.pool_id and pm.role = 'admin' and u.is_super_admin)
     and (select count(*) from public.pool_members pm join public.users u on u.user_id = pm.user_id
           where pm.pool_id = p.pool_id and pm.role = 'player' and not u.is_super_admin) >= 2
     and exists (select 1 from public.pool_entries pe join public.pool_members pm on pm.member_id = pe.member_id
                  join public.users u on u.user_id = pm.user_id
                  where pm.pool_id = p.pool_id and pm.role = 'player' and not u.is_super_admin
                    and pe.retired_at is null and pe.has_submitted_predictions and pe.predictions_submitted_at is not null)
   order by p.created_at limit 1;

  select u.auth_user_id::text into v_admin
    from public.pool_members pm join public.users u on u.user_id = pm.user_id
   where pm.pool_id = v_pool and pm.role = 'admin' and not u.is_super_admin limit 1;

  select u.auth_user_id::text, pm.member_id, pe.entry_id, pe.predictions_submitted_at,
         coalesce(pe.match_points, 0) + coalesce(pe.bonus_points, 0) + coalesce(pe.point_adjustment, 0)
    into v_member, v_mem_id, v_entry, v_old_ts, v_base
    from public.pool_members pm join public.users u on u.user_id = pm.user_id
    join public.pool_entries pe on pe.member_id = pm.member_id
   where pm.pool_id = v_pool and pm.role = 'player' and not u.is_super_admin
     and pe.retired_at is null and pe.has_submitted_predictions and pe.predictions_submitted_at is not null
   order by pm.joined_at, pe.entry_number limit 1;

  select pe.entry_id into v_other
    from public.pool_entries pe join public.pool_members pm on pm.member_id = pe.member_id
   where pm.pool_id = v_pool and pm.member_id <> v_mem_id and pe.retired_at is null limit 1;

  select p.pool_id into v_elsewhere from public.pools p where p.pool_id <> v_pool order by p.created_at limit 1;

  r := format('pool %s · ', v_pool);
  if v_pool is null or v_admin is null or v_entry is null or v_other is null then
    raise exception 'ENTRY GUARD CHECK could not find subjects (pool %, admin %, entry %, other %)', v_pool, v_admin, v_entry, v_other;
  end if;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set point_adjustment = coalesce(point_adjustment, 0) + 500 where entry_id = v_entry;
    get diagnostics v_rows = row_count; r := r || format('M1 own points ALLOWED rows=%s ✗ | ', v_rows); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('M1 own points blocked (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set scored_total_points = coalesce(scored_total_points, 0) + 99999,
                                   current_rank = coalesce(current_rank, 0) + 1 where entry_id = v_entry;
    get diagnostics v_rows = row_count; r := r || format('M2 own total ALLOWED rows=%s ✗ | ', v_rows); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('M2 own total blocked (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set retired_at = case when retired_at is null then now() end,
                                   retired_reason = case when retired_at is null then 'stopped' end where entry_id = v_entry;
    get diagnostics v_rows = row_count; r := r || format('M3 retire ALLOWED rows=%s ✗ | ', v_rows); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('M3 retire blocked (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set fee_paid = not coalesce(fee_paid, false) where entry_id = v_entry;
    get diagnostics v_rows = row_count; r := r || format('M4 own fee ALLOWED rows=%s ✗ | ', v_rows); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('M4 own fee blocked (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set predictions_locked = not coalesce(predictions_locked, false) where entry_id = v_entry;
    get diagnostics v_rows = row_count; r := r || format('M5 lock ALLOWED rows=%s ✗ | ', v_rows); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('M5 lock blocked (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set entry_name = coalesce(entry_name, '') || ' (renamed)', last_recap_seen_at = now(),
                                   predictions_last_saved_at = now() where entry_id = v_entry;
    get diagnostics v_rows = row_count;
    r := r || format('M6 name/markers rows=%s %s | ', v_rows, case when v_rows = 1 then '✓' else '✗' end); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('M6 name/markers BLOCKED (%s %s) ✗ | ', sqlstate, sqlerrm); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set predictions_submitted_at = '2020-01-01' where entry_id = v_entry;
    execute 'reset role';
    select predictions_submitted_at into v_ts from public.pool_entries where entry_id = v_entry;
    r := r || format('M7 backdate %s | ', case when v_ts = v_old_ts then 'kept ✓' else 'MOVED ✗' end); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('M7 backdate ERR (%s %s) ✗ | ', sqlstate, sqlerrm); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set has_submitted_predictions = false where entry_id = v_entry;
    get diagnostics v_rows = row_count; r := r || format('M8 un-submit ALLOWED rows=%s ✗ | ', v_rows); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('M8 un-submit blocked (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.pool_entries (member_id, entry_name, entry_number, point_adjustment, scored_total_points, fee_paid, pool_id)
      values (v_mem_id, 'Loaded', 99, 999, 99999, true, v_elsewhere);
    execute 'reset role';
    select point_adjustment, pool_id into v_adj, v_got_pool from public.pool_entries where member_id = v_mem_id and entry_number = 99;
    r := r || format('M9 loaded insert adj=%s own_pool=%s %s | ', v_adj, v_got_pool = v_pool,
                     case when v_adj = 0 and v_got_pool = v_pool then '✓' else '✗' end); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('M9 insert refused (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    delete from public.pool_entries where entry_id = v_entry;
    get diagnostics v_rows = row_count;
    r := r || format('M10 hard delete rows=%s %s | ', v_rows, case when v_rows = 0 then '✓' else '✗' end); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('M10 hard delete blocked (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set entry_name = coalesce(entry_name, '') || 'x' where entry_id = v_other;
    get diagnostics v_rows = row_count;
    r := r || format('M11 other entry rows=%s %s | ', v_rows, case when v_rows = 0 then '✓' else '✗' end); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('M11 other entry blocked (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set point_adjustment = coalesce(point_adjustment, 0) + 25, adjustment_reason = 'verify' where entry_id = v_entry;
    get diagnostics v_rows = row_count;
    r := r || format('A1 admin adjust rows=%s %s | ', v_rows, case when v_rows = 1 then '✓' else '✗' end); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('A1 admin adjust BLOCKED (%s %s) ✗ | ', sqlstate, sqlerrm); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set scored_total_points = coalesce(scored_total_points, 0) + 1 where entry_id = v_entry;
    get diagnostics v_rows = row_count; r := r || format('A2 admin total ALLOWED rows=%s ✗ | ', v_rows); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('A2 admin total blocked (%s) ✓ | ', sqlstate); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set fee_paid = not coalesce(fee_paid, false), fee_paid_at = now() where entry_id = v_entry;
    get diagnostics v_rows = row_count;
    r := r || format('A3 admin fee rows=%s %s | ', v_rows, case when v_rows = 1 then '✓' else '✗' end); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('A3 admin fee BLOCKED (%s %s) ✗ | ', sqlstate, sqlerrm); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set has_submitted_predictions = false, predictions_submitted_at = null where entry_id = v_entry;
    perform set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    update public.pool_entries set has_submitted_predictions = true, predictions_submitted_at = '2020-01-01' where entry_id = v_entry;
    execute 'reset role';
    select predictions_submitted_at, has_submitted_predictions into v_ts, v_sub from public.pool_entries where entry_id = v_entry;
    r := r || format('A4 unlock + resubmit at a 2020 device time %s | ',
                     case when v_sub and v_ts > now() - interval '1 minute' then 'stamped server time ✓' else 'NOT server time ✗' end);
    raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('A4 ERR (%s %s) ✗ | ', sqlstate, sqlerrm); end if; end;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.pool_entries set point_adjustment = coalesce(point_adjustment, 0) + 25, adjustment_reason = 'verify' where entry_id = v_entry;
    perform public.lite_recalc_entry(v_entry, v_pool);
    execute 'reset role';
    select scored_total_points into v_adj from public.pool_entries where entry_id = v_entry;
    r := r || format('A5 adjust + lite_recalc total=%s %s | ', v_adj, case when v_adj = v_base + 25 then '✓' else '✗' end); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('A5 lite_recalc BLOCKED (%s %s) ✗ | ', sqlstate, sqlerrm); end if; end;

  begin
    perform set_config('request.jwt.claims', '', true);
    update public.pool_entries set scored_total_points = coalesce(scored_total_points, 0) + 1 where entry_id = v_entry;
    get diagnostics v_rows = row_count;
    r := r || format('S1 service rows=%s %s', v_rows, case when v_rows = 1 then '✓' else '✗' end); raise exception 'undo';
  exception when others then if sqlerrm = 'undo' then null; else r := r || format('S1 service BLOCKED (%s %s) ✗', sqlstate, sqlerrm); end if; end;

  raise exception 'ENTRY GUARD CHECK (rolled back) — %', r;
end $t$;
