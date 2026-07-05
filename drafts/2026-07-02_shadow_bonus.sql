-- =============================================================
-- SHADOW BONUS ENGINE — materialization inputs + output
-- Drafted 2026-07-02.
--
-- PARITY RULE (confirmed): mirror LIVE exactly. Live ignores
-- special_predictions entirely; podium is BRACKET-DERIVED from match
-- predictions; best_player/top_scorer are NOT scored. So none of these
-- tables touch special_predictions, and there is no best_player/top_scorer.
--
-- All predicted inputs are materialized from the tested TS resolveFullBracket
-- (Option A) — the shadow_calculate_bonuses RPC only does set-based joins.
-- Written ONLY by shadow tooling; never reads/writes live tables.
-- =============================================================

-- Predicted final group standings per entry (positions 1..4)
CREATE TABLE IF NOT EXISTS shadow_resolved_standings (
  entry_id     uuid     NOT NULL REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  group_letter char(1)  NOT NULL,
  position     smallint NOT NULL,          -- 1..4
  team_id      uuid     NOT NULL REFERENCES teams(team_id),
  PRIMARY KEY (entry_id, group_letter, position)
);
CREATE INDEX IF NOT EXISTS idx_shadow_resolved_standings_entry ON shadow_resolved_standings(entry_id);
ALTER TABLE shadow_resolved_standings ENABLE ROW LEVEL SECURITY;

-- Predicted qualified-32 set per entry
CREATE TABLE IF NOT EXISTS shadow_resolved_qualified (
  entry_id uuid NOT NULL REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  team_id  uuid NOT NULL REFERENCES teams(team_id),
  PRIMARY KEY (entry_id, team_id)
);
ALTER TABLE shadow_resolved_qualified ENABLE ROW LEVEL SECURITY;

-- Predicted podium per entry — BRACKET-DERIVED (mirrors calculateTournamentPodiumBonuses)
CREATE TABLE IF NOT EXISTS shadow_resolved_podium (
  entry_id            uuid PRIMARY KEY REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  champion_team_id    uuid REFERENCES teams(team_id),
  runner_up_team_id   uuid REFERENCES teams(team_id),
  third_place_team_id uuid REFERENCES teams(team_id)
);
ALTER TABLE shadow_resolved_podium ENABLE ROW LEVEL SECURITY;

-- ACTUAL final group standings (once per tournament; shared join reference)
CREATE TABLE IF NOT EXISTS shadow_actual_standings (
  tournament_id uuid     NOT NULL,
  group_letter  char(1)  NOT NULL,
  position      smallint NOT NULL,
  team_id       uuid     NOT NULL REFERENCES teams(team_id),
  PRIMARY KEY (tournament_id, group_letter, position)
);
ALTER TABLE shadow_actual_standings ENABLE ROW LEVEL SECURITY;

-- ACTUAL qualified-32 set (once per tournament)
CREATE TABLE IF NOT EXISTS shadow_actual_qualified (
  tournament_id uuid NOT NULL,
  team_id       uuid NOT NULL REFERENCES teams(team_id),
  PRIMARY KEY (tournament_id, team_id)
);
ALTER TABLE shadow_actual_qualified ENABLE ROW LEVEL SECURITY;

-- Extend the predicted knockout bracket with the predicted WINNER per slot
-- (mode-aware in the materializer: full = predicted teams, progressive = actual teams).
ALTER TABLE shadow_resolved_brackets
  ADD COLUMN IF NOT EXISTS predicted_winner_team_id uuid REFERENCES teams(team_id);

-- Bonus OUTPUT (mirrors public.bonus_scores; natural key = ON CONFLICT target)
CREATE TABLE IF NOT EXISTS shadow_bonus_scores (
  entry_id             uuid NOT NULL REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  pool_id              uuid NOT NULL REFERENCES pools(pool_id)         ON DELETE CASCADE,
  bonus_type           text NOT NULL,
  bonus_category       text,
  related_group_letter text,
  related_match_id     uuid REFERENCES matches(match_id) ON DELETE CASCADE,
  points_earned        integer NOT NULL,
  description          text,
  calculated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shadow_bonus_scores_natural_key
  ON shadow_bonus_scores (entry_id, bonus_type, related_group_letter, related_match_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_shadow_bonus_scores_entry ON shadow_bonus_scores(entry_id);
CREATE INDEX IF NOT EXISTS idx_shadow_bonus_scores_pool  ON shadow_bonus_scores(pool_id);
ALTER TABLE shadow_bonus_scores ENABLE ROW LEVEL SECURITY;


-- =============================================================
-- RPC: shadow_calculate_bonuses(p_pool_id) — unified 5-category bonus engine
-- Applied via migration `shadow_calculate_bonuses`. Consolidates the fragmented
-- lib/bonusCalculation.ts (group standings, qualification, R32 pairing, match
-- winner, podium) into ONE set-based INSERT...SELECT UNION ALL over the
-- materialized inputs. Mirrors live exactly (no special_predictions, no
-- best_player/top_scorer). Full-refresh per scope (DELETE targets + INSERT).
-- Gates match live: group_standings needs the group's 6 matches complete;
-- qualification needs all group matches complete; podium needs tournament_awards.
-- KNOWN PARITY-EDGE: arm C reads predicted_home/away (match-engine WITH-conduct)
-- whereas bonusCalculation uses the WITHOUT-conduct bracket — identical unless a
-- group had an exact fair-play tie (near-impossible); the audit will catch it.
-- (Full function body is applied in the DB; see migration shadow_calculate_bonuses.)
-- =============================================================
