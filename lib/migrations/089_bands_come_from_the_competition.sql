-- =============================================================
-- 089 — THE BANDS COME FROM THE COMPETITION, NOT FROM ENGLAND
-- =============================================================
-- `table_top_n` and `table_relegation_n` defaulted to **4 and 3** — Premier
-- League numbers — and nothing ever wrote a `league_pool_settings` row, so every
-- pool in every competition was scored against England's shape.
--
-- Correct for the Premier League and for La Liga by luck. **Silently wrong**
-- for a twelve-club league, where a "top four" bonus covers a third of the
-- table; and for a league that relegates one club, or none, where three
-- relegation bonuses would be paid for places that do not exist. Nobody would
-- have been told. The numbers would just be wrong all season.
--
-- ## Where the real numbers come from
--
-- The standings feed already says it, and `league_standings.description` already
-- stores it. Live Premier League data, verified:
--
--   rank 1-4   "Promotion - Champions League (League phase)"   -> top_n = 4
--   rank 5     "Promotion - Europa League (League phase)"
--   rank 6-17   null
--   rank 18-20 "Relegation - Championship"                     -> relegation_n = 3
--
-- So deriving reproduces 4 and 3 for England — confirmed rather than assumed —
-- and produces the right numbers everywhere else for free. It is the same source
-- the Table tab already uses for its band stripes, which also means the shading
-- and the scoring can no longer disagree.
--
-- ## Three sources, in order, and it says which it used
--
--   1. `league_standings_final` — the frozen finishing table, if the season is
--      over. Bands that scored a paid award must not move afterwards.
--   2. `league_standings` — the live table.
--   3. **Proportional to club count**, if no row carries a description at all.
--      A last resort, not a preference: 20% and 15% are the Premier League's own
--      ratios, which is the only defensible thing to extrapolate from when the
--      feed has told us nothing. `source` says `proportional` when this fires,
--      so a wrong band is visible rather than assumed.
--
-- An explicit `league_pool_settings` value still wins over all three. An admin
-- who typed a number meant it.
-- =============================================================

CREATE OR REPLACE FUNCTION public.league_default_bands(p_season_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_final    boolean;
  v_described integer;
  v_top      integer;
  v_releg    integer;
  v_clubs    integer;
BEGIN
  -- The snapshot keeps only what scoring needs, so it carries no `description`
  -- of its own. Its existence still matters: once the season is frozen the feed
  -- has stopped moving the bands, and `source` says so rather than leaving a
  -- reader to wonder whether a band could still shift.
  v_final := EXISTS (SELECT 1 FROM league_standings_final f WHERE f.season_id = p_season_id);

  SELECT count(*) FILTER (WHERE s.description IS NOT NULL),
         count(*) FILTER (WHERE s.description ILIKE '%champions league%'),
         count(*) FILTER (WHERE s.description ILIKE '%relegation%')
    INTO v_described, v_top, v_releg
    FROM league_standings s
   WHERE s.season_id = p_season_id;

  IF COALESCE(v_described, 0) > 0 THEN
    RETURN jsonb_build_object(
      'top_n', LEAST(v_top, 10),
      'relegation_n', LEAST(v_releg, 10),
      'source', CASE WHEN v_final THEN 'feed_final' ELSE 'feed' END
    );
  END IF;

  -- Nothing to read. Extrapolate from the one thing we do know, and say so.
  SELECT club_count INTO v_clubs FROM league_seasons WHERE season_id = p_season_id;
  v_clubs := COALESCE(v_clubs, 20);

  RETURN jsonb_build_object(
    'top_n', LEAST(GREATEST(1, ROUND(v_clubs * 0.20)::int), 10),
    'relegation_n', LEAST(GREATEST(1, ROUND(v_clubs * 0.15)::int), 10),
    'source', 'proportional'
  );
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
  v_bands        jsonb;
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
         COALESCE(s.table_relegation_n, (v_bands->>'relegation_n')::int)
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
    'profile',  v_profile,
    -- Surfaced so an operator can see WHICH bands scored a pool, and where they
    -- came from, without reading the standings table to work it out.
    'bands',    v_bands
  );
END;
$fn$;

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
  v_bands       jsonb;
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
