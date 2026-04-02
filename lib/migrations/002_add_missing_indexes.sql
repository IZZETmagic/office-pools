-- Migration: Add missing indexes for frequently queried columns
-- Run this in the Supabase SQL editor.

-- pool_entries: member_id is used in WHERE clauses across auto-submit, leaderboard, pool detail
CREATE INDEX IF NOT EXISTS idx_pool_entries_member_id ON pool_entries(member_id);

-- pool_entries: pool_id filtering (used indirectly through member lookups)
-- Note: Only add if pool_entries has a pool_id column; otherwise this join goes through pool_members
-- CREATE INDEX IF NOT EXISTS idx_pool_entries_pool_id ON pool_entries(pool_id);

-- predictions: entry_id is the primary lookup key for all prediction queries
CREATE INDEX IF NOT EXISTS idx_predictions_entry_id ON predictions(entry_id);

-- bonus_scores: entry_id is filtered in leaderboard, pool detail, account deletion
CREATE INDEX IF NOT EXISTS idx_bonus_scores_entry_id ON bonus_scores(entry_id);

-- bracket_picker tables: entry_id is the primary lookup for bracket picker mode
CREATE INDEX IF NOT EXISTS idx_bp_group_rankings_entry_id ON bracket_picker_group_rankings(entry_id);
CREATE INDEX IF NOT EXISTS idx_bp_third_place_rankings_entry_id ON bracket_picker_third_place_rankings(entry_id);
CREATE INDEX IF NOT EXISTS idx_bp_knockout_picks_entry_id ON bracket_picker_knockout_picks(entry_id);

-- INVESTIGATION NOTES (no action needed):
-- player_scores: Used by iOS app (PoolService.swift reads, PlayerScore.swift models it). NOT dead.
-- group_predictions: Written by bonus/calculate route, deleted on cleanup. Active intermediate table.
-- special_predictions: Same as group_predictions. Active intermediate table.
-- v2_* columns on pool_entries: Intentional Phase 1 shadow columns. Remove after scoring v2 migration completes.
