-- =============================================================
-- 093 — THE EUROPA BAND, PAID AND SHOWN
-- =============================================================
-- Migration 092 derives where the Europa places are. This pays for them.
--
--   50 a club, order-free, for finishing in the band the feed marks Europa.
--
-- Half the top band, because fifth is worth less than fourth and the scoring
-- should say so out loud. Set-based like the others: who takes the places is the
-- argument; the order inside them is already paid by the positional term.
--
-- ⚠ The band is a pair of RANK BOUNDS, not a count — Europa does not start at
-- rank 1, and an offset from the top band would land on Ligue 1's unnamed
-- `" Qualifying"` row. When a competition has no Europa places the bounds are
-- NULL, every `BETWEEN` yields NULL, and the CASE reads that as "no" — so the
-- band pays nothing without needing a guard of its own.
--
-- `league_table_breakdown` is DROPped and recreated rather than replaced: its
-- RETURNS TABLE gains `europa_hit`, and CREATE OR REPLACE cannot change a
-- function's output columns.
-- =============================================================

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
  v_bands        jsonb;
  v_eur_bonus    integer;
  v_eur_from     integer;
  v_eur_to       integer;
  v_scored       integer := 0;
BEGIN
  SELECT po.league_season_id, po.league_mode, COALESCE(po.league_table_profile, 'full_table')
    INTO v_season, v_mode, v_profile
    FROM pools po WHERE po.pool_id = p_pool_id;

  IF v_mode IS DISTINCT FROM 'table' OR v_season IS NULL THEN
    RETURN jsonb_build_object('skipped', 'not a table pool');
  END IF;

  -- The BAND SIZES come from the competition, not from a literal. 4 and 3 are
  -- Premier League numbers; a league that relegates one, or none, was being
  -- scored against England's shape with nothing to say so.
  v_bands := league_default_bands(v_season);

  -- No settings row is normal: the shipped defaults ARE the product. A row only
  -- exists once a pool has moved a number — and an explicit setting still wins
  -- over the derived band, because an admin who typed a number meant it.
  SELECT COALESCE(s.table_exact_points, 100),
         COALESCE(s.table_step_penalty, 20),
         COALESCE(s.table_champion_bonus, 500),
         COALESCE(s.table_top_four_bonus, 100),
         COALESCE(s.table_relegation_bonus, 100),
         COALESCE(s.table_perfect_top_four_bonus, 250),
         COALESCE(s.table_top_n, (v_bands->>'top_n')::int),
         COALESCE(s.table_relegation_n, (v_bands->>'relegation_n')::int),
         COALESCE(s.table_europa_bonus, 50)
    INTO v_exact, v_penalty, v_champ, v_top_bonus, v_releg_bonus, v_perfect, v_top_n, v_releg_n, v_eur_bonus
    FROM (SELECT 1) x
    LEFT JOIN league_pool_settings s ON s.pool_id = p_pool_id;

  -- Rank bounds, not a count — Europa does not start at 1 (see migration 092).
  -- NULL when the competition has no Europa places, and every comparison below
  -- then yields NULL, which the CASE reads as "no", so the band simply pays
  -- nothing rather than needing a guard of its own.
  v_eur_from := (v_bands->>'europa_from')::int;
  v_eur_to   := (v_bands->>'europa_to')::int;

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
                     AND actual_position   > v_club_count - v_releg_n THEN 1 ELSE 0 END)::int     AS releg_hits,
           SUM(CASE WHEN predicted_position BETWEEN v_eur_from AND v_eur_to
                     AND actual_position   BETWEEN v_eur_from AND v_eur_to THEN 1 ELSE 0 END)::int AS europa_hits
      FROM paired GROUP BY entry_id
  ),
  totals AS (
    SELECT e.entry_id,
           CASE WHEN v_profile = 'full_table' THEN COALESCE(g.positional, 0) ELSE 0 END
           + COALESCE(g.champion_hit, 0) * v_champ
           + COALESCE(g.top_hits, 0)     * v_top_bonus
           + CASE WHEN COALESCE(g.top_hits, 0) = v_top_n AND v_top_n > 0 THEN v_perfect ELSE 0 END
           + COALESCE(g.releg_hits, 0)   * v_releg_bonus
           + COALESCE(g.europa_hits, 0)  * v_eur_bonus AS bonus
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
    'profile',  v_profile,
    -- Surfaced so an operator can see WHICH bands scored a pool, and where they
    -- came from, without reading the standings table to work it out.
    'bands',    v_bands
  );
END;
$fn$;

-- DROP first: the RETURNS TABLE signature gains `europa_hit`, and CREATE OR
-- REPLACE cannot change a function's output columns.
DROP FUNCTION IF EXISTS public.league_table_breakdown(uuid);
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
  europa_hit         boolean,
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
  v_bands       jsonb;
  v_eur_from    integer;
  v_eur_to      integer;
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

  -- Same bands the engine used. Read from one definition rather than repeated,
  -- because a breakdown that shaded a different band than the one it was scored
  -- against would be the screen contradicting the leaderboard again.
  v_bands := league_default_bands(v_season);

  SELECT COALESCE(s.table_exact_points, 100),
         COALESCE(s.table_step_penalty, 20),
         COALESCE(s.table_champion_bonus, 500),
         COALESCE(s.table_top_four_bonus, 100),
         COALESCE(s.table_relegation_bonus, 100),
         COALESCE(s.table_top_n, (v_bands->>'top_n')::int),
         COALESCE(s.table_relegation_n, (v_bands->>'relegation_n')::int)
    INTO v_exact, v_penalty, v_champ, v_top_bonus, v_releg_bonus, v_top_n, v_releg_n
    FROM (SELECT 1) x
    LEFT JOIN league_pool_settings s ON s.pool_id = v_pool_id;

  v_eur_from := (v_bands->>'europa_from')::int;
  v_eur_to   := (v_bands->>'europa_to')::int;

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
    COALESCE(tp.predicted_position BETWEEN v_eur_from AND v_eur_to
             AND a.rank            BETWEEN v_eur_from AND v_eur_to, false) AS europa_hit,
    v_is_final AS is_final
  FROM league_table_predictions tp
  JOIN league_clubs lc ON lc.club_id = tp.club_id
  LEFT JOIN actual a ON a.club_id = tp.club_id
  WHERE tp.entry_id = p_entry_id
  ORDER BY tp.predicted_position;
END;
$fn$;
