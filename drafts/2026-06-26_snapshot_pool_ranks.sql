-- Applied to prod (ujthamlehjyubbzxbnes) on 2026-06-26.
-- Backs the leaderboard movement (▲/▼) indicator: snapshots
-- current_rank -> previous_rank for every entry in the given pools in a single
-- statement. Replaces a per-row JS loop that hit PostgREST's 1000-row cap when
-- snapshotting tournament-wide (~4,800 entries), which left most pools with a
-- stale baseline. Called by lib/scoring/snapshotRanks.ts from both the manual
-- "set match live" route and the automated sync-fixtures cron.
create or replace function snapshot_pool_ranks(p_pool_ids uuid[])
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update pool_entries pe
  set previous_rank = pe.current_rank
  where pe.member_id in (
    select pm.member_id
    from pool_members pm
    where pm.pool_id = any(p_pool_ids)
  );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
