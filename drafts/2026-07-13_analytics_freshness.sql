-- =============================================================
-- Analytics (FORM layer) freshness — durable dirty-queue + compute-version
-- DRAFT — apply deliberately (Supabase migration: analytics_freshness).
--
-- FORM-layer only (entry_xp_state analytics columns). Touches NO scoring path,
-- NO leaderboard points/rank. Reversible. Mirrors the shadow_dirty_pools pattern
-- (feat(shadow) 6d34655) so both engines share one mental model.
--
-- Fixes the two staleness causes that froze columns on 2026-07-12:
--   #A  analytics_dirty_pools — a bulk/settings/admin/completion recalc changes
--       form-relevant scores; the sweep drains this queue (self-healing, can't
--       lose work like the old last_rank_update watermark did).
--   #B  entry_xp_state.analytics_version — when the form COMPUTE changes on a
--       deploy (e.g. the 2026-07-13 completed-only change), settled pools get no
--       recalc so nothing marks them dirty. The sweep re-materializes any pool
--       whose stored version < ANALYTICS_COMPUTE_VERSION, then stops.
--
-- The DB objects below are inert until the consuming code deploys:
--   - the dirty-mark in lib/scoring/recalculate.ts (writes analytics_dirty_pools)
--   - the sweep rework in app/api/cron/analytics-sweep/route.ts (drains it +
--     version-mismatch) and the version stamp in lib/analytics/entryAnalytics.ts.
-- Until then the table stays empty and the column stays NULL; the currently
-- deployed sweep ignores both. Forward-safe.
--
-- Rollback:
--   DROP TABLE public.analytics_dirty_pools;
--   DROP INDEX IF EXISTS idx_entry_xp_state_analytics_version;
--   ALTER TABLE public.entry_xp_state DROP COLUMN analytics_version;
-- =============================================================

-- #A — dirty-pool queue (drained + cleared by the analytics-sweep cron).
CREATE TABLE IF NOT EXISTS public.analytics_dirty_pools (
  pool_id   uuid PRIMARY KEY,
  marked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.analytics_dirty_pools ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.analytics_dirty_pools IS
  'FORM layer: pools flagged for entry_xp_state re-materialize after a completion/bulk/admin recalc (recalculatePool with awardBadges != false). Drained + cleared by the analytics-sweep cron. Analytics-only; RLS on, no policies (service_role/definer only). Sibling of shadow_dirty_pools.';

-- #B — compute-version stamp. NULL on existing rows → treated as stale → the
-- sweep re-materializes them once (diff is a cheap no-op unless a match is live),
-- stamping the current version so they are not reprocessed.
ALTER TABLE public.entry_xp_state
  ADD COLUMN IF NOT EXISTS analytics_version integer;
COMMENT ON COLUMN public.entry_xp_state.analytics_version IS
  'FORM layer: the ANALYTICS_COMPUTE_VERSION (lib/analytics/entryAnalytics.ts) that produced these analytics columns. Bumped in the same commit that changes the form compute; the sweep re-materializes any pool with a stale/NULL value. NULL = pre-versioning.';

-- Selective index: once converged, `analytics_version IS DISTINCT FROM <current>`
-- matches ~0 rows so the sweep's stale-version scan is cheap.
CREATE INDEX IF NOT EXISTS idx_entry_xp_state_analytics_version
  ON public.entry_xp_state (analytics_version);
