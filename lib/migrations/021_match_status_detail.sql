-- Migration: match status detail + original kickoff time
-- Surfaces abnormal fixture states (postponed / suspended / cancelled / …) and
-- rescheduled kickoffs on the client, WITHOUT disturbing the coarse `status`
-- lifecycle that scoring + leaderboard queries depend on.
--
-- Design:
--   * status              — unchanged 4-value lifecycle (scheduled/live/completed/cancelled).
--   * status_detail       — the precise reason, owned entirely by the api-football live-sync
--                           mapper (null in the normal case). See lib/integrations/apiFootball/mappers.ts.
--   * original_match_date — set by the schedule reconcile pass when a not-yet-started kickoff
--                           moves; the client derives a "Delayed" badge from it. `status_detail`
--                           is deliberately NOT used for 'delayed', so the per-minute live sync
--                           and the daily reconcile never write the same column.
--
-- Additive + idempotent; the existing matches_status_check is untouched.
-- Applied via Supabase MCP on 2026-07-05.

ALTER TABLE matches ADD COLUMN IF NOT EXISTS status_detail TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS original_match_date TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE matches
    ADD CONSTRAINT matches_status_detail_check
    CHECK (status_detail IS NULL OR status_detail IN (
      'postponed', 'tbd', 'suspended', 'interrupted',
      'cancelled', 'abandoned', 'awarded', 'walkover'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Keep the read view in parity. New columns are appended at the END so
-- CREATE OR REPLACE is permitted (Postgres forbids re-ordering existing view columns).
CREATE OR REPLACE VIEW v_matches AS
 SELECT m.match_id,
    m.tournament_id,
    t.name AS tournament_name,
    m.match_number,
    m.stage,
    m.group_letter,
    m.match_date,
    m.venue,
    ht.country_name AS home_team,
    ht.country_code AS home_team_code,
    ht.flag_url AS home_team_flag,
    at.country_name AS away_team,
    at.country_code AS away_team_code,
    at.flag_url AS away_team_flag,
    m.home_score_ft,
    m.away_score_ft,
    m.home_score_pso,
    m.away_score_pso,
    wt.country_name AS winner,
    m.status,
    m.is_completed,
    m.home_team_placeholder,
    m.away_team_placeholder,
    m.status_detail,
    m.original_match_date
   FROM matches m
     JOIN tournaments t ON m.tournament_id = t.tournament_id
     LEFT JOIN teams ht ON m.home_team_id = ht.team_id
     LEFT JOIN teams at ON m.away_team_id = at.team_id
     LEFT JOIN teams wt ON m.winner_team_id = wt.team_id
  ORDER BY m.match_number;

-- ============================================================
-- Down-migration (rollback)
-- ============================================================
-- Recreate v_matches without the two trailing columns (prior definition), then:
-- ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_status_detail_check;
-- ALTER TABLE matches DROP COLUMN IF EXISTS original_match_date;
-- ALTER TABLE matches DROP COLUMN IF EXISTS status_detail;
