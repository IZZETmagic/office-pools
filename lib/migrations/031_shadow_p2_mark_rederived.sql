-- ============================================================================
-- 031 — Shadow P2, Migration C: mark pools as re-derived
-- ============================================================================
-- DEPENDS ON: 029 (schema), 030 (selector)
-- Plan: drafts/2026-07-27_shadow_P2_input_version_watermark.md
--
-- The write half of P2. After the reconciler successfully re-materializes a set
-- of pools, this records — for every eligible entry in them — the exact input
-- generation they were derived against, so `shadow_entries_needing_rederive`
-- stops selecting them.
--
-- WHY IT TAKES POOL IDS, NOT ENTRY IDS
-- ------------------------------------
-- Selection is per-entry, but WRITING is per-pool: `backfillBonusInputs` only
-- accepts `{ poolIds }`. So a run re-derives whole pools, which means every
-- eligible entry in them is fresh — not just the ones that tripped the selector.
-- Marking only the selected entries would leave their pool-mates stale, and the
-- next run would re-materialize the same pool again to fix them. Marking by pool
-- matches what actually happened. (Scoping doc §4.3, option (a).)
--
-- THE SNAPSHOT ARGUMENT IS THE LOAD-BEARING PART
-- ----------------------------------------------
-- `p_snapshot` MUST be captured by the caller BEFORE selection, and the stored
-- watermark is `max(updated_at) WHERE updated_at <= p_snapshot`.
--
-- Without that clamp: a member edits their predictions *while* the run is
-- working, we derive from the OLD picks, then record the NEW max — and that
-- entry is marked clean forever having never been derived from the edit. Silent
-- data loss of exactly the kind P2 exists to prevent.
--
-- With the clamp, an edit landing mid-run is > p_snapshot, so it is excluded
-- from the stored watermark, the entry stays stale, and the next run picks it
-- up. This mirrors the comment already in the shadow-materialize route: "Capture
-- the run start BEFORE detection so any edit landing mid-run is (idempotently)
-- re-picked-up next run, never missed."
--
-- The eligibility gate below is COPIED FROM `shadow_entries_needing_rederive`
-- (030) and must stay identical to it. If the selector and the marker disagree
-- about who is in scope, entries are either re-derived forever or never marked.
--
-- Returns the number of state rows written.
-- Reversible: DROP FUNCTION public.shadow_mark_pools_rederived(uuid[], timestamptz);
-- Idempotent: CREATE OR REPLACE + ON CONFLICT upsert.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.shadow_mark_pools_rederived(
  p_pool_ids uuid[],
  p_snapshot timestamptz
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_engine int;
  v_count  int;
BEGIN
  IF p_pool_ids IS NULL OR array_length(p_pool_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE((SELECT (setting_value::text)::int
                   FROM sync_settings WHERE setting_key = 'scoring_engine_version'), 1)
    INTO v_engine;

  WITH eligible AS (
    -- MUST match shadow_entries_needing_rederive's gate exactly.
    SELECT pe.entry_id, po.tournament_id
    FROM pool_entries pe
    JOIN pool_members pm ON pm.member_id = pe.member_id
    JOIN pools po        ON po.pool_id   = pm.pool_id
    WHERE pm.pool_id = ANY(p_pool_ids)
      AND po.prediction_mode <> 'bracket_picker'
      AND ( pe.has_submitted_predictions
         OR ( po.prediction_mode = 'progressive'
              AND EXISTS (SELECT 1 FROM entry_round_submissions ers
                          WHERE ers.entry_id = pe.entry_id AND ers.has_submitted) ) )
  ),
  wm AS (
    SELECT e.entry_id,
           e.tournament_id,
           -- Clamped to the snapshot: anything edited mid-run stays stale.
           (SELECT max(pr.updated_at) FROM predictions pr
             WHERE pr.entry_id = e.entry_id AND pr.updated_at <= p_snapshot) AS pred_wm
    FROM eligible e
  )
  INSERT INTO shadow_entry_bracket_state
    (entry_id, predictions_watermark, engine_version, inputs_version, resolved_at)
  SELECT wm.entry_id,
         wm.pred_wm,
         v_engine,
         COALESCE(tv.version, 0),
         now()
  FROM wm
  LEFT JOIN shadow_tournament_input_version tv ON tv.tournament_id = wm.tournament_id
  ON CONFLICT (entry_id) DO UPDATE
    SET predictions_watermark = EXCLUDED.predictions_watermark,
        engine_version        = EXCLUDED.engine_version,
        inputs_version        = EXCLUDED.inputs_version,
        resolved_at           = EXCLUDED.resolved_at;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.shadow_mark_pools_rederived(uuid[], timestamptz) IS
  'P2 write half: records the input generation (predictions watermark clamped to '
  'p_snapshot, engine_version, inputs_version) for every eligible entry in the '
  'given pools, so shadow_entries_needing_rederive stops selecting them. '
  'p_snapshot MUST be captured before selection — see migration 031 header.';
