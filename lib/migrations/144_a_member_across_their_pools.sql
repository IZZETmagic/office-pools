-- =============================================================
-- 144 — a member across their pools
-- =============================================================
-- The lifetime dossier asks a question nothing has ever asked before: "every
-- entry belonging to this user". `readLifetimePicks` runs it once per dossier
-- open, and it is the first read keyed on `pool_entries.user_id` alone.
--
-- ## ⚠⚠ THE ONLY EXISTING INDEX ON THAT COLUMN IS THE WRONG WAY ROUND
--
--     pool_entries_retired_lookup_idx ON (pool_id, user_id) WHERE retired_at IS NOT NULL
--
-- Partial, on RETIRED entries, and led by `pool_id`. A lifetime read wants live
-- entries across every pool, so it can use none of it and falls to a sequential
-- scan.
--
-- ⚠ THIS IS CHEAP TODAY AND WILL NOT STAY CHEAP. `pool_entries` holds 5,040 rows
-- — a seq scan nobody would notice — but it is the table that grows fastest in
-- the schema: one row per entry per pool, forever, and the World Cup alone put
-- thousands in. The read is also per dossier open, which is a tap, not a cron.
--
-- ⚠ NOT PARTIAL ON `retired_at`. The lifetime read deliberately INCLUDES retired
-- entries — a retired entry's revealed picks are still things that member did,
-- and a history that silently dropped a pool they left would be a lie by
-- omission. A partial index would push exactly those rows back to a seq scan.
--
-- ⚠⚠ APPLY THIS BEFORE THE CODE THAT NEEDS IT DEPLOYS. An index is the benign
-- case — the query is correct without it, merely slower — but the habit is what
-- matters: 136, 139, 140, 141 and 142 all carry this warning because PostgREST
-- rejects an entire payload for naming a relation that does not exist yet.
--
-- ## ✅ APPLIED TO PRODUCTION 2026-09-12, and CONCURRENTLY had to go
--
-- The first attempt used `CREATE INDEX CONCURRENTLY` and was refused:
--
--     ERROR: 25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
--
-- The Supabase MCP's `apply_migration` wraps its statements in BEGIN/COMMIT, and
-- Postgres will not build an index concurrently in one. That is the fallback this
-- file already anticipated: at 5,040 rows the build is milliseconds and the brief
-- ACCESS EXCLUSIVE lock is not worth working around.
--
-- ⚠ IT WILL BE WORTH WORKING AROUND EVENTUALLY. On a table an order of magnitude
-- larger, take the concurrent build through a path that does not wrap in a
-- transaction (psql, or the SQL editor) rather than accepting the lock by habit.
--
-- Verified after: `Index Scan using idx_pool_entries_user`, 5 buffers.
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_pool_entries_user
  ON public.pool_entries (user_id);

COMMENT ON INDEX public.idx_pool_entries_user IS
  'Lifetime scouting: every entry belonging to one user, across all pools. '
  'Deliberately NOT partial on retired_at — the lifetime dossier counts retired '
  'entries, because their revealed picks are still things that member did.';
