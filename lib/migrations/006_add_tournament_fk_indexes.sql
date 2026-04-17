-- Migration: Add FK indexes on tournament_id columns used in leaderboard / admin queries
-- Run this in the Supabase SQL editor.
--
-- Fills gaps left by 002_add_missing_indexes.sql. The leaderboard endpoint
-- filters matches and teams by tournament_id on every request; without indexes
-- these become sequential scans as the matches/teams tables grow.

CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_teams_tournament_id ON teams(tournament_id);
CREATE INDEX IF NOT EXISTS idx_pools_tournament_id ON pools(tournament_id);

-- Down-migration (save for rollback):
-- DROP INDEX IF EXISTS idx_matches_tournament_id;
-- DROP INDEX IF EXISTS idx_teams_tournament_id;
-- DROP INDEX IF EXISTS idx_pools_tournament_id;
