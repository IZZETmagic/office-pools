-- =============================================================
-- 184 — A PUBLIC POOL SAYS HOW MANY ARE IN IT
-- =============================================================
-- Every public pool told every non-member it had NOBODY in it. `pool_members` is readable only by
-- the pool's own members (`pool_members_select_consolidated`: super admin, your pools, your
-- memberships), so a non-member's `count(*)` on a pool they are deciding whether to join came back
-- 0 — correctly, as far as the policy goes, and wrongly as far as the product goes.
--
-- Measured 2026-10-09 as an ordinary authenticated member, inside a rolled-back transaction: their
-- own pool counted 192, the two public pools on Discover counted 0 and 0. They have 3 and 1.
--
-- Three readers showed that 0:
--   · the app's Discover cards        (mobile/lib/useDiscoverPools.ts)
--   · the app's pool preview          (mobile/app/pool-preview/[id].tsx)
--   · the web's Discover search       (app/api/pools/search/route.ts)
-- Nobody inside the team saw it, because everybody testing was a member or a super admin.
--
-- ⭐ A NUMBER, NOT A DOOR. This returns one integer per pool and nothing else: no member ids, no
-- user ids, no names. And only for PUBLIC pools — a private pool's size stays its members'
-- business, exactly as before. Widening the `pool_members` policy instead would have handed every
-- signed-in account every public pool's member ROWS to get at a count.
--
-- Callers fall back to their own RLS count when a pool is missing from the result (a private pool
-- the caller belongs to), so nothing that worked before can get worse.
--
-- Idempotent: `create or replace`, grants restated.
-- =============================================================

create or replace function public.public_pool_member_counts(p_pool_ids uuid[])
returns table (pool_id uuid, member_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.pool_id, count(m.member_id)::integer as member_count
  from public.pools p
  left join public.pool_members m on m.pool_id = p.pool_id
  where p.pool_id = any (p_pool_ids)
    and p.is_private = false
  group by p.pool_id;
$$;

comment on function public.public_pool_member_counts(uuid[]) is
  'How many members each PUBLIC pool has, for people deciding whether to join. Counts only — no rows, no ids. See 184.';

revoke all on function public.public_pool_member_counts(uuid[]) from public, anon;
grant execute on function public.public_pool_member_counts(uuid[]) to authenticated, service_role;
