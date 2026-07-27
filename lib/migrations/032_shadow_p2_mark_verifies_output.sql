-- ============================================================================
-- 032 — Shadow P2: single-owner eligibility gate + the marker verifies output
-- ============================================================================
-- DEPENDS ON: 029 (schema), 030 (selector), 031 (marker — superseded here)
--
-- Fixes TWO things flagged when 031 landed, rather than documenting them:
--
--   (1) THE ELIGIBILITY GATE WAS DUPLICATED between
--       shadow_entries_needing_rederive (030) and shadow_mark_pools_rederived
--       (031), with only a comment asking future editors to keep them in sync.
--       If they ever diverged, entries would be either re-derived forever
--       (selector wider than marker) or never marked (marker wider than
--       selector). Now there is ONE owner, shadow_eligible_entries, and both
--       call it. The class of bug is removed structurally, not by comment.
--
--   (2) THE MARKER MARKED ENTRIES CLEAN WITHOUT CHECKING that derivation
--       produced anything for them. That is how entry 98f3163f (NasserSEN —
--       104 predictions, fully submitted) came to hold 0 standings, 0 podium
--       and 0 bonus rows against prod's 26 while marked fresh, found only by
--       diffing prod against shadow by hand. The CAUSE (a discarded paging
--       error in backfillBonusInputs) is fixed in db4daf3; this is the
--       safeguard, so a future skip cannot be recorded as success.
--
-- WHY THE CHECK IS "HAS PREDICTIONS BUT NO OUTPUT", NOT "HAS NO OUTPUT"
-- --------------------------------------------------------------------
-- The obvious rule — refuse to mark any entry with no derived rows — is WRONG,
-- and production says so. There are 9 live entries flagged
-- has_submitted_predictions = true that have ZERO predictions rows. They
-- legitimately derive nothing, and prod awards them nothing either, so both
-- engines agree. A bare no-output rule would refuse to mark them FOREVER,
-- re-materializing their pools on every run in perpetuity.
--
-- The real failure signature is an entry that HAS predictions and still
-- produced nothing. That is NasserSEN exactly, and it lets the 9 through.
--
-- AND WHY IT IS PRESENCE, NOT A ROW COUNT
-- ---------------------------------------
-- Asserting "48 standings and 32 brackets" would be World-Cup-shaped — 48 is
-- 12 groups x 4 teams, 32 is a 32-team knockout. A Premier League season has
-- neither, so a count-based check would fail every entry the moment a second
-- competition lands. Presence detects total failure without prescribing shape.
--
-- KNOWN TRADE-OFF, ACCEPTED: a genuinely broken entry now stays unmarked and
-- its pool is re-derived every run. Repeated VISIBLE work beats silent
-- corruption, and `skipped_no_output` names the entries so it is actionable
-- rather than something to infer from a diff.
--
-- Reversible: re-apply 031 and 030.
-- ============================================================================

