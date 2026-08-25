-- =============================================================
-- 084 — SHOWDOWN: the duel, scored
-- =============================================================
-- Three points a win, one a draw, none a loss — the shape a football follower
-- already knows, which is the concept note's whole argument for the mode.
--
-- ## The layer works because of ONE column
--
-- The weekly accuracy number is `SUM(league_match_scores.total_points)` for a
-- matchweek. Both depths write it: a Results tap and a Scores scoreline are
-- priced by the same engine into the same column. So Showdown reads one number
-- and never learns which depth it is layered over — which is precisely what
-- Decision 9 means by "a layer, not a peer engine".
--
-- ## Ranking
--
-- `league_finalize_ranks` gains ONE leading key, `duel_points DESC`. Every other
-- mode has 0 there, so their cascade is unchanged — the alternative was a second
-- rank writer, which is how two leaderboards start disagreeing about who won.
--
-- The concept's second tiebreak, *lifetime head-to-head between tied players*,
-- is NOT implemented: it is pairwise, so it cannot be expressed as a sort key
-- over one row. Recorded as owed rather than approximated, because approximating
-- a tiebreak silently picks a different winner.
--
-- ## When it settles
--
-- A trigger on `league_matchweeks.ranks_snapshot_at` going non-NULL — already
-- the exact moment a matchweek is both fully played and fully SCORED (migration
-- 061 is what made it mean scored rather than merely finished). A trigger and
-- not a call inside the snapshot function, so that live function is not
-- rewritten to know about a mode it has no business knowing about.
--
-- Ordering is load-bearing and correct: the snapshot copies `final_rank` into
-- `previous_final_rank` FIRST, then this settles the duels and moves
-- `final_rank`. So the weekly arrow compares last matchweek's position with this
-- one's, which is what Decision 4 asks for.
-- =============================================================

ALTER TABLE league_entry_totals
  ADD COLUMN IF NOT EXISTS duel_points integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN league_entry_totals.duel_points IS
  'Showdown only: 3 per duel won, 1 drawn, 0 lost or bye. Zero for every other mode, which is why it can lead the rank cascade unconditionally.';

CREATE OR REPLACE FUNCTION public.league_finalize_ranks(p_pool_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ranked int := 0;
BEGIN
  -- Competing entries get a position...
  WITH ranked AS (
    SELECT t.entry_id,
           ROW_NUMBER() OVER (
             -- Showdown leads on DUEL points; every other mode has 0 here, so
             -- the cascade below is unchanged for them. One ordering, one
             -- function — a second rank writer is how two leaderboards start
             -- disagreeing about who won.
             ORDER BY t.duel_points   DESC,
                      t.total_points  DESC,
                      t.exact_count   DESC,
                      t.correct_count DESC,
                      t.bonus_points  DESC,
                      -- rung 5: joined and picked first (decision 3). It cannot
                      -- be pool_entries.predictions_submitted_at — that column
                      -- stays NULL for every league entry by design.
                      COALESCE(
                        (SELECT min(lp.created_at) FROM league_predictions lp
                          WHERE lp.entry_id = t.entry_id),
                        'infinity'::timestamptz
                      ) ASC,
                      -- total order, so an unrelated re-score never reshuffles
                      t.entry_id ASC
           )::int AS new_rank
      FROM league_entry_totals t
      JOIN pool_entries pe ON pe.entry_id = t.entry_id
     WHERE t.pool_id = p_pool_id
       AND pe.member_id IS NOT NULL   -- detached: left or was removed
       AND pe.retired_at IS NULL      -- retired: stopped participating
  )
  UPDATE league_entry_totals t
     SET final_rank = r.new_rank,
         updated_at = now()
    FROM ranked r
   WHERE t.entry_id = r.entry_id
     AND t.final_rank IS DISTINCT FROM r.new_rank;
  GET DIAGNOSTICS v_ranked = ROW_COUNT;

  -- ...and everyone else has theirs cleared, so a retired entry cannot leave a
  -- hole in the visible order or show a stale position if it is ever rendered.
  UPDATE league_entry_totals t
     SET final_rank = NULL, previous_final_rank = NULL, updated_at = now()
    FROM pool_entries pe
   WHERE pe.entry_id = t.entry_id
     AND t.pool_id = p_pool_id
     AND (pe.member_id IS NULL OR pe.retired_at IS NOT NULL)
     AND (t.final_rank IS NOT NULL OR t.previous_final_rank IS NOT NULL);

  RETURN v_ranked;
END;
$fn$;

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

  -- Recomputed from the duels, never incremented — a corrected fixture has to be
  -- able to take duel points back, exactly as the fixture engine does.
  UPDATE league_entry_totals t
     SET duel_points = COALESCE((
           SELECT SUM(CASE WHEN d.entry_a = t.entry_id THEN d.points_a ELSE d.points_b END)
             FROM league_duels d
            WHERE d.pool_id = p_pool_id
              AND d.settled_at IS NOT NULL
              AND (d.entry_a = t.entry_id OR d.entry_b = t.entry_id)
         ), 0),
         updated_at = now()
   WHERE t.pool_id = p_pool_id;

  PERFORM league_finalize_ranks(p_pool_id);

  RETURN jsonb_build_object('settled', v_settled, 'matchweek', p_matchweek_number);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.league_settle_duels_on_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pool record;
BEGIN
  -- Fires exactly when a matchweek becomes both fully played and fully SCORED —
  -- `ranks_snapshot_at` going non-NULL is already that moment, and migration 061
  -- is what made it mean "scored" rather than merely "finished".
  --
  -- A trigger rather than a call inside league_snapshot_matchweek_ranks: this is
  -- additive, so the live snapshot function is not rewritten to add a mode it
  -- knows nothing about.
  FOR v_pool IN
    SELECT p.pool_id FROM pools p
     WHERE p.league_season_id = NEW.season_id
       AND p.league_mode = 'showdown'
       AND p.archived_at IS NULL
  LOOP
    PERFORM league_score_duels(v_pool.pool_id, NEW.matchweek_number);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_league_settle_duels ON league_matchweeks;
CREATE TRIGGER trg_league_settle_duels
  AFTER UPDATE OF ranks_snapshot_at ON league_matchweeks
  FOR EACH ROW
  WHEN (OLD.ranks_snapshot_at IS NULL AND NEW.ranks_snapshot_at IS NOT NULL)
  EXECUTE FUNCTION league_settle_duels_on_snapshot();
