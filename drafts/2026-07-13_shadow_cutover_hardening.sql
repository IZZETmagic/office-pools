-- =============================================================
-- Shadow cutover hardening — applied to prod 2026-07-13
-- (Supabase migration: shadow_cutover_hardening)
--
-- Shadow-only. Touches NO production scoring path. Reversible.
--   #2  shadow_dirty_pools   — bulk/settings/admin recalc marker
--   #3  shadow_detect_diffs  — automated parity alarm (+ pg_cron)
--   #1  coverage-by-mode in the alarm makes bracket_picker's
--       0% shadow coverage explicit (separate live engine)
--   #4  v_shadow_worker_runs — repointed to the live cron jobs
--
-- The DB objects below are LIVE. The consuming code — the dirty-mark in
-- lib/scoring/recalculate.ts and the drain in app/api/cron/shadow-materialize/
-- route.ts — activates #2 on the next Vercel deploy. Until then the table
-- stays empty and is ignored by the currently-deployed route (forward-safe).
--
-- Rollback:
--   DROP TABLE public.shadow_dirty_pools;
--   SELECT cron.unschedule('shadow-parity-alarm');
--   DROP FUNCTION public.shadow_detect_diffs();
--   DELETE FROM public.shadow_score_diffs WHERE diff_kind = 'entry_total_mismatch';
--   -- and restore the old v_shadow_worker_runs definition if desired.
-- =============================================================

-- #2 — dirty-pool marker (drained + cleared by the shadow-materialize cron)
CREATE TABLE IF NOT EXISTS public.shadow_dirty_pools (
  pool_id   uuid PRIMARY KEY,
  marked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shadow_dirty_pools ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.shadow_dirty_pools IS
  'Pools flagged for shadow re-materialize after a bulk/settings/admin recalc (recalculatePool with no matchId) — a full live re-score changes scores without touching predictions or match rows, which the reconcilers key off. Drained + cleared by the shadow-materialize cron. Shadow-only; RLS on, no policies (service_role/definer only).';

-- #3 — automated parity alarm (writes only its own diff_kind rows; preserves the
-- historical only_in_live / value_mismatch audit list). #1 — coverage-by-mode.
CREATE OR REPLACE FUNCTION public.shadow_detect_diffs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_errors int; v_ahead int; v_behind int; v_cov jsonb;
BEGIN
  DELETE FROM shadow_score_diffs WHERE diff_kind = 'entry_total_mismatch';

  INSERT INTO shadow_score_diffs
    (entry_id, diff_kind, live_type, shadow_type, live_total, shadow_total, note, detected_at)
  SELECT s.entry_id, 'entry_total_mismatch', 'live', 'shadow',
         pe.scored_total_points, s.total_points,
         'pool ' || s.pool_id || ' shadow ' ||
           CASE WHEN s.total_points > pe.scored_total_points THEN 'ahead (live lagging)'
                ELSE 'behind (needs re-materialize)' END,
         now()
  FROM shadow_entry_totals s
  JOIN pool_entries pe ON pe.entry_id = s.entry_id
  WHERE s.total_points IS NOT NULL
    AND pe.scored_total_points IS NOT NULL
    AND s.total_points <> pe.scored_total_points;

  SELECT count(*),
         count(*) FILTER (WHERE shadow_total > live_total),
         count(*) FILTER (WHERE shadow_total < live_total)
    INTO v_errors, v_ahead, v_behind
  FROM shadow_score_diffs WHERE diff_kind = 'entry_total_mismatch';

  -- Coverage by mode — makes the bracket_picker exclusion explicit.
  SELECT jsonb_object_agg(prediction_mode, jsonb_build_object('live', live_n, 'shadow', shadow_n))
    INTO v_cov
  FROM (
    SELECT po.prediction_mode,
           count(DISTINCT pe.entry_id) live_n,
           count(DISTINCT st.entry_id) shadow_n
    FROM pool_entries pe
    JOIN pool_members pm ON pm.member_id = pe.member_id
    JOIN pools po        ON po.pool_id   = pm.pool_id
    LEFT JOIN shadow_entry_totals st ON st.entry_id = pe.entry_id
    GROUP BY po.prediction_mode
  ) c;

  RETURN jsonb_build_object(
    'true_errors',  v_errors,
    'shadow_ahead', v_ahead,
    'shadow_behind', v_behind,
    'coverage',     v_cov,
    'checked_at',   now()
  );
END;
$fn$;

SELECT cron.schedule('shadow-parity-alarm', '*/15 * * * *', $cron$SELECT public.shadow_detect_diffs()$cron$);

-- #4 — repoint the dead health view (was filtering the retired 'shadow-drain-queue')
CREATE OR REPLACE VIEW public.v_shadow_worker_runs AS
SELECT jrd.start_time,
       jrd.status,
       round(EXTRACT(epoch FROM (jrd.end_time - jrd.start_time)) * 1000) AS ms,
       jrd.return_message,
       j.jobname
FROM cron.job_run_details jrd
JOIN cron.job j ON j.jobid = jrd.jobid
WHERE j.jobname IN ('shadow-materialize','shadow-reconcile','shadow-reconcile-adjustments','shadow-parity-alarm')
ORDER BY jrd.start_time DESC;
