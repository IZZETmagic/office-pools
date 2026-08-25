-- =============================================================
-- 082 — FIX: league_clubs has `name`, not `club_name`
-- =============================================================
-- Migration 081 selected `lc.club_name`. That column does not exist — the
-- column is `league_clubs.name`, and the reads that already worked
-- (`readLeagueStandings`, `league_actual_table`) all join and alias it.
--
-- ⚠ 081 APPLIED CLEANLY ANYWAY. plpgsql does not resolve column references at
-- CREATE time, only when the function first runs, so a wrong column name in a
-- plpgsql body is accepted silently and fails later in front of a member. A
-- language-sql function would have been rejected on the spot.
--
-- This is the same shape as the recorded DROP COLUMN outage: code naming a
-- column that is not there, with nothing between it and production except
-- somebody running it. Caught here by writing the verification script, which
-- needed the real column names to build its scratch season.
--
-- 081 is left on disk as applied rather than edited, so the file and the
-- database still agree about what happened and when.
-- =============================================================

CREATE OR REPLACE FUNCTION public.league_table_breakdown(p_entry_id uuid)
RETURNS TABLE (
  club_id            uuid,
  club_name          text,
  crest_url          text,
  predicted_position integer,
  actual_position    integer,
  delta              integer,
  points             integer,
  champion_hit       boolean,
  top_hit            boolean,
  releg_hit          boolean,
  is_final           boolean
)
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  v_pool_id     uuid;
  v_season      uuid;
  v_profile     text;
  v_exact       integer;
  v_penalty     integer;
  v_top_bonus   integer;
  v_releg_bonus integer;
  v_champ       integer;
  v_top_n       integer;
  v_releg_n     integer;
  v_club_count  integer;
  v_is_final    boolean;
BEGIN
  -- SECURITY INVOKER on purpose. This reads one entry's predictions, and RLS on
  -- league_table_predictions is what decides whether the caller may see them:
  -- their own always, everyone else's only after league_table_lock_at. A
  -- DEFINER function here would hand any member every rival's prediction while
  -- the window was still open, which is the one thing the lock exists to stop.
  SELECT pm.pool_id, po.league_season_id, COALESCE(po.league_table_profile, 'full_table')
    INTO v_pool_id, v_season, v_profile
    FROM pool_entries pe
    JOIN pool_members pm ON pe.member_id = pm.member_id
    JOIN pools po ON po.pool_id = pm.pool_id
   WHERE pe.entry_id = p_entry_id;

  IF v_pool_id IS NULL OR v_season IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(s.table_exact_points, 100),
         COALESCE(s.table_step_penalty, 20),
         COALESCE(s.table_champion_bonus, 500),
         COALESCE(s.table_top_four_bonus, 100),
         COALESCE(s.table_relegation_bonus, 100),
         COALESCE(s.table_top_n, 4),
         COALESCE(s.table_relegation_n, 3)
    INTO v_exact, v_penalty, v_champ, v_top_bonus, v_releg_bonus, v_top_n, v_releg_n
    FROM (SELECT 1) x
    LEFT JOIN league_pool_settings s ON s.pool_id = v_pool_id;

  SELECT count(*) INTO v_club_count FROM league_clubs lc WHERE lc.season_id = v_season;
  v_is_final := EXISTS (SELECT 1 FROM league_standings_final f WHERE f.season_id = v_season);

  RETURN QUERY
  WITH actual AS (
    SELECT f.club_id, f.rank FROM league_standings_final f WHERE f.season_id = v_season
    UNION ALL
    SELECT s.club_id, s.rank FROM league_standings s
     WHERE s.season_id = v_season
       AND NOT EXISTS (SELECT 1 FROM league_standings_final f2 WHERE f2.season_id = v_season)
  )
  SELECT
    tp.club_id,
    lc.name AS club_name,
    lc.crest_url,
    tp.predicted_position,
    a.rank AS actual_position,
    CASE WHEN a.rank IS NULL THEN NULL ELSE a.rank - tp.predicted_position END AS delta,
    CASE
      WHEN a.rank IS NULL THEN NULL
      WHEN v_profile <> 'full_table' THEN 0
      ELSE GREATEST(0, v_exact - v_penalty * abs(tp.predicted_position - a.rank))
    END AS points,
    (tp.predicted_position = 1 AND a.rank = 1) AS champion_hit,
    (tp.predicted_position <= v_top_n AND a.rank <= v_top_n) AS top_hit,
    (tp.predicted_position > v_club_count - v_releg_n
     AND a.rank           > v_club_count - v_releg_n) AS releg_hit,
    v_is_final AS is_final
  FROM league_table_predictions tp
  JOIN league_clubs lc ON lc.club_id = tp.club_id
  LEFT JOIN actual a ON a.club_id = tp.club_id
  WHERE tp.entry_id = p_entry_id
  ORDER BY tp.predicted_position;
END;
$fn$;
