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
-- =============================================================

-- ⚠ CONCURRENTLY, so the build takes no write lock on a live table. It cannot
-- run inside a transaction block — if this is applied through a tool that wraps
-- statements in BEGIN/COMMIT, drop the keyword and accept the brief lock; at
-- 5,040 rows the build is milliseconds.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pool_entries_user
  ON public.pool_entries (user_id);

COMMENT ON INDEX public.idx_pool_entries_user IS
  'Lifetime scouting: every entry belonging to one user, across all pools. '
  'Deliberately NOT partial on retired_at — the lifetime dossier counts retired '
  'entries, because their revealed picks are still things that member did.';