-- 1. THE SINGLE OWNER of "which entries are in scope for shadow" ------------
CREATE OR REPLACE FUNCTION public.shadow_eligible_entries(p_pool_ids uuid[] DEFAULT NULL)
 RETURNS TABLE(entry_id uuid, pool_id uuid, tournament_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT pe.entry_id, pm.pool_id, po.tournament_id
  FROM pool_entries pe
  JOIN pool_members pm ON pm.member_id = pe.member_id
  JOIN pools po        ON po.pool_id   = pm.pool_id
  WHERE (p_pool_ids IS NULL OR pm.pool_id = ANY(p_pool_ids))
    -- bracket_picker has NO shadow arm at all (readSource.ts forces those pools
    -- to 'prod'). Excluded explicitly so it is a decision someone can find.
    AND po.prediction_mode <> 'bracket_picker'
    -- Matches shadow_calculate_bonuses: progressive entries can be in scope via
    -- a ROUND submission without the entry-level flag. Using the narrower
    -- has_submitted_predictions test alone would miss 20 progressive entries
    -- that are nonetheless scored.
    AND ( pe.has_submitted_predictions
       OR ( po.prediction_mode = 'progressive'
            AND EXISTS (SELECT 1 FROM entry_round_submissions ers
                        WHERE ers.entry_id = pe.entry_id AND ers.has_submitted) ) );
$function$;

COMMENT ON FUNCTION public.shadow_eligible_entries(uuid[]) IS
  'SINGLE OWNER of shadow scoring eligibility. Called by both '
  'shadow_entries_needing_rederive and shadow_mark_pools_rederived so the '
  'selector and the marker cannot drift apart. Mirrors the gate in '
  'shadow_calculate_bonuses. bracket_picker excluded: no shadow arm.';

-- 2. Selector — now delegates the gate --------------------------------------
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
  eligible AS (SELECT * FROM shadow_eligible_entries(NULL)),
  pred AS (
    SELECT pr.entry_id, max(pr.updated_at) AS pred_wm
    FROM predictions pr
    WHERE pr.entry_id IN (SELECT e.entry_id FROM eligible e)
    GROUP BY pr.entry_id
  )
  SELECT e.entry_id,
         e.pool_id,
         e.tournament_id,
         CASE
           WHEN st.entry_id IS NULL                         THEN 'never_resolved'
           WHEN st.engine_version < cur.engine_v            THEN 'engine_version'
           WHEN st.inputs_version < COALESCE(tv.version, 0) THEN 'inputs_version'
           ELSE 'predictions'
         END AS reason
  FROM eligible e
  LEFT JOIN pred p                             ON p.entry_id      = e.entry_id
  LEFT JOIN shadow_entry_bracket_state st      ON st.entry_id     = e.entry_id
  LEFT JOIN shadow_tournament_input_version tv ON tv.tournament_id = e.tournament_id
  CROSS JOIN cur
  WHERE st.entry_id IS NULL
     OR st.engine_version < cur.engine_v
     OR st.inputs_version < COALESCE(tv.version, 0)
     OR st.predictions_watermark IS DISTINCT FROM p.pred_wm
  ORDER BY e.pool_id, e.entry_id
  LIMIT p_cap;
$function$;

-- 3. Marker — delegates the gate AND verifies output -------------------------
DROP FUNCTION IF EXISTS public.shadow_mark_pools_rederived(uuid[], timestamptz);

CREATE FUNCTION public.shadow_mark_pools_rederived(
  p_pool_ids uuid[],
  p_snapshot timestamptz
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_engine  int;
  v_marked  int;
  v_skipped uuid[];
BEGIN
  IF p_pool_ids IS NULL OR array_length(p_pool_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('marked', 0, 'skipped_no_output', 0, 'skipped_entry_ids', '[]'::jsonb);
  END IF;

  SELECT COALESCE((SELECT (setting_value::text)::int
                   FROM sync_settings WHERE setting_key = 'scoring_engine_version'), 1)
    INTO v_engine;

  -- Entries that HAVE predictions yet produced NO derived output: the failure
  -- signature. Entries with no predictions derive nothing legitimately and are
  -- NOT withheld — see the header.
  SELECT array_agg(e.entry_id) INTO v_skipped
  FROM shadow_eligible_entries(p_pool_ids) e
  WHERE EXISTS (SELECT 1 FROM predictions pr WHERE pr.entry_id = e.entry_id)
    AND NOT (
         EXISTS (SELECT 1 FROM shadow_resolved_podium    x WHERE x.entry_id = e.entry_id)
      OR EXISTS (SELECT 1 FROM shadow_resolved_standings x WHERE x.entry_id = e.entry_id)
      OR EXISTS (SELECT 1 FROM shadow_resolved_qualified x WHERE x.entry_id = e.entry_id)
      OR EXISTS (SELECT 1 FROM shadow_resolved_pairs     x WHERE x.entry_id = e.entry_id)
      OR EXISTS (SELECT 1 FROM shadow_resolved_brackets  x WHERE x.entry_id = e.entry_id)
    );

  WITH markable AS (
    SELECT e.entry_id, e.tournament_id
    FROM shadow_eligible_entries(p_pool_ids) e
    WHERE v_skipped IS NULL OR NOT (e.entry_id = ANY(v_skipped))
  ),
  wm AS (
    SELECT m.entry_id,
           m.tournament_id,
           -- Clamped to the snapshot: anything edited mid-run stays stale, so a
           -- concurrent edit is retried rather than marked against picks we
           -- never read.
           (SELECT max(pr.updated_at) FROM predictions pr
             WHERE pr.entry_id = m.entry_id AND pr.updated_at <= p_snapshot) AS pred_wm
    FROM markable m
  )
  INSERT INTO shadow_entry_bracket_state
    (entry_id, predictions_watermark, engine_version, inputs_version, resolved_at)
  SELECT wm.entry_id, wm.pred_wm, v_engine, COALESCE(tv.version, 0), now()
  FROM wm
  LEFT JOIN shadow_tournament_input_version tv ON tv.tournament_id = wm.tournament_id
  ON CONFLICT (entry_id) DO UPDATE
    SET predictions_watermark = EXCLUDED.predictions_watermark,
        engine_version        = EXCLUDED.engine_version,
        inputs_version        = EXCLUDED.inputs_version,
        resolved_at           = EXCLUDED.resolved_at;

  GET DIAGNOSTICS v_marked = ROW_COUNT;

  RETURN jsonb_build_object(
    'marked',            v_marked,
    'skipped_no_output', COALESCE(array_length(v_skipped, 1), 0),
    -- Capped: the point is to name them, not to return thousands.
    'skipped_entry_ids', COALESCE(to_jsonb(v_skipped[1:20]), '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.shadow_mark_pools_rederived(uuid[], timestamptz) IS
  'P2 write half. Uses shadow_eligible_entries as the single gate, and marks an '
  'entry clean ONLY if it either has no predictions (legitimately derives '
  'nothing) or actually produced derived output. Closes the hole that let entry '
  '98f3163f be marked fresh while empty. Returns {marked, skipped_no_output, '
  'skipped_entry_ids}. See migration 032.';
