-- ============================================================================
-- Phase 2 kill-switch: prod_scoring_enabled + gate the DB scoring trigger.
--
-- SAFE TO APPLY: at the default (flag = true / absent) behaviour is UNCHANGED —
-- the added condition only skips prod DB scoring when the flag is explicitly
-- 'false'. Pairs with the Node gate in lib/scoring/recalculate.ts (needs deploy).
--
-- Activate the cutover (once code is deployed): UPDATE the flag to false.
-- Roll back instantly: UPDATE it back to true, then let prod catch up
-- (recalc-all) or seed prod columns from shadow before flipping reads back.
-- ============================================================================

-- 1) The flag (default ON).
INSERT INTO sync_settings (setting_key, setting_value)
VALUES ('prod_scoring_enabled', 'true'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- 2) Gate the DB scoring trigger (trg_calculate_points -> process_match_result).
--    Only the AND-clause on prod_scoring_enabled is added; the rest is verbatim.
CREATE OR REPLACE FUNCTION public.trigger_calculate_points()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'completed'
     AND NEW.is_completed = true
     AND NEW.home_score_ft IS NOT NULL
     AND NEW.away_score_ft IS NOT NULL
     AND (OLD.status IS NULL OR OLD.status != 'completed' OR OLD.is_completed = false)
     -- Shadow cutover kill-switch: skip prod DB scoring when disabled.
     AND COALESCE(
           (SELECT setting_value FROM sync_settings WHERE setting_key = 'prod_scoring_enabled'),
           'true'::jsonb
         ) <> 'false'::jsonb
  THEN
    PERFORM process_match_result(NEW.match_id, NEW.home_score_ft, NEW.away_score_ft, NEW.home_score_pso, NEW.away_score_pso);
  END IF;
  RETURN NEW;
END;
$function$;

-- VERIFY after apply:
--   SELECT setting_key, setting_value FROM sync_settings WHERE setting_key='prod_scoring_enabled';
--   -- flip test (only once code is deployed + you're ready):
--   -- UPDATE sync_settings SET setting_value='false' WHERE setting_key='prod_scoring_enabled';
