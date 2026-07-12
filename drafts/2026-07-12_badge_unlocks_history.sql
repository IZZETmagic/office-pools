-- =====================================================================
-- badge_unlocks — append-only badge unlock ledger
-- (ROADMAP: "Badge unlock history" + persistence half of "Badge batch")
--
-- PROBLEM: entry_xp_state.earned_badge_ids is a MUTABLE snapshot overwritten
-- on every recompute (lib/push/badges.ts). If a later recompute no longer
-- re-derives a badge (e.g. rank slips so top_dog is lost, a streak recomputes
-- shorter), the badge silently disappears from the UI. There is no permanent
-- record and no way to show cumulative counts ("10x Lightning Rod").
--
-- FIX: a permanent, append-only table written alongside the snapshot. Once a
-- badge is recorded for an entry it is never removed. Cumulative count for a
-- user = count of their rows for a badge_id across all entries/pools.
-- Applied to prod as migration `badge_unlocks_history`.
-- =====================================================================

create table if not exists public.badge_unlocks (
  id            bigint generated always as identity primary key,
  entry_id      uuid not null references public.pool_entries(entry_id) on delete cascade,
  user_id       uuid not null,
  pool_id       uuid not null references public.pools(pool_id) on delete cascade,
  tournament_id uuid,
  badge_id      text not null,
  unlocked_at   timestamptz not null default now(),
  unique (entry_id, badge_id)
);

create index if not exists idx_badge_unlocks_user       on public.badge_unlocks(user_id);
create index if not exists idx_badge_unlocks_user_badge on public.badge_unlocks(user_id, badge_id);
create index if not exists idx_badge_unlocks_entry      on public.badge_unlocks(entry_id);

alter table public.badge_unlocks enable row level security;

-- Read: any pool member can view unlocks for entries in pools they belong to
-- (mirrors the predictions SELECT policy). Writes are service-role only.
create policy "Members can view badge unlocks in their pools"
  on public.badge_unlocks for select to authenticated
  using (pool_id in (select pool_id from get_user_pool_ids()));

grant select on public.badge_unlocks to authenticated;
grant select, insert, update, delete on public.badge_unlocks to service_role;

-- One-time backfill from the current mutable snapshot so cumulative counts work
-- immediately (idempotent; the badges.ts write keeps it current thereafter).
-- NOTE: run the variant matching earned_badge_ids' column type (text[] vs jsonb).
-- text[] :
--   insert into public.badge_unlocks (entry_id, user_id, pool_id, tournament_id, badge_id)
--   select exs.entry_id, pm.user_id, pm.pool_id, p.tournament_id, bid
--   from public.entry_xp_state exs
--   join public.pool_entries pe on pe.entry_id = exs.entry_id
--   join public.pool_members pm on pm.member_id = pe.member_id
--   join public.pools p        on p.pool_id = pm.pool_id
--   cross join lateral unnest(coalesce(exs.earned_badge_ids, '{}')::text[]) as bid
--   on conflict (entry_id, badge_id) do nothing;
