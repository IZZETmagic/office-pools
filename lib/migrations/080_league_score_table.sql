-- =============================================================
-- 080 — TABLE MODE'S SCORING ENGINE, and the snapshot it pays out from
-- =============================================================
-- Plan §3.5 (prices), §0.2 (Table is a mode), §0.3 (the feed is the truth) and
-- decisions 9, 10 and 11.
--
-- ## Three functions, one job each
--
--   league_snapshot_final_standings  freezes the finishing table, once
--   league_score_table               scores one pool against it
--   league_after_standings_change    what the sync calls: snapshot, then score
--
-- ## Why the snapshot exists at all
--
-- `league_standings` is UPSERTED current state. If a member is paid 500 points
-- for calling the champion in May and the feed issues a correction in June, the
-- upsert would silently restate an award that had already been announced —
-- which is the "no bad feelings" clause failing in the least recoverable way.
-- So the moment the season is genuinely over the table is copied once, and from
-- then on scoring reads the copy. It is never retaken.
--
-- ## Why scoring is LIVE before then — decision 9
--
-- Recomputed whenever the table moves, labelled *provisional* until the final
-- whistle of matchweek 38. A hidden 3,500-point bank revealed on the last day
-- would be a lurch, and the recorded product memory is that the leaderboard must
-- never lag. `is_final` in the return value is what lets the UI say which it is.
--
-- ## The shape of the score
--
--   positional   max(0, exact − penalty × |predicted − actual|)   per club
--   champion     one flat bonus for calling first place
--   top N        per club correct AS A SET, order-free
--   perfect top  a further bonus for getting all N
--   relegation   per club correct AS A SET, order-free
--
-- Set-based rather than positional for the bands because "who goes down" is the
-- actual argument; the ordering inside the band is already paid for by the
-- positional term, and paying twice for it would double-count.
--
-- `headline_only` drops the positional term and keeps the bands — that is
-- Decision 9's original Final Table, preserved as a profile rather than deleted.
--
-- ## Two things that are deliberately NOT here
--
-- 1. It never touches `pool_entries`. The load-bearing constraint (plan §7.2)
--    is that no league write path sets `has_submitted_predictions` or
--    `point_adjustment` on that table — doing so opens three World Cup scoring
--    selectors to league entries. This function writes `league_entry_totals`
--    only.
-- 2. An entry with NO predictions still gets a row, worth 0. That is decision
--    11: a member who joined after the lock is read-only and scores nothing, but
--    they are still IN the pool and must appear on its leaderboard. Dropping
--    them from the totals would drop them off the standings entirely.
-- =============================================================

CREATE TABLE IF NOT EXISTS league_standings_final (
  season_id   uuid NOT NULL REFERENCES league_seasons(season_id) ON DELETE CASCADE,
  club_id     uuid NOT NULL REFERENCES league_clubs(club_id) ON DELETE CASCADE,
  rank        integer NOT NULL,
  points      integer NOT NULL,
  goals_diff  integer NOT NULL,
  played      integer NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, club_id)
);

COMMENT ON TABLE league_standings_final IS
  'The finishing table, written once when the season is over. Plan section 0.3 requires it: league_standings is upserted current state, so a feed correction in June would silently restate an award that had already been paid. Table mode scores against this the moment it exists.';

ALTER TABLE league_standings_final ENABLE ROW LEVEL SECURITY;

