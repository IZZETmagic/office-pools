-- =============================================================
-- SHADOW SCORING — MATCH SCORING (group + knockout) + audit + brackets
-- Drafted 2026-07-02.  Patch 2: knockout stages.
--
-- Written ONLY by the set-based shadow RPCs (SECURITY DEFINER); never read
-- by any user-facing path. Compared against live public.match_scores and
-- pool_entries.match_points via the diff harness. Column types mirror
-- match_scores so value diffs reflect LOGIC, not type/rounding artifacts.
-- Bonus scoring (bonus_scores mirror + rank parity) is a later phase.
-- =============================================================

CREATE TABLE IF NOT EXISTS shadow_match_scores (
  entry_id      uuid         NOT NULL REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  match_id      uuid         NOT NULL REFERENCES matches(match_id)      ON DELETE CASCADE,
  pool_id       uuid         NOT NULL REFERENCES pools(pool_id)         ON DELETE CASCADE,
  score_type    text         NOT NULL CHECK (score_type IN ('exact','winner_gd','winner','miss')),
  base_points   integer      NOT NULL,
  multiplier    numeric(4,2) NOT NULL,
  pso_points    integer      NOT NULL DEFAULT 0,
  total_points  integer      NOT NULL,
  teams_match   boolean      NOT NULL,
  calculated_at timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, match_id)
);
CREATE INDEX IF NOT EXISTS idx_shadow_match_scores_match ON shadow_match_scores(match_id);
CREATE INDEX IF NOT EXISTS idx_shadow_match_scores_pool  ON shadow_match_scores(pool_id);
ALTER TABLE shadow_match_scores ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS shadow_entry_totals (
  entry_id            uuid        PRIMARY KEY REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  pool_id             uuid        NOT NULL REFERENCES pools(pool_id) ON DELETE CASCADE,
  match_points        integer     NOT NULL DEFAULT 0,
  current_match_rank  integer,
  previous_match_rank integer,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shadow_entry_totals_pool ON shadow_entry_totals(pool_id);
ALTER TABLE shadow_entry_totals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS shadow_score_diffs (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id     uuid        NOT NULL,
  entry_id     uuid,
  diff_kind    text        NOT NULL CHECK (diff_kind IN ('value_mismatch','only_in_live','only_in_shadow')),
  live_type    text,
  shadow_type  text,
  live_total   integer,
  shadow_total integer,
  note         text,
  detected_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shadow_score_diffs_match ON shadow_score_diffs(match_id);
ALTER TABLE shadow_score_diffs ENABLE ROW LEVEL SECURITY;

-- Materialized per-entry predicted bracket (output of TS resolveFullBracket).
-- Populated by lib/scoring/shadowBrackets.ts (batch route + recalc piggyback).
CREATE TABLE IF NOT EXISTS shadow_resolved_brackets (
  entry_id               uuid NOT NULL REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  match_id               uuid NOT NULL REFERENCES matches(match_id)      ON DELETE CASCADE,
  pool_id                uuid NOT NULL REFERENCES pools(pool_id)         ON DELETE CASCADE,
  predicted_home_team_id uuid REFERENCES teams(team_id),
  predicted_away_team_id uuid REFERENCES teams(team_id),
  resolved_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, match_id)
);
CREATE INDEX IF NOT EXISTS idx_shadow_resolved_brackets_match ON shadow_resolved_brackets(match_id);
ALTER TABLE shadow_resolved_brackets ENABLE ROW LEVEL SECURITY;


-- =============================================================
-- RPC: shadow_score_match(p_match_id, p_final) — GROUP + KNOCKOUT
-- Set-based, mirroring lib/scoring/core.ts scoreMatch()/computeMatchScore(),
-- points.ts calculatePsoBonus()/getStageMultiplier(), and the submitted-entry
-- gate from recalculate.ts. Knockout teams_match comes from a LEFT JOIN on
-- shadow_resolved_brackets (materialized TS resolveFullBracket output).
--
-- STEP 0 unscores ineligible entries; STEP 1 writes line items (change-only
-- via ON CONFLICT ... IS DISTINCT); STEP 2 rolls up match_points + re-ranks
-- submitted entries. Settings COALESCE to DEFAULT_POOL_SETTINGS; multiplier
-- mirrors getStageMultiplier's `(setting ?? DEFAULT) || 1` (0/null -> 1).
-- =============================================================
CREATE OR REPLACE FUNCTION public.shadow_score_match(p_match_id uuid, p_final boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stage text;
BEGIN
  SELECT stage INTO v_stage FROM matches WHERE match_id = p_match_id;
  IF v_stage IS NULL THEN
    RAISE EXCEPTION 'shadow_score_match: match % not found', p_match_id;
  END IF;

  -- ---- STEP 0: UNSCORE ineligible entries for this match ----
  -- (unsubmitted, prediction deleted, pool turned bracket, match reverted).
  -- teams_match does NOT affect eligibility — a wrong-teams knockout entry is
  -- still scored (as a 0 miss), so it keeps its row.
  DELETE FROM shadow_match_scores sms
  WHERE sms.match_id = p_match_id
    AND NOT EXISTS (
      SELECT 1
      FROM predictions pr
      JOIN pool_entries pe ON pe.entry_id  = pr.entry_id
      JOIN pool_members pm ON pm.member_id = pe.member_id
      JOIN pools        po ON po.pool_id   = pm.pool_id
      JOIN matches      m  ON m.match_id   = pr.match_id
      WHERE pr.match_id = p_match_id
        AND pr.entry_id = sms.entry_id
        AND po.prediction_mode <> 'bracket_picker'
        AND pr.predicted_home_score IS NOT NULL
        AND pr.predicted_away_score IS NOT NULL
        AND m.home_score_ft IS NOT NULL
        AND m.away_score_ft IS NOT NULL
        AND (m.is_completed OR (NOT p_final AND m.status = 'live'))
        AND ( pe.has_submitted_predictions
           OR ( po.prediction_mode = 'progressive'
                AND EXISTS (SELECT 1 FROM entry_round_submissions ers
                            WHERE ers.entry_id = pe.entry_id AND ers.has_submitted) ) )
    );

  -- ---- STEP 1: line items into shadow_match_scores ----
  WITH src AS (
    SELECT
      pr.entry_id, m.match_id, pm.pool_id, m.stage, po.prediction_mode,
      pr.predicted_home_score AS ph, pr.predicted_away_score AS pa,
      m.home_score_ft AS ah, m.away_score_ft AS aa,
      pr.predicted_home_pso AS pph, pr.predicted_away_pso AS ppa,
      m.home_score_pso AS aph, m.away_score_pso AS apa,
      m.home_team_id AS ath, m.away_team_id AS ata,
      rb.predicted_home_team_id AS pth, rb.predicted_away_team_id AS pta,
      -- base points: group_* vs knockout_*, COALESCE to DEFAULT_POOL_SETTINGS
      CASE WHEN m.stage = 'group' THEN COALESCE(ps.group_exact_score, 5)
           ELSE COALESCE(ps.knockout_exact_score, 5) END AS base_exact,
      CASE WHEN m.stage = 'group' THEN COALESCE(ps.group_correct_difference, 3)
           ELSE COALESCE(ps.knockout_correct_difference, 3) END AS base_gd,
      CASE WHEN m.stage = 'group' THEN COALESCE(ps.group_correct_result, 1)
           ELSE COALESCE(ps.knockout_correct_result, 1) END AS base_win,
      -- stage multiplier = (setting ?? DEFAULT) || 1  (0/null -> 1)
      CASE m.stage
        WHEN 'group'         THEN 1::numeric(4,2)
        WHEN 'round_32'      THEN COALESCE(NULLIF(COALESCE(ps.round_32_multiplier, 1), 0), 1)
        WHEN 'round_16'      THEN COALESCE(NULLIF(COALESCE(ps.round_16_multiplier, 2), 0), 1)
        WHEN 'quarter_final' THEN COALESCE(NULLIF(COALESCE(ps.quarter_final_multiplier, 3), 0), 1)
        WHEN 'semi_final'    THEN COALESCE(NULLIF(COALESCE(ps.semi_final_multiplier, 1), 0), 1)
        WHEN 'third_place'   THEN COALESCE(NULLIF(COALESCE(ps.third_place_multiplier, 1), 0), 1)
        WHEN 'final'         THEN COALESCE(NULLIF(COALESCE(ps.final_multiplier, 1), 0), 1)
        ELSE 1::numeric(4,2)
      END AS mult,
      COALESCE(ps.pso_enabled, false)      AS pso_enabled,
      COALESCE(ps.pso_exact_score, 0)      AS pso_exact,
      COALESCE(ps.pso_correct_difference, 0) AS pso_gd,
      COALESCE(ps.pso_correct_result, 0)   AS pso_win
    FROM predictions pr
    JOIN matches      m  ON m.match_id   = pr.match_id
    JOIN pool_entries pe ON pe.entry_id  = pr.entry_id
    JOIN pool_members pm ON pm.member_id = pe.member_id
    JOIN pools        po ON po.pool_id   = pm.pool_id
    LEFT JOIN pool_settings ps ON ps.pool_id = po.pool_id
    LEFT JOIN shadow_resolved_brackets rb ON rb.entry_id = pr.entry_id AND rb.match_id = pr.match_id
    WHERE pr.match_id = p_match_id
      AND po.prediction_mode <> 'bracket_picker'
      AND pr.predicted_home_score IS NOT NULL
      AND pr.predicted_away_score IS NOT NULL
      AND m.home_score_ft IS NOT NULL
      AND m.away_score_ft IS NOT NULL
      AND (m.is_completed OR (NOT p_final AND m.status = 'live'))
      AND ( pe.has_submitted_predictions
         OR ( po.prediction_mode = 'progressive'
              AND EXISTS (SELECT 1 FROM entry_round_submissions ers
                          WHERE ers.entry_id = pe.entry_id AND ers.has_submitted) ) )
  ),
  teamed AS (
    SELECT src.*,
      -- checkKnockoutTeamsMatch(): group always true; unset actual teams -> true;
      -- unresolved predicted teams -> false; else predicted pair must be the actual pair.
      CASE
        WHEN stage = 'group' THEN true
        WHEN prediction_mode = 'progressive' THEN true   -- progressive: predicts the ACTUAL matchup, so teams_match always passes (progressive.ts)
        WHEN ath IS NULL OR ata IS NULL THEN true
        WHEN pth IS NULL OR pta IS NULL THEN false
        WHEN pth IN (ath, ata) AND pta IN (ath, ata) THEN true
        ELSE false
      END AS teams_match
    FROM src
  ),
  scored AS (
    SELECT teamed.*,
      CASE
        WHEN stage <> 'group' AND NOT teams_match THEN 'miss'   -- wrong knockout teams -> 0
        WHEN ph = ah AND pa = aa THEN 'exact'
        WHEN NOT ( ((ph > pa) = (ah > aa)) AND ((ph < pa) = (ah < aa)) ) THEN 'miss'
        WHEN (ph - pa) = (ah - aa) THEN 'winner_gd'
        ELSE 'winner'
      END AS score_type,
      -- calculatePsoBonus(): gated on pso_enabled + PSO present + predicted PSO present
      CASE
        WHEN pso_enabled AND aph IS NOT NULL AND apa IS NOT NULL AND pph IS NOT NULL AND ppa IS NOT NULL THEN
          CASE
            WHEN pph = aph AND ppa = apa THEN pso_exact
            WHEN NOT ( ((pph > ppa) = (aph > apa)) AND ((pph < ppa) = (aph < apa)) ) THEN 0
            WHEN (pph - ppa) = (aph - apa) THEN pso_gd
            ELSE pso_win
          END
        ELSE 0
      END AS raw_pso
    FROM teamed
  ),
  calc AS (
    SELECT entry_id, match_id, pool_id, score_type, teams_match, mult, stage,
      CASE score_type
        WHEN 'exact'     THEN base_exact
        WHEN 'winner_gd' THEN base_gd
        WHEN 'winner'    THEN base_win
        ELSE 0
      END AS base_points,
      -- PSO is zeroed when knockout teams mismatch (core.ts returns 0 there);
      -- otherwise it applies even on an FT miss.
      CASE WHEN stage <> 'group' AND NOT teams_match THEN 0 ELSE raw_pso END AS pso_points
    FROM scored
  )
  INSERT INTO shadow_match_scores
    (entry_id, match_id, pool_id, score_type, base_points, multiplier, pso_points, total_points, teams_match, calculated_at)
  SELECT
    entry_id, match_id, pool_id, score_type, base_points, mult, pso_points,
    floor(base_points * mult)::int + pso_points,   -- Math.floor(base*mult) + pso
    teams_match,
    now()
  FROM calc
  ON CONFLICT (entry_id, match_id) DO UPDATE SET
    score_type    = EXCLUDED.score_type,
    base_points   = EXCLUDED.base_points,
    multiplier    = EXCLUDED.multiplier,
    pso_points    = EXCLUDED.pso_points,
    total_points  = EXCLUDED.total_points,
    teams_match   = EXCLUDED.teams_match,
    calculated_at = EXCLUDED.calculated_at
  WHERE shadow_match_scores.score_type   IS DISTINCT FROM EXCLUDED.score_type
     OR shadow_match_scores.base_points  IS DISTINCT FROM EXCLUDED.base_points
     OR shadow_match_scores.multiplier   IS DISTINCT FROM EXCLUDED.multiplier
     OR shadow_match_scores.pso_points   IS DISTINCT FROM EXCLUDED.pso_points
     OR shadow_match_scores.total_points IS DISTINCT FROM EXCLUDED.total_points
     OR shadow_match_scores.teams_match  IS DISTINCT FROM EXCLUDED.teams_match;

  -- ---- STEP 2: roll up match_points + re-rank affected pools (submitted only) ----
  WITH affected AS (
    SELECT DISTINCT pm.pool_id
    FROM predictions pr
    JOIN pool_entries pe ON pe.entry_id  = pr.entry_id
    JOIN pool_members pm ON pm.member_id = pe.member_id
    JOIN pools        po ON po.pool_id   = pm.pool_id
    WHERE pr.match_id = p_match_id AND po.prediction_mode <> 'bracket_picker'
  ),
  entries_in AS (
    SELECT pe.entry_id, pm.pool_id, pe.created_at
    FROM pool_members pm
    JOIN pool_entries pe ON pe.member_id = pm.member_id
    JOIN pools        po ON po.pool_id   = pm.pool_id
    WHERE pm.pool_id IN (SELECT pool_id FROM affected)
      AND ( pe.has_submitted_predictions
         OR ( po.prediction_mode = 'progressive'
              AND EXISTS (SELECT 1 FROM entry_round_submissions ers
                          WHERE ers.entry_id = pe.entry_id AND ers.has_submitted) ) )
  ),
  agg AS (
    SELECT ei.entry_id, ei.pool_id, ei.created_at,
      COALESCE(SUM(sms.total_points), 0)               AS match_points,
      COUNT(*) FILTER (WHERE sms.score_type = 'exact') AS exact_ct,
      COUNT(*) FILTER (WHERE sms.score_type <> 'miss') AS nonmiss_ct
    FROM entries_in ei
    LEFT JOIN shadow_match_scores sms ON sms.entry_id = ei.entry_id
    GROUP BY ei.entry_id, ei.pool_id, ei.created_at
  ),
  ranked AS (
    SELECT entry_id, pool_id, match_points,
      ROW_NUMBER() OVER (PARTITION BY pool_id ORDER BY match_points DESC, exact_ct DESC, nonmiss_ct DESC, created_at ASC) AS rnk
    FROM agg
  )
  INSERT INTO shadow_entry_totals (entry_id, pool_id, match_points, current_match_rank, previous_match_rank, updated_at)
  SELECT entry_id, pool_id, match_points, rnk, NULL, now()
  FROM ranked
  ON CONFLICT (entry_id) DO UPDATE SET
    pool_id            = EXCLUDED.pool_id,
    match_points       = EXCLUDED.match_points,
    current_match_rank = EXCLUDED.current_match_rank,
    updated_at         = now()
  WHERE shadow_entry_totals.match_points       IS DISTINCT FROM EXCLUDED.match_points
     OR shadow_entry_totals.current_match_rank IS DISTINCT FROM EXCLUDED.current_match_rank;
END;
$$;
