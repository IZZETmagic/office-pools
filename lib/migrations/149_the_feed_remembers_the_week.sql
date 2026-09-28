-- 149 — the feed remembers the week
--
-- ⭐ Two small tables for the Activity tab redesign (Needs You → Matchweek Story → filter chips).
--
-- 1. league_entry_rank_history — where every entry stood when each matchweek was settled.
--
--    The Matchweek Story card says "14 pts, up 3 to 4th". `league_entry_totals` can only ever
--    answer that for ONE week: it holds `final_rank` and `previous_final_rank`, and the second is
--    overwritten at every snapshot. So the card for Matchweek 5 has nothing to read once
--    Matchweek 6 has settled. This table keeps the row the snapshot throws away.
--
--    ⭐ WRITTEN BY A TRIGGER, NOT INSIDE league_snapshot_matchweek_ranks — the same call
--    trg_league_settle_duels and trg_league_settle_lms made (see league_settle_duels_on_snapshot):
--    additive, so the live snapshot function is not rewritten.
--
--    ⚠⚠ THE TRIGGER NAME IS LOAD-BEARING. Postgres fires same-event triggers in NAME order.
--    `trg_league_snapshot_rank_history` sorts after `trg_league_settle_duels` and
--    `trg_league_settle_lms`, so the rank it captures already includes that week's duel points
--    and LMS rounds — the rank the member actually holds after the week. Rename it to something
--    that sorts first and Showdown/LMS history silently records the pre-settlement rank.
--
--    ⚠ `final_rank` is read AS STORED. Never recompute a rank from points here — a derived rank
--    cannot see a point adjustment.
--
-- 2. user_activity_seen — when the member last opened the Activity tab.
--
--    Every feed item used to be sent `is_read: true`, so the unread dot never showed. Items are
--    synthesised from other tables, not stored, so per-item read flags would need a row per
--    item per member. One timestamp does the job: anything newer than it is unread.
--
-- Both tables are RLS-on with ZERO policies — deny-all, read and written only by the API with
-- the admin client. `league_entry_rank_history` is added to
-- lib/league/__tests__/denyAllTables.guard.test.ts for that reason.

create table if not exists public.league_entry_rank_history (
  entry_id          uuid        not null references public.pool_entries(entry_id) on delete cascade,
  pool_id           uuid        not null references public.pools(pool_id) on delete cascade,
  matchweek_number  integer     not null,
  rank              integer     not null,
  captured_at       timestamptz not null default now(),
  primary key (entry_id, matchweek_number)
);

create index if not exists league_entry_rank_history_pool_idx
  on public.league_entry_rank_history (pool_id, matchweek_number);

alter table public.league_entry_rank_history enable row level security;

comment on table public.league_entry_rank_history is
  'Migration 149. An entry''s final_rank as it stood when each matchweek settled '
  '(ranks_snapshot_at went non-NULL), after that week''s duels and LMS rounds. Read by the '
  'Activity feed''s Matchweek Story cards. Deny-all: admin client only.';

create or replace function public.league_capture_rank_history_on_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Fires once per matchweek, at the moment it becomes fully played AND fully scored.
  -- Cheap by design: one INSERT … SELECT over the season's entry totals.
  insert into league_entry_rank_history (entry_id, pool_id, matchweek_number, rank)
  select t.entry_id, t.pool_id, new.matchweek_number, t.final_rank
    from league_entry_totals t
    join pools p on p.pool_id = t.pool_id
   where p.league_season_id = new.season_id
     and t.final_rank is not null
  on conflict (entry_id, matchweek_number) do nothing;
  return null;
end;
$$;

drop trigger if exists trg_league_snapshot_rank_history on public.league_matchweeks;
create trigger trg_league_snapshot_rank_history
  after update of ranks_snapshot_at on public.league_matchweeks
  for each row
  when (old.ranks_snapshot_at is null and new.ranks_snapshot_at is not null)
  execute function public.league_capture_rank_history_on_snapshot();

-- Backfill: the ONE past week that can be recovered honestly.
--
-- `previous_final_rank` is exactly the rank frozen at the latest snapshot, so the latest settled
-- matchweek of each season gets a row. ⚠ NOT for Showdown or Last Man Standing: their snapshot
-- freezes the rank BEFORE the duel/round settles, so it would be the wrong number. Every earlier
-- week is gone and stays gone — the card shows points only for those.
insert into public.league_entry_rank_history (entry_id, pool_id, matchweek_number, rank, captured_at)
select t.entry_id, t.pool_id, mw.matchweek_number, t.previous_final_rank, mw.ranks_snapshot_at
  from public.league_entry_totals t
  join public.pools p on p.pool_id = t.pool_id
  join lateral (
    select m.matchweek_number, m.ranks_snapshot_at
      from public.league_matchweeks m
     where m.season_id = p.league_season_id
       and m.ranks_snapshot_at is not null
     order by m.ranks_snapshot_at desc
     limit 1
  ) mw on true
 where t.previous_final_rank is not null
   and p.league_mode in ('pickem', 'table')
on conflict (entry_id, matchweek_number) do nothing;

create table if not exists public.user_activity_seen (
  user_id  uuid        primary key references public.users(user_id) on delete cascade,
  seen_at  timestamptz not null default now()
);

alter table public.user_activity_seen enable row level security;

comment on table public.user_activity_seen is
  'Migration 149. When the member last opened the Activity tab; feed items newer than this are '
  'unread. Written by POST /api/users/:id/activity/seen. Deny-all: admin client only.';
