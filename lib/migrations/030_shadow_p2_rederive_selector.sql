-- ============================================================================
-- 030 — Shadow P2, Migration B: the generalised re-derive selector (INERT)
-- ============================================================================
-- DEPENDS ON: 029_shadow_p2_input_version_schema.sql
-- Plan: drafts/2026-07-27_shadow_P2_input_version_watermark.md
--
-- This is "one reconciler, no blind spots" — the selector half.
--
-- A NEW FUNCTION, NOT A REPLACEMENT. `shadow_entries_needing_bracket_resolve`
-- is left exactly as it is, deliberately: P1's `reconcileVersionedBrackets`
-- calls it and only knows how to resolve FULL_TOURNAMENT brackets. Widening
-- that function in place would start feeding it progressive entries it cannot
-- handle. P1 keeps its narrow selector until the P2 reconciler replaces it.
--
-- Nothing calls this function. It is verifiable on its own: run it read-only
-- and confirm (a) it selects the ~1,883 progressive entries that have never had
-- a state row, and (b) it selects ZERO once they are clean and no version moved.
--
-- FOUR REASONS AN ENTRY NEEDS RE-DERIVING — the third is the one that did not
-- exist before P2, and the one the 2026-07-27 podium staleness needed:
--   never_resolved     no state row at all
--   engine_version     DERIVATION LOGIC changed (bump scoring_engine_version)
--   inputs_version     ACTUAL RESULTS / MATCH_CONDUCT changed (bump the
--                      tournament row) — invisible to P1
--   predictions        the member edited their picks
--
-- TWO DELIBERATE CHOICES WORTH REVIEWING
-- --------------------------------------
-- 1. ELIGIBILITY MATCHES THE SCORER, NOT P1. P1 gates on
--    `pe.has_submitted_predictions` alone. `shadow_calculate_bonuses` uses a
--    WIDER gate that also admits progressive entries which have submitted a
--    ROUND without the entry-level flag being set. Using P1's narrower gate here
--    would leave those entries permanently unreconciled while still being
--    scored — a brand-new blind spot in the function whose entire purpose is to
--    have none. The gate below is copied from `shadow_calculate_bonuses`.
--
-- 2. bracket_picker is EXCLUDED EXPLICITLY, with this comment, rather than
--    silently: those pools have no shadow arm at all (`readSource.ts` forces
--    them to 'prod'). Excluding them is correct today; the exclusion should be
--    a decision someone can find, not an accident.
--
-- Ordering is by (pool_id, entry_id) so batches are stable across runs AND
-- align to pools — the reconciler re-materializes whole pools, so pool-aligned
-- batches avoid re-doing the same pool across several runs.
--
-- Reversible: DROP FUNCTION public.shadow_entries_needing_rederive(integer);
-- Idempotent: CREATE OR REPLACE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.shadow_entries_needing_rederive(p_cap integer DEFAULT 500)
 RETURNS TABLE(entry_id uuid, pool_id uuid, tournament_id uuid, reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH cur AS (
    SELECT COALESCE((SELECT (setting_value::text)::int
                     FROM sync_settings WHERE setting_key = 'scoring_engine_version'), 1) AS engine_v
  ),
  eligible AS (
    -- Same in-scope test as shadow_calculate_bonuses (see header note 1).
    SELECT pe.entry_id, pm.pool_id, po.tournament_id
    FROM pool_entries pe
    JOIN pool_members pm ON pm.member_id = pe.member_id
    JOIN pools po        ON po.pool_id   = pm.pool_id
    WHERE po.prediction_mode <> 'bracket_picker'   -- see header note 2
      AND ( pe.has_submitted_predictions
         OR ( po.prediction_mode = 'progressive'
              AND EXISTS (SELECT 1 FROM entry_round_submissions ers
                          WHERE ers.entry_id = pe.entry_id AND ers.has_submitted) ) )
  ),
  pred AS (
    -- One grouped scan rather than a correlated max() per entry.
    SELECT pr.entry_id, max(pr.updated_at) AS pred_wm
    FROM predictions pr
    WHERE pr.entry_id IN (SELECT e.entry_id FROM eligible e)
    GROUP BY pr.entry_id
  )
  SELECT e.entry_id,
         e.pool_id,
         e.tournament_id,
         CASE
           WHEN st.entry_id IS NULL                                    THEN 'never_resolved'
           WHEN st.engine_version < cur.engine_v                       THEN 'engine_version'
           WHEN st.inputs_version < COALESCE(tv.version, 0)            THEN 'inputs_version'
           ELSE 'predictions'
         END AS reason
  FROM eligible e
  LEFT JOIN pred p                            ON p.entry_id      = e.entry_id
  LEFT JOIN shadow_entry_bracket_state st     ON st.entry_id     = e.entry_id
  LEFT JOIN shadow_tournament_input_version tv ON tv.tournament_id = e.tournament_id
  CROSS JOIN cur
  WHERE st.entry_id IS NULL
     OR st.engine_version < cur.engine_v
     OR st.inputs_version < COALESCE(tv.version, 0)
     OR st.predictions_watermark IS DISTINCT FROM p.pred_wm
  ORDER BY e.pool_id, e.entry_id
  LIMIT p_cap;
$function$;

COMMENT ON FUNCTION public.shadow_entries_needing_rederive(integer) IS
  'P2 selector: every entry whose shadow per-entry derived output is stale, for '
  'ANY of four reasons (never_resolved / engine_version / inputs_version / '
  'predictions). Supersedes shadow_entries_needing_bracket_resolve, which is '
  'full_tournament-only and blind to results/conduct changes. bracket_picker is '
  'excluded: no shadow arm. See migration 030.';
