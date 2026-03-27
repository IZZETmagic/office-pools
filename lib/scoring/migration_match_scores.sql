-- =============================================================
-- MIGRATION: Create match_scores table for scoring engine v2
-- =============================================================
-- This table stores pre-computed match-level scores.
-- Phase 1: Shadow-written alongside existing scoring system.
-- Phase 3: Becomes the source of truth for all match points.
-- =============================================================

-- match_scores: one row per entry × completed match
CREATE TABLE IF NOT EXISTS match_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
  pool_id UUID NOT NULL REFERENCES pools(pool_id) ON DELETE CASCADE,
  match_number INTEGER NOT NULL,
  stage TEXT NOT NULL,
  score_type TEXT NOT NULL CHECK (score_type IN ('exact', 'winner_gd', 'winner', 'miss')),
  base_points INTEGER NOT NULL DEFAULT 0,
  multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  pso_points INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  teams_match BOOLEAN NOT NULL DEFAULT TRUE,
  predicted_home_score INTEGER NOT NULL,
  predicted_away_score INTEGER NOT NULL,
  actual_home_score INTEGER NOT NULL,
  actual_away_score INTEGER NOT NULL,
  predicted_home_pso INTEGER,
  predicted_away_pso INTEGER,
  actual_home_pso INTEGER,
  actual_away_pso INTEGER,
  predicted_home_team_id UUID,
  predicted_away_team_id UUID,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each entry can only have one score per match
  UNIQUE(entry_id, match_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_match_scores_entry_id ON match_scores(entry_id);
CREATE INDEX IF NOT EXISTS idx_match_scores_match_id ON match_scores(match_id);
CREATE INDEX IF NOT EXISTS idx_match_scores_pool_id ON match_scores(pool_id);
CREATE INDEX IF NOT EXISTS idx_match_scores_pool_entry ON match_scores(pool_id, entry_id);

-- RLS: Enable row-level security
ALTER TABLE match_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Pool members can read their pool's match scores
CREATE POLICY "Pool members can read match scores"
  ON match_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pool_entries pe
      JOIN pool_members pm ON pe.member_id = pm.member_id
      WHERE pe.entry_id = match_scores.entry_id
        AND pm.pool_id = match_scores.pool_id
        AND pm.user_id = (
          SELECT user_id FROM users WHERE auth_user_id = auth.uid()
        )
    )
  );

-- RLS Policy: Service role can insert/update (used by recalculation orchestrator)
-- (Service role bypasses RLS by default, so no explicit policy needed)

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_match_scores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER match_scores_updated_at
  BEFORE UPDATE ON match_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_match_scores_updated_at();

-- =============================================================
-- Add v2 comparison columns to pool_entries (Phase 1 only)
-- These are used to shadow-compare new engine results vs existing.
-- They will be removed in Phase 4 when the old system is retired.
-- =============================================================

ALTER TABLE pool_entries
  ADD COLUMN IF NOT EXISTS v2_match_points INTEGER,
  ADD COLUMN IF NOT EXISTS v2_bonus_points INTEGER,
  ADD COLUMN IF NOT EXISTS v2_total_points INTEGER;

COMMENT ON COLUMN pool_entries.v2_match_points IS 'Scoring engine v2: shadow-computed match points for comparison';
COMMENT ON COLUMN pool_entries.v2_bonus_points IS 'Scoring engine v2: shadow-computed bonus points for comparison';
COMMENT ON COLUMN pool_entries.v2_total_points IS 'Scoring engine v2: shadow-computed total points for comparison';
