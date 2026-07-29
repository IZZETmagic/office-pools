-- ROLLBACK for the leaderboard Broadcast-from-database (Step 5, 2026-07-29).
--
-- FASTEST STOP (no DDL, instant, reversible):
--   UPDATE sync_settings SET setting_value = to_jsonb(false)
--    WHERE setting_key = 'leaderboard_broadcast_enabled';
-- Verified: with the switch off, a write to shadow_entry_totals emits zero
-- messages. The web client keeps working — it falls back to the poll.
--
-- FULL REMOVAL (drops the triggers and the function):

DROP TRIGGER IF EXISTS broadcast_pool_leaderboard_ins ON public.shadow_entry_totals;
DROP TRIGGER IF EXISTS broadcast_pool_leaderboard_upd ON public.shadow_entry_totals;
DROP FUNCTION IF EXISTS public.broadcast_pool_leaderboard();

-- The client half (PoolDetail.tsx) is a code change, so reverting it is a git
-- operation, not SQL. Note the web client no longer subscribes to
-- `postgres_changes` on pool_entries — if you roll the DB back but keep the new
-- client, the leaderboard still updates, just on the fallback poll rather than
-- instantly.
--
-- ⚠ DO NOT remove pool_entries from the `supabase_realtime` publication as part
-- of this cleanup. mobile/lib/usePoolEntries.ts still uses that CDC stream; the
-- per-row cost is only gone for WEB until mobile is migrated to the broadcast
-- too (needs its own OTA).
