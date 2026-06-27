-- ============================================================================
-- Analytics cron hardening — apply in a no-match window BEFORE deploying the
-- reworked analytics-sweep route. Fixes audit findings #1/#2 (1000-row cap →
-- missed pools), #5 (no lock), #6 (string timestamp compare).
-- DRAFT — do not run during a live match (the index build briefly locks
-- pool_entries; it's ~4,800 rows so it's sub-second, but pick a calm moment).
-- ============================================================================

-- 1. Detection as a server-side aggregate: returns DISTINCT changed pools with
--    their newest change, oldest-first, limited to N pools. No PostgREST
--    1000-row cap (aggregation happens in SQL before the limit), timestamps
--    compared/ordered as real timestamptz (not strings).
create or replace function get_changed_analytics_pools(p_since timestamptz, p_limit int)
returns table(pool_id uuid, newest_change timestamptz)
language sql stable as $$
  select pm.pool_id, max(pe.last_rank_update) as newest_change
  from pool_entries pe
  join pool_members pm on pm.member_id = pe.member_id
  where pe.last_rank_update > p_since
  group by pm.pool_id
  order by max(pe.last_rank_update) asc
  limit p_limit
$$;

-- Supporting index so the detection scan is cheap during bursts.
create index if not exists idx_pool_entries_last_rank_update
  on pool_entries (last_rank_update);

-- 2. Lease lock so overlapping cron runs can't both advance the watermark.
--    Atomic: the conflict-update only fires when the existing lease is expired,
--    so exactly one caller wins. TTL auto-releases if a run crashes.
create or replace function try_acquire_analytics_lock(p_ttl_seconds int)
returns boolean
language plpgsql as $$
declare got boolean;
begin
  insert into sync_settings(setting_key, setting_value)
  values ('analytics_lock_until', to_jsonb((now() + make_interval(secs => p_ttl_seconds))::text))
  on conflict (setting_key) do update
    set setting_value = to_jsonb((now() + make_interval(secs => p_ttl_seconds))::text)
    where (sync_settings.setting_value #>> '{}')::timestamptz < now()
  returning true into got;
  return coalesce(got, false);
end;
$$;

create or replace function release_analytics_lock()
returns void
language sql as $$
  update sync_settings set setting_value = to_jsonb('1970-01-01T00:00:00Z'::text)
  where setting_key = 'analytics_lock_until';
$$;

-- Seed the lock row as released so the first acquire succeeds.
insert into sync_settings(setting_key, setting_value)
values ('analytics_lock_until', to_jsonb('1970-01-01T00:00:00Z'::text))
on conflict (setting_key) do nothing;
