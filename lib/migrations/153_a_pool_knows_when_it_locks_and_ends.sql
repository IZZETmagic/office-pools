-- 153 — a pool knows when it first locks, and when it is over
--
-- Crews prerequisites P2 and P3 (drafts/2026-10-02_crews_plan.md). Two read-only functions, each
-- the single owner of a question nothing answered before. Both are DERIVED, never stored — the
-- matchweek-rhythm rule: a stored copy of a lock time is a copy that can lag.
--
-- ── pool_first_lock_at(pool) — when the first prediction in this pool locks ─────────────────────
--
-- A crew's held seat releases at the pool's first lock (Decision 2), so it needs one answer to
-- "when is that?". The pieces were in four places and nothing combined them:
--
--   World Cup, full_tournament / bracket_picker   pools.prediction_deadline
--   World Cup, progressive                        the earliest pool_round_states.deadline — the
--                                                 'group' round is seeded with prediction_deadline
--                                                 (lib/poolRoundStates.ts), so that is the fallback
--   league, table mode                            pools.league_table_lock_at
--   league, every other mode                      the earliest lock_at among this season's
--                                                 matchweeks that (a) have fixtures, (b) lock after
--                                                 the pool was created, (c) are at or after the
--                                                 pool's league_start_matchweek floor (143)
--
-- ⚠ NEVER pools.prediction_deadline FOR A LEAGUE POOL. The create route stores the season's LAST
-- kickoff there purely to satisfy NOT NULL (app/api/pools/create/route.ts), so it is ten months late.
--
-- ⚠ The league branch is ordered by LOCK TIME, filtered by NUMBER — the same two questions
-- openMatchweekId (lib/league/read.ts) keeps apart. Rounds get moved (2024 round 29 locked before
-- round 28), so "first" means earliest lock_at; the floor is on matchweek_number because that is
-- what the admin chose. (b) is why a pool created before 143 with no floor still gets the right
-- answer: the first week that could ask it for a pick is the first one that locked after it existed.
--
-- lock_at can still move before it passes (placeholder kickoffs, 133), so this moves with it — a
-- seat's expiry follows the real lock, which a stored copy would not.
--
-- ── pool_finished_at(pool) — when this pool's competition ended, or NULL while it runs ────────────
--
-- The "Keep this group together?" prompt (Crews §6) and the crew page's Playing now / Past seasons
-- split both need "is this pool over?". pools.status cannot answer it for a league: the only thing
-- that sets 'completed' (lib/auto-archive.ts) counts `matches` rows, and league fixtures live in
-- league_fixtures, so all 20 league pools sit at 'open' forever (programme R33).
--
--   World Cup   status = 'completed'  → the tournament's last match_date (a stable timestamp;
--                                        pools has no completed_at). updated_at if it has no matches.
--   league      the season's league_standings_final snapshot (080/091) — written only when every
--               fixture is complete and the standings are full. NULL until then.
--
-- Archived is not finished: an archived pool's competition may still be running, and the archive
-- has its own column (040).
--
-- Both are SECURITY INVOKER and readable only by the service role: they are for server code
-- (the crews and activity readers), and nothing a client renders needs to call them directly.

create or replace function public.pool_first_lock_at(p_pool_id uuid)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when p.league_season_id is null then
      case when p.prediction_mode = 'progressive'
        then coalesce(
          (select min(prs.deadline) from public.pool_round_states prs where prs.pool_id = p.pool_id),
          p.prediction_deadline)
        else p.prediction_deadline
      end
    when p.league_mode = 'table' then p.league_table_lock_at
    else (
      select min(mw.lock_at)
        from public.league_matchweeks mw
       where mw.season_id = p.league_season_id
         and mw.fixture_count > 0
         and mw.lock_at > p.created_at
         and mw.matchweek_number >= coalesce(p.league_start_matchweek, 0)
    )
  end
  from public.pools p
  where p.pool_id = p_pool_id
$$;

comment on function public.pool_first_lock_at(uuid) is
  'When the first prediction in this pool locks. World Cup: prediction_deadline (progressive: the '
  'earliest round deadline). League table: league_table_lock_at. Other league modes: the earliest '
  'lock_at of a matchweek with fixtures, locking after the pool was created, at or after '
  'league_start_matchweek. Never prediction_deadline for a league pool. See 153.';

create or replace function public.pool_finished_at(p_pool_id uuid)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when p.league_season_id is null then
      case when p.status = 'completed'
        then coalesce(
          (select max(m.match_date) from public.matches m where m.tournament_id = p.tournament_id),
          p.updated_at)
      end
    else (
      select min(f.snapshot_at) from public.league_standings_final f where f.season_id = p.league_season_id
    )
  end
  from public.pools p
  where p.pool_id = p_pool_id
$$;

comment on function public.pool_finished_at(uuid) is
  'When this pool''s competition ended, NULL while it runs. World Cup: status completed, timed at '
  'the tournament''s last match. League: the season''s league_standings_final snapshot — never '
  'pools.status, which no league pool ever reaches (R33). See 153.';

revoke all on function public.pool_first_lock_at(uuid) from public, anon, authenticated;
revoke all on function public.pool_finished_at(uuid)   from public, anon, authenticated;
grant execute on function public.pool_first_lock_at(uuid) to service_role;
grant execute on function public.pool_finished_at(uuid)   to service_role;
