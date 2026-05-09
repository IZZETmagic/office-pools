-- Migration: API-Football live sync
-- Adds external mapping, per-match data-source lock, sync observability,
-- and runtime kill switch for the live ingest from api-football.com.
-- Safe to run multiple times.

-- ============================================================
-- 1. matches: external mapping + sync state + per-match lock
-- ============================================================
ALTER TABLE matches ADD COLUMN IF NOT EXISTS external_match_id TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'api';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_minute INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_period TEXT;

DO $$ BEGIN
  ALTER TABLE matches
    ADD CONSTRAINT matches_data_source_check
    CHECK (data_source IN ('api', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. teams: external mapping
-- ============================================================
ALTER TABLE teams ADD COLUMN IF NOT EXISTS external_team_id INTEGER;

-- ============================================================
-- 3. match_conduct: sync state
-- ============================================================
ALTER TABLE match_conduct ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- ============================================================
-- 4. sync_runs: observability
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  fixtures_seen INTEGER NOT NULL DEFAULT 0,
  fixtures_changed INTEGER NOT NULL DEFAULT 0,
  fixtures_skipped_manual INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  quota_remaining INTEGER,
  notes TEXT
);

-- ============================================================
-- 5. sync_settings: runtime kill switch (key/value)
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(user_id)
);

INSERT INTO sync_settings (setting_key, setting_value)
VALUES ('sync_enabled', 'true'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================
-- 6. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_matches_external_match_id ON matches(external_match_id);
CREATE INDEX IF NOT EXISTS idx_matches_data_source ON matches(data_source);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_external_team_id
  ON teams(external_team_id) WHERE external_team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON sync_runs(started_at DESC);

-- ============================================================
-- 7. RLS — super admins only
-- ============================================================
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_runs_super_admin_all ON sync_runs;
CREATE POLICY sync_runs_super_admin_all ON sync_runs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND is_super_admin = TRUE
    )
  );

DROP POLICY IF EXISTS sync_settings_super_admin_all ON sync_settings;
CREATE POLICY sync_settings_super_admin_all ON sync_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND is_super_admin = TRUE
    )
  );

-- ============================================================
-- Down-migration (rollback)
-- ============================================================
-- DROP POLICY IF EXISTS sync_settings_super_admin_all ON sync_settings;
-- DROP POLICY IF EXISTS sync_runs_super_admin_all ON sync_runs;
-- DROP TABLE IF EXISTS sync_settings;
-- DROP TABLE IF EXISTS sync_runs;
-- DROP INDEX IF EXISTS idx_sync_runs_started_at;
-- DROP INDEX IF EXISTS idx_teams_external_team_id;
-- DROP INDEX IF EXISTS idx_matches_data_source;
-- DROP INDEX IF EXISTS idx_matches_external_match_id;
-- ALTER TABLE match_conduct DROP COLUMN IF EXISTS last_synced_at;
-- ALTER TABLE teams DROP COLUMN IF EXISTS external_team_id;
-- ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_data_source_check;
-- ALTER TABLE matches DROP COLUMN IF EXISTS live_period;
-- ALTER TABLE matches DROP COLUMN IF EXISTS live_minute;
-- ALTER TABLE matches DROP COLUMN IF EXISTS last_synced_at;
-- ALTER TABLE matches DROP COLUMN IF EXISTS data_source;
-- ALTER TABLE matches DROP COLUMN IF EXISTS external_match_id;
