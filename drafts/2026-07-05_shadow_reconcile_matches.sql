-- =============================================================
-- Shadow match-scoring RECONCILER (state-based) — replaces the fragile
-- trigger -> queue -> worker score path (which over-acknowledged rows and
-- could strand shadow on a stale provisional after a rapid goal/VAR-reversal).
--
-- Principle: converge on STATE, not on events. Re-score any match whose current
-- score/status/completion differs from what shadow last reconciled to. This is
-- race-free by construction and captures every change regardless of HOW it
-- happened (dropped event, VAR reversal, crashed worker, missed trigger).
--
-- Keyed on the SCORE COLUMNS (not matches.updated_at, which bumps on every write
-- incl. live_minute) so it re-scores only on a real result change.
-- Serialized with the materialize job via the same advisory key. Bounded by a
-- per-run cap; because it stamps per-match state it drains a backlog cleanly
-- (no watermark livelock). Writes shadow tables only.
-- =============================================================

CREATE TABLE IF NOT EXISTS shadow_match_state (
  match_id       uuid PRIMARY KEY REFERENCES matches(match_id) ON DELETE CASCADE,
  home_score_ft  int,
  away_score_ft  int,
  home_score_pso int,
  away_score_pso int,
  status         text,
  is_completed   boolean,
  scored_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE shadow_match_state ENABLE ROW LEVEL SECURITY;

-- Seed with the CURRENT state of every match — shadow is verified current now,
-- so the reconciler starts with nothing to do and only reacts to real changes.
INSERT INTO shadow_match_state (match_id, home_score_ft, away_score_ft, home_score_pso, away_score_pso, status, is_completed)
SELECT match_id, home_score_ft, away_score_ft, home_score_pso, away_score_pso, status, is_completed
FROM matches
ON CONFLICT (match_id) DO NOTHING;

CREATE OR REPLACE FUNCTION shadow_reconcile_matches(p_cap int DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_pools uuid[]; r record; n int := 0;
BEGIN
  -- Kill switch (absent = enabled)
  IF coalesce((SELECT setting_value FROM sync_settings WHERE setting_key='shadow_reconcile_enabled'), to_jsonb(true)) = to_jsonb(false) THEN
    RETURN jsonb_build_object('skipped','disabled');
  END IF;

  -- Serialize with the materialize job / (during shadow-test) the queue worker.
  IF NOT pg_try_advisory_lock(hashtext('shadow_process_queue')) THEN
    RETURN jsonb_build_object('skipped','locked');
  END IF;

  -- Snapshot the drifted matches (bounded). Compare on the SCORE columns only.
  DROP TABLE IF EXISTS tmp_reconcile;
  CREATE TEMP TABLE tmp_reconcile AS
  SELECT m.match_id, m.home_score_ft, m.away_score_ft, m.home_score_pso, m.away_score_pso, m.status, m.is_completed
  FROM matches m
  LEFT JOIN shadow_match_state st ON st.match_id = m.match_id
  WHERE (m.home_score_ft, m.away_score_ft, m.home_score_pso, m.away_score_pso, m.status, m.is_completed)
        IS DISTINCT FROM
        (st.home_score_ft, st.away_score_ft, st.home_score_pso, st.away_score_pso, st.status, st.is_completed)
  ORDER BY m.match_number
  LIMIT p_cap;

  IF NOT EXISTS (SELECT 1 FROM tmp_reconcile) THEN
    PERFORM pg_advisory_unlock(hashtext('shadow_process_queue'));
    RETURN jsonb_build_object('reconciled', 0);
  END IF;

  -- Re-score each drifted match (p_final from the snapshot; shadow_score_match reads current matches)
  FOR r IN SELECT match_id, is_completed FROM tmp_reconcile LOOP
    PERFORM shadow_score_match(r.match_id, coalesce(r.is_completed, false));
    n := n + 1;
  END LOOP;

  -- Scoped bonus + finalize for affected pools
  SELECT array_agg(DISTINCT pool_id) INTO v_pools
  FROM shadow_match_scores WHERE match_id IN (SELECT match_id FROM tmp_reconcile);
  IF v_pools IS NOT NULL THEN
    PERFORM shadow_calculate_bonuses(v_pools);
    PERFORM shadow_finalize_totals(v_pools);
  END IF;

  -- Stamp state = the SNAPSHOT we captured (not a fresh read), so a change that
  -- landed mid-run is re-detected next run. Guarantees convergence.
  INSERT INTO shadow_match_state
    (match_id, home_score_ft, away_score_ft, home_score_pso, away_score_pso, status, is_completed, scored_at)
  SELECT match_id, home_score_ft, away_score_ft, home_score_pso, away_score_pso, status, is_completed, now()
  FROM tmp_reconcile
  ON CONFLICT (match_id) DO UPDATE SET
    home_score_ft=EXCLUDED.home_score_ft, away_score_ft=EXCLUDED.away_score_ft,
    home_score_pso=EXCLUDED.home_score_pso, away_score_pso=EXCLUDED.away_score_pso,
    status=EXCLUDED.status, is_completed=EXCLUDED.is_completed, scored_at=now();

  DROP TABLE IF EXISTS tmp_reconcile;
  PERFORM pg_advisory_unlock(hashtext('shadow_process_queue'));
  RETURN jsonb_build_object('reconciled', n, 'pools', coalesce(array_length(v_pools,1),0));
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_advisory_unlock(hashtext('shadow_process_queue'));
  RAISE;
END;
$fn$;

-- GO-LIVE (after shadow-test):
--   SELECT cron.schedule('shadow-reconcile','* * * * *', $$SELECT public.shadow_reconcile_matches()$$);
-- CUTOVER (retire the queue path once confident):
--   DROP TRIGGER trg_shadow_enqueue ON matches;
--   SELECT cron.unschedule('shadow-drain-queue');
