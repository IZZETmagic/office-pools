-- Migration 024: multi-competition config + league (Premier League) support
--
-- Today the live sync is wired to ONE competition via env vars
-- (API_FOOTBALL_TOURNAMENT_ID / _LEAGUE_ID / _SEASON in app/api/cron/sync-fixtures).
-- This migration moves that config ONTO the tournament row and teaches the
-- schema about a flat round-robin "league" format (e.g. the Premier League:
-- 20 teams, 38 matchweeks, no groups, no knockout), so a league season can be
-- imported from api-football and synced alongside the existing World Cup.
--
-- Nothing here is World-Cup-destructive: every change is additive, the CHECK
-- relaxations are supersets, and the WC row is backfilled to stay self-describing.
-- Idempotent; safe to re-run.

-- ============================================================
-- 1. tournaments: per-competition external ingest config
-- ============================================================
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS external_provider  TEXT    DEFAULT 'api_football';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS external_league_id INTEGER;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS external_season    INTEGER;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS format             TEXT    DEFAULT 'groups_knockout';

COMMENT ON COLUMN tournaments.external_provider  IS 'Fixtures/results provider. Only ''api_football'' today; column exists so the sync cron can dispatch per-tournament.';
COMMENT ON COLUMN tournaments.external_league_id IS 'api-football league id (1 = World Cup, 39 = Premier League). The sync cron reads this per-tournament instead of a global env var.';
COMMENT ON COLUMN tournaments.external_season    IS 'api-football season (its start-year convention; 2025 = the 2025/26 league season, 2026 = World Cup 2026).';
COMMENT ON COLUMN tournaments.format             IS 'Fixture/scoring shape: ''groups_knockout'' (WC/Euros/Copa) or ''league'' (round-robin). Drives which importer + scoring path a tournament uses.';

-- ============================================================
-- 2. tournament_type: allow league competitions
--    (was: world_cup | euros | copa_america)
-- ============================================================
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_tournament_type_check;
ALTER TABLE tournaments ADD  CONSTRAINT tournaments_tournament_type_check
  CHECK (tournament_type IN ('world_cup','euros','copa_america','premier_league','league'));

-- ============================================================
-- 3. matches: allow a league (regular-season) stage + carry the matchweek
--    (stage was: group | round_32 | round_16 | quarter_final
--                | semi_final | third_place | final)
-- ============================================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS round_number INTEGER;
COMMENT ON COLUMN matches.round_number IS 'League matchweek (1..38) parsed from api-football "Regular Season - N". NULL for cup stages (which use `stage`/`group_letter` instead).';

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_stage_check;
ALTER TABLE matches ADD  CONSTRAINT matches_stage_check
  CHECK (stage IN ('group','round_32','round_16','quarter_final','semi_final','third_place','final','regular_season'));

-- ============================================================
-- 4. Backfill the World Cup row so it is self-describing once the sync cron
--    reads config from the row (Q2 "cron loops over active tournaments").
--    WC in api-football is league 1; season is its year (2026). No-ops if
--    already set. Only touches the WC row.
-- ============================================================
UPDATE tournaments
   SET format             = COALESCE(format, 'groups_knockout'),
       external_provider  = COALESCE(external_provider, 'api_football'),
       external_league_id = COALESCE(external_league_id, 1),
       external_season    = COALESCE(external_season, year)
 WHERE tournament_type = 'world_cup';

-- ============================================================
-- Down-migration (rollback)
-- ============================================================
-- ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_stage_check;
-- ALTER TABLE matches ADD  CONSTRAINT matches_stage_check
--   CHECK (stage IN ('group','round_32','round_16','quarter_final','semi_final','third_place','final'));
-- ALTER TABLE matches DROP COLUMN IF EXISTS round_number;
-- ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_tournament_type_check;
-- ALTER TABLE tournaments ADD  CONSTRAINT tournaments_tournament_type_check
--   CHECK (tournament_type IN ('world_cup','euros','copa_america'));
-- ALTER TABLE tournaments DROP COLUMN IF EXISTS format;
-- ALTER TABLE tournaments DROP COLUMN IF EXISTS external_season;
-- ALTER TABLE tournaments DROP COLUMN IF EXISTS external_league_id;
-- ALTER TABLE tournaments DROP COLUMN IF EXISTS external_provider;
