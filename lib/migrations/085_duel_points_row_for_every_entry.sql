-- =============================================================
-- 085 — FIX: every Showdown entry gets a duel_points row, even on zero
-- =============================================================
-- 084's recompute was an `UPDATE league_entry_totals ... WHERE pool_id = ...`,
-- which updates nothing for an entry that has no row yet — and an entry only
-- gets one when the fixture engine first scores a pick for it.
--
-- So a member who joined a Showdown pool and never picked would have had no
-- totals row, and would have been ABSENT FROM THE LEADERBOARD rather than
-- sitting at the bottom on zero. That is the same mistake decision 11 rules on
-- for Table mode's late joiner: they are still in the pool, so they still
-- appear, and the number they appear on is 0.
--
-- Caught while writing the verification, which had to insert totals rows by hand
-- before the assertions would run — a test needing scaffolding the product does
-- not build is usually the product missing a case.
-- =============================================================

CREATE OR REPLACE FUNCTION public.league_score_duels(p_pool_id uuid, p_matchweek_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_mode    text;
  v_settled integer := 0;
BEGIN
  SELECT league_mode INTO v_mode FROM pools WHERE pool_id = p_pool_id;
  IF v_mode IS DISTINCT FROM 'showdown' THEN
    RETURN jsonb_build_object('skipped', 'not a showdown pool');
  END IF;

  -- The weekly accuracy number is whatever the DEPTH produced: both Results and
  -- Scores write league_match_scores.total_points, so Showdown reads one column
  -- and never learns which depth it is layered over. That is the whole reason
  -- Decision 9 calls it a layer and not a peer engine.
  WITH acc AS (
    SELECT d.duel_id,
           COALESCE((SELECT SUM(s.total_points) FROM league_match_scores s
                      WHERE s.entry_id = d.entry_a AND s.pool_id = p_pool_id
                        AND s.matchweek_number = p_matchweek_number), 0) AS a,
           CASE WHEN d.entry_b IS NULL THEN NULL ELSE
             COALESCE((SELECT SUM(s.total_points) FROM league_match_scores s
                        WHERE s.entry_id = d.entry_b AND s.pool_id = p_pool_id
                          AND s.matchweek_number = p_matchweek_number), 0)
           END AS b
      FROM league_duels d
     WHERE d.pool_id = p_pool_id
       AND d.matchweek_number = p_matchweek_number
       AND d.settled_at IS NULL
  )
  UPDATE league_duels d
     SET accuracy_a = acc.a,
         accuracy_b = acc.b,
         -- A bye scores nothing. The circle method rotates it, so in an
         -- odd-sized pool everyone sits out the same number of matchweeks.
         points_a = CASE WHEN acc.b IS NULL THEN 0
                         WHEN acc.a > acc.b THEN 3
                         WHEN acc.a = acc.b THEN 1
                         ELSE 0 END,
         points_b = CASE WHEN acc.b IS NULL THEN NULL
                         WHEN acc.b > acc.a THEN 3
                         WHEN acc.a = acc.b THEN 1
                         ELSE 0 END,
         settled_at = now()
    FROM acc
   WHERE d.duel_id = acc.duel_id;
  GET DIAGNOSTICS v_settled = ROW_COUNT;

  -- INSERT, not UPDATE: an entry that has never picked has no totals row yet,
  -- and updating nothing would drop them off the leaderboard entirely. They are
  -- still in the pool, so they appear on 0 — the same call decision 11 makes for
  -- a late joiner in Table mode.
  --
  -- Recomputed from the duels, never incremented: a corrected fixture has to be
  -- able to take duel points back, exactly as the fixture engine does.
  INSERT INTO league_entry_totals (entry_id, pool_id, duel_points, updated_at)
  SELECT pe.entry_id, p_pool_id,
         COALESCE((
           SELECT SUM(CASE WHEN d.entry_a = pe.entry_id THEN d.points_a ELSE d.points_b END)
             FROM league_duels d
            WHERE d.pool_id = p_pool_id
              AND d.settled_at IS NOT NULL
              AND (d.entry_a = pe.entry_id OR d.entry_b = pe.entry_id)
         ), 0),
         now()
    FROM pool_entries pe
    JOIN pool_members pm ON pe.member_id = pm.member_id
   WHERE pm.pool_id = p_pool_id
     AND pe.retired_at IS NULL
  ON CONFLICT (entry_id) DO UPDATE
    SET duel_points = EXCLUDED.duel_points,
        updated_at  = now();

  PERFORM league_finalize_ranks(p_pool_id);

  RETURN jsonb_build_object('settled', v_settled, 'matchweek', p_matchweek_number);
END;
$fn$;
