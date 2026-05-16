-- Migration: Per-user-per-pool-per-window dedupe for pre-deadline push
-- warnings. Keyed by (user_id, pool_id, window_hours) so each user can get
-- one push per pool per window (24h, 6h, 1h). The dispatcher INSERTs ON
-- CONFLICT DO NOTHING and only sends the push when the insert succeeds —
-- atomic, no race conditions.
--
-- window_hours is constrained to {1, 6, 24} to catch typos.
--
-- Cleanup: rows aren't auto-pruned. They accumulate forever per pool. Cost
-- is tiny (a few rows per pool per active deadline) and we may want to keep
-- them for audit. Add a TTL or post-deadline cleanup later if needed.
--
-- Applied via Supabase MCP on 2026-05-16.

CREATE TABLE IF NOT EXISTS push_deadline_warnings_sent (
  user_id      uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  pool_id      uuid NOT NULL REFERENCES pools(pool_id) ON DELETE CASCADE,
  window_hours int  NOT NULL CHECK (window_hours IN (1, 6, 24)),
  sent_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pool_id, window_hours)
);

CREATE INDEX IF NOT EXISTS idx_push_deadline_warnings_pool ON push_deadline_warnings_sent(pool_id);
