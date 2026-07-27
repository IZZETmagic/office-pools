-- ============================================================================
-- 027 — v_tournament_podium: the ACTUAL podium, derived, as a SQL-side owner
-- ============================================================================
-- WHY
-- ---
-- `lib/podium.ts` declares itself the SINGLE OWNER of "what is the tournament
-- podium" and forbids re-deriving it anywhere else. The 2026-07-19/20 incident
-- was three mutually-unaware copies disagreeing; one of them was a hand-copy in
-- the shadow engine.
--
-- The shadow engine is PL/pgSQL. It CANNOT call TypeScript. So the only way to
-- finish it without writing a fourth copy is to move ownership of the rule into
-- SQL and make TypeScript a *reader* of it. This view is that owner.
--
-- It is a faithful port of `resolveActualPodium()` (lib/podium.ts:90-121):
--   * champion  = the COMPLETED final's winner_team_id
--   * runner-up = the other team in that same fixture
--   * third     = the COMPLETED third-place match's winner_team_id
--   * `is_completed` gates every position, so nothing is awarded mid-tournament
--   * a `tournament_awards` row is an OPTIONAL PER-POSITION OVERRIDE. Its
--     absence is the normal state, NOT an error. This is the bug being fixed:
--     shadow_calculate_bonuses INNER JOINs that table, so an empty
--     tournament_awards silently zeroed every podium bonus for everyone.
--
-- Deliberately read straight off `matches` rather than off a resolved bracket:
-- `winner_team_id` is authoritative and already correct for penalty-decided
-- ties, whereas a bracket cascades group standings and inherits the
-- group-tiebreak fragility behind the 2026-07-11 knockout incident.
--
-- SCOPE: this is the ACTUAL podium only. The PREDICTED podium
-- (`resolveEntryPodiumPick`, mode-dispatched, per entry) stays in TypeScript —
-- shadow already has `shadow_resolved_podium` for it.
--
-- This migration is ADDITIVE AND INERT. Nothing reads the view yet; 028 points
-- shadow at it. Safe to apply and observe on its own.
-- Reversible: `DROP VIEW public.v_tournament_podium;`
-- ============================================================================

CREATE OR REPLACE VIEW public.v_tournament_podium
WITH (security_invoker = true) AS
WITH final_match AS (
  -- DISTINCT ON mirrors JS `.find()` taking the first match, but deterministically.
  SELECT DISTINCT ON (m.tournament_id)
         m.tournament_id, m.winner_team_id, m.home_team_id, m.away_team_id
  FROM public.matches m
  WHERE m.stage = 'final' AND m.is_completed
  ORDER BY m.tournament_id, m.match_number
),
third_match AS (
  SELECT DISTINCT ON (m.tournament_id)
         m.tournament_id, m.winner_team_id
  FROM public.matches m
  WHERE m.stage = 'third_place' AND m.is_completed
  ORDER BY m.tournament_id, m.match_number
),
derived AS (
  SELECT t.tournament_id,
         f.winner_team_id AS champion,
         -- runner-up = the other side of the final. Null when there is no
         -- champion, mirroring `finalMatch && derivedChampion ? ... : null`.
         CASE
           WHEN f.winner_team_id IS NULL THEN NULL
           WHEN f.winner_team_id = f.home_team_id THEN f.away_team_id
           ELSE f.home_team_id
         END AS runner_up,
         th.winner_team_id AS third_place
  FROM (SELECT DISTINCT tournament_id FROM public.matches) t
  LEFT JOIN final_match f  ON f.tournament_id  = t.tournament_id
  LEFT JOIN third_match th ON th.tournament_id = t.tournament_id
)
SELECT
  d.tournament_id,
  -- COALESCE == the `??` in resolveActualPodium: the override wins per position
  -- only where it is non-null.
  COALESCE(ta.champion_team_id,    d.champion)    AS champion_team_id,
  COALESCE(ta.runner_up_team_id,   d.runner_up)   AS runner_up_team_id,
  COALESCE(ta.third_place_team_id, d.third_place) AS third_place_team_id,
  CASE
    WHEN (ta.champion_team_id IS NOT NULL OR ta.runner_up_team_id IS NOT NULL
          OR ta.third_place_team_id IS NOT NULL)
     AND (d.champion IS NOT NULL OR d.runner_up IS NOT NULL
          OR d.third_place IS NOT NULL)                             THEN 'mixed'
    WHEN (ta.champion_team_id IS NOT NULL OR ta.runner_up_team_id IS NOT NULL
          OR ta.third_place_team_id IS NOT NULL)                    THEN 'override'
    WHEN (d.champion IS NOT NULL OR d.runner_up IS NOT NULL
          OR d.third_place IS NOT NULL)                             THEN 'derived'
    ELSE 'none'
  END AS source
FROM derived d
LEFT JOIN public.tournament_awards ta ON ta.tournament_id = d.tournament_id;

COMMENT ON VIEW public.v_tournament_podium IS
  'SINGLE OWNER (SQL side) of the ACTUAL tournament podium. Port of '
  'resolveActualPodium() in lib/podium.ts. tournament_awards is an optional '
  'per-position override, never a prerequisite. Do not re-derive a podium '
  'anywhere else — see migration 027 header and the 2026-07-19/20 incident.';
