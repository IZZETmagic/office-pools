-- =============================================================
-- Shadow scoring automation — trigger → queue → worker
-- 2026-07-04. Fires the shadow scoring pipeline at the identical times
-- production scores (any match score/status/completion change), but is
-- COMPLETELY SEPARATE from production's scoring method:
--   * separate enqueue trigger (does NOT modify prod's trg_calculate_points)
--   * exception-guarded: can NEVER slow or roll back the production matches write
--   * worker writes ONLY shadow tables; reads prod tables read-only
--   * production scoring (recalculatePool / process_match_result) untouched
--
-- Materialization (TS resolveFullBracket inputs) is NOT automated here — it is
-- refreshed manually when new rounds/entries/edits appear (else bonuses drift
-- stale). This module automates the SCORING only.
-- =============================================================

-- 1) Queue (shadow-owned) --------------------------------------------------
CREATE TABLE IF NOT EXISTS shadow_score_queue (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id     uuid NOT NULL,
  reason       text,
  enqueued_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_shadow_score_queue_unprocessed
  ON shadow_score_queue(enqueued_at) WHERE processed_at IS NULL;
ALTER TABLE shadow_score_queue ENABLE ROW LEVEL SECURITY;  -- definer/service_role only

-- 2) Enqueue trigger FUNCTION (trigger attached at go-live) -----------------
-- SAFETY: wrapped in BEGIN/EXCEPTION so any failure is swallowed — a shadow
-- enqueue can never break production's write. AFTER trigger; only INSERTs.
CREATE OR REPLACE FUNCTION shadow_enqueue_match() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
  BEGIN
    IF (NEW.home_score_ft  IS DISTINCT FROM OLD.home_score_ft
     OR NEW.away_score_ft  IS DISTINCT FROM OLD.away_score_ft
     OR NEW.home_score_pso IS DISTINCT FROM OLD.home_score_pso
     OR NEW.away_score_pso IS DISTINCT FROM OLD.away_score_pso
     OR NEW.status         IS DISTINCT FROM OLD.status
     OR NEW.is_completed   IS DISTINCT FROM OLD.is_completed) THEN
      INSERT INTO shadow_score_queue(match_id, reason)
      VALUES (NEW.match_id,
              CASE WHEN NEW.is_completed IS DISTINCT FROM OLD.is_completed THEN 'completed'
                   WHEN NEW.status       IS DISTINCT FROM OLD.status       THEN 'status'
                   ELSE 'score' END);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- isolate: shadow enqueue must never affect the production write
  END;
  RETURN NULL;  -- AFTER trigger: return value ignored
END;
$fn$;

-- 3) Worker: drain queue → score changed matches → scoped bonus → finalize --
-- Shadow tables only. Advisory lock prevents overlapping runs (like prod's
-- sweep lock). At-least-once: a failed run leaves rows unprocessed to retry.
CREATE OR REPLACE FUNCTION shadow_process_queue() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_matches uuid[]; v_pools uuid[]; r uuid; n int := 0;
BEGIN
  IF NOT pg_try_advisory_lock(hashtext('shadow_process_queue')) THEN
    RETURN jsonb_build_object('skipped','locked');
  END IF;

  SELECT array_agg(DISTINCT match_id) INTO v_matches
  FROM shadow_score_queue WHERE processed_at IS NULL;

  IF v_matches IS NULL THEN
    PERFORM pg_advisory_unlock(hashtext('shadow_process_queue'));
    RETURN jsonb_build_object('processed', 0);
  END IF;

  -- Score each changed match (p_final = is_completed → live matches score provisionally)
  FOREACH r IN ARRAY v_matches LOOP
    PERFORM shadow_score_match(r, coalesce((SELECT is_completed FROM matches WHERE match_id=r), false));
    n := n + 1;
  END LOOP;

  -- Affected pools = pools with shadow scores on those matches → scoped bonus + finalize
  SELECT array_agg(DISTINCT pool_id) INTO v_pools
  FROM shadow_match_scores WHERE match_id = ANY(v_matches);

  IF v_pools IS NOT NULL THEN
    PERFORM shadow_calculate_bonuses(v_pools);              -- change-only, scoped
    FOREACH r IN ARRAY v_pools LOOP
      PERFORM shadow_finalize_totals(r);                    -- per-pool rank rollup
    END LOOP;
  END IF;

  UPDATE shadow_score_queue SET processed_at = now()
  WHERE processed_at IS NULL AND match_id = ANY(v_matches);

  PERFORM pg_advisory_unlock(hashtext('shadow_process_queue'));
  RETURN jsonb_build_object('matches', n, 'pools', coalesce(array_length(v_pools,1),0));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_advisory_unlock(hashtext('shadow_process_queue'));
  RAISE;
END;
$fn$;

-- 4) GO-LIVE (applied after worker validation):
--   CREATE TRIGGER trg_shadow_enqueue AFTER UPDATE ON public.matches
--     FOR EACH ROW EXECUTE FUNCTION shadow_enqueue_match();
--   SELECT cron.schedule('shadow-drain-queue', '* * * * *', $$SELECT public.shadow_process_queue()$$);
