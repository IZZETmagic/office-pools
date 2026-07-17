-- ============================================================================
-- Phase A · Gap 0 — un-break the parity alarm  (shadow-only, ZERO scoring impact)
-- ============================================================================
-- WHY: shadow_detect_diffs() (cron jobid 21 `shadow-parity-alarm`, shipped
-- 2026-07-13) inserts diff_kind='entry_total_mismatch' rows into
-- shadow_score_diffs WITHOUT a match_id — but shadow_score_diffs.match_id is
-- NOT NULL, so the cron has failed 100% of runs since real diffs first appeared
-- (the SF-bonus prod-staleness). Entry-level diffs are entry-scoped and
-- legitimately have no match_id. This alarm is our cutover green-light
-- instrument, so it must work before Phase 1.
--
-- IMPACT: shadow-only. Prod scoring untouched. A failed detector INSERT writes
-- nothing; fixing it only lets the monitor record what it already computes.
-- REVERSIBLE: re-add NOT NULL after clearing entry_total_mismatch rows.
-- ============================================================================

-- TWO constraints blocked the insert (found on apply 2026-07-17):
-- (1) match_id NOT NULL, and (2) a diff_kind CHECK that didn't allow the
-- entry-scoped kind the alarm writes. Both fixed here.
ALTER TABLE public.shadow_score_diffs ALTER COLUMN match_id DROP NOT NULL;

ALTER TABLE public.shadow_score_diffs DROP CONSTRAINT shadow_score_diffs_diff_kind_check;
ALTER TABLE public.shadow_score_diffs ADD CONSTRAINT shadow_score_diffs_diff_kind_check
  CHECK (diff_kind = ANY (ARRAY['value_mismatch','only_in_live','only_in_shadow','entry_total_mismatch']));

-- Repopulate the log now that inserts can succeed. Expect: shadow-ahead rows
-- only (prod stale on the 2nd SF bonus), never shadow-behind.
SELECT public.shadow_detect_diffs();

-- VERIFY (run manually after apply):
--   SELECT diff_kind, count(*) FROM public.shadow_score_diffs GROUP BY 1 ORDER BY 2 DESC;
--   -- and confirm the cron flips green:
--   SELECT jobname, status, return_message, start_time
--   FROM cron.job_run_details jrd JOIN cron.job j USING (jobid)
--   WHERE j.jobname = 'shadow-parity-alarm' ORDER BY start_time DESC LIMIT 5;
