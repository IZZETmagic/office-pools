-- Migration: Track per-match "result push fan-out done" so the dispatcher
-- can detect newly-completed matches that still need to fire prediction-result
-- pushes, MVP pushes, and streak-milestone pushes.
--
-- The cursor is GLOBAL per match (not per-pool, not per-user) because the
-- scoring `recalculatePool` function runs once per pool — without this cursor,
-- a single match completion would re-fire pushes for every pool that uses it.
--
-- Partial index makes the "find pending matches" query O(N pending), not
-- O(all completed matches).
--
-- Applied via Supabase MCP on 2026-05-16.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS result_pushes_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_matches_result_pushes_pending
  ON matches (is_completed)
  WHERE is_completed = true AND result_pushes_sent_at IS NULL;