-- Same as league_standings: the finishing table of a public competition is not
-- anybody's private data.
DROP POLICY IF EXISTS "Final standings are world readable" ON league_standings_final;
CREATE POLICY "Final standings are world readable"
  ON league_standings_final FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.league_snapshot_final_standings(p_season_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_remaining  integer;
  v_clubs      integer;
  v_standings  integer;
  v_written    integer;
BEGIN
  -- Once taken, never retaken. This is the whole point of the snapshot: the
  -- number a member was paid on must not move afterwards.
  IF EXISTS (SELECT 1 FROM league_standings_final WHERE season_id = p_season_id) THEN
    RETURN jsonb_build_object('skipped', 'already final');
  END IF;

  SELECT count(*) INTO v_remaining
    FROM league_fixtures WHERE season_id = p_season_id AND NOT is_completed;
  IF v_remaining > 0 THEN
    RETURN jsonb_build_object('skipped', 'season not complete', 'remaining', v_remaining);
  END IF;

  SELECT count(*) INTO v_clubs FROM league_clubs WHERE season_id = p_season_id;
  SELECT count(*) INTO v_standings FROM league_standings WHERE season_id = p_season_id;

  -- A partial table would freeze holes into the record permanently. Better to
  -- take no snapshot and keep scoring live than to take a wrong one.
  IF v_clubs = 0 OR v_standings <> v_clubs THEN
    RETURN jsonb_build_object('skipped', 'standings incomplete',
                              'clubs', v_clubs, 'standings', v_standings);
  END IF;

  INSERT INTO league_standings_final (season_id, club_id, rank, points, goals_diff, played)
  SELECT season_id, club_id, rank, points, goals_diff, played
    FROM league_standings WHERE season_id = p_season_id;
  GET DIAGNOSTICS v_written = ROW_COUNT;

  RETURN jsonb_build_object('final', true, 'written', v_written);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.league_score_table(p_pool_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_season       uuid;
  v_mode         text;
  v_profile      text;
  v_exact        integer;
  v_penalty      integer;
  v_champ        integer;
  v_top_bonus    integer;
  v_releg_bonus  integer;
  v_perfect      integer;
  v_top_n        integer;
  v_releg_n      integer;
  v_club_count   integer;
  v_is_final     boolean;
  v_scored       integer := 0;
BEGIN
  SELECT po.league_season_id, po.league_mode, COALESCE(po.league_table_profile, 'full_table')
    INTO v_season, v_mode, v_profile
    FROM pools po WHERE po.pool_id = p_pool_id;

  IF v_mode IS DISTINCT FROM 'table' OR v_season IS NULL THEN
    RETURN jsonb_build_object('skipped', 'not a table pool');
  END IF;

  -- No settings row is normal: the shipped defaults ARE the product. A row only
  -- exists once a pool has moved a number.
  SELECT COALESCE(s.table_exact_points, 100),
         COALESCE(s.table_step_penalty, 20),
         COALESCE(s.table_champion_bonus, 500),
         COALESCE(s.table_top_four_bonus, 100),
         COALESCE(s.table_relegation_bonus, 100),
         COALESCE(s.table_perfect_top_four_bonus, 250),
         COALESCE(s.table_top_n, 4),
         COALESCE(s.table_relegation_n, 3)
    INTO v_exact, v_penalty, v_champ, v_top_bonus, v_releg_bonus, v_perfect, v_top_n, v_releg_n
    FROM (SELECT 1) x
    LEFT JOIN league_pool_settings s ON s.pool_id = p_pool_id;

  SELECT count(*) INTO v_club_count FROM league_clubs WHERE season_id = v_season;
  IF v_club_count = 0 THEN
    RETURN jsonb_build_object('skipped', 'season has no clubs');
  END IF;

  v_is_final := EXISTS (SELECT 1 FROM league_standings_final WHERE season_id = v_season);

  WITH actual AS (
    SELECT club_id, rank FROM league_standings_final WHERE season_id = v_season
    UNION ALL
    SELECT club_id, rank FROM league_standings
     WHERE season_id = v_season
       AND NOT EXISTS (SELECT 1 FROM league_standings_final f WHERE f.season_id = v_season)
  ),
  entries AS (
    SELECT pe.entry_id
      FROM pool_entries pe
      JOIN pool_members pm ON pe.member_id = pm.member_id
     WHERE pm.pool_id = p_pool_id
       AND pe.retired_at IS NULL
  ),
  paired AS (
    SELECT tp.entry_id, tp.predicted_position, a.rank AS actual_position
      FROM league_table_predictions tp
      JOIN entries e ON e.entry_id = tp.entry_id
      JOIN actual  a ON a.club_id  = tp.club_id
  ),
  agg AS (
    SELECT entry_id,
           SUM(GREATEST(0, v_exact - v_penalty * abs(predicted_position - actual_position)))::int AS positional,
           SUM(CASE WHEN predicted_position = 1 AND actual_position = 1 THEN 1 ELSE 0 END)::int   AS champion_hit,
           SUM(CASE WHEN predicted_position <= v_top_n AND actual_position <= v_top_n THEN 1 ELSE 0 END)::int AS top_hits,
           SUM(CASE WHEN predicted_position > v_club_count - v_releg_n
                     AND actual_position   > v_club_count - v_releg_n THEN 1 ELSE 0 END)::int     AS releg_hits
      FROM paired GROUP BY entry_id
  ),
  totals AS (
    SELECT e.entry_id,
           CASE WHEN v_profile = 'full_table' THEN COALESCE(g.positional, 0) ELSE 0 END
           + COALESCE(g.champion_hit, 0) * v_champ
           + COALESCE(g.top_hits, 0)     * v_top_bonus
           + CASE WHEN COALESCE(g.top_hits, 0) = v_top_n AND v_top_n > 0 THEN v_perfect ELSE 0 END
           + COALESCE(g.releg_hits, 0)   * v_releg_bonus AS bonus
      FROM entries e
      LEFT JOIN agg g ON g.entry_id = e.entry_id
  )
  INSERT INTO league_entry_totals (entry_id, pool_id, bonus_points, updated_at)
  SELECT entry_id, p_pool_id, bonus, now() FROM totals
  ON CONFLICT (entry_id) DO UPDATE
    SET bonus_points = EXCLUDED.bonus_points,
        updated_at   = now();
  GET DIAGNOSTICS v_scored = ROW_COUNT;

  UPDATE league_entry_totals
     SET total_points = match_points + bonus_points + point_adjustment,
         updated_at   = now()
   WHERE pool_id = p_pool_id;

  PERFORM league_finalize_ranks(p_pool_id);

  RETURN jsonb_build_object(
    'scored',   v_scored,
    'is_final', v_is_final,
    'profile',  v_profile
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.league_after_standings_change(p_season_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_snapshot jsonb;
  v_pool     record;
  v_pools    integer := 0;
BEGIN
  -- Snapshot FIRST, so that if this is the tick that ends the season, the pools
  -- below are scored against the frozen table rather than the live one.
  v_snapshot := league_snapshot_final_standings(p_season_id);

  FOR v_pool IN
    SELECT pool_id FROM pools
     WHERE league_season_id = p_season_id
       AND league_mode = 'table'
       AND archived_at IS NULL
  LOOP
    PERFORM league_score_table(v_pool.pool_id);
    v_pools := v_pools + 1;
  END LOOP;

  RETURN jsonb_build_object('snapshot', v_snapshot, 'pools_scored', v_pools);
END;
$fn$;
