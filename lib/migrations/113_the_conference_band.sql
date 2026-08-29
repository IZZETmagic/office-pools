-- =============================================================
-- 113 — THE CONFERENCE BAND
-- =============================================================
-- The third European competition, scored like the other two.
--
-- ⚠ THIS MIGRATION CARRIES 112'S CONTIGUITY FIX IN FULL. 112 was applied to a
-- branch rather than production, so `league_default_bands` here is the complete
-- corrected body — applying 113 alone lands both. Read 112's header for why a
-- band is a run and not a count; it is not repeated.
--
-- ## Why this is readable now, when 092 said it was not
--
-- Migration 092 declined to build this band, and gave a measured reason: Spain
-- called it `"ECL Playoffs"`, Italy and France just `"Play-offs"`, so three of
-- the five leagues that have a Conference place did not name it. That
-- measurement was taken on 2026-08-24 — in AUGUST, before a cup had been won.
--
-- Re-measured on 2026-08-28 against seasons that have FINISHED, every one of
-- them names it:
--
--   ENG 2023/24  rank 6  "Promotion - Europa Conference League (Qualification: )"
--   ENG 2024/25  rank 7  "Conference League Qualification"
--   ENG 2025/26  rank 8  "Promotion - Conference League (Qualification)"
--   ESP 2025/26  rank 7  "Promotion - Conference League (Qualification)"
--   ITA 2025/26  rank 7  "Promotion - Conference League (Qualification)"
--   FRA 2025/26  rank 7  "Conference League Qualification"
--   GER 2025/26  rank 7  "Conference League Qualification"
--
-- `%conference league%` matches all seven. The `"ECL Playoffs"` and
-- `"Play-offs"` strings were PLACEHOLDERS for a place not yet decided, not the
-- league's final word — and Table mode pays at season end, which is exactly
-- when the final word exists. So nothing here is estimated: the band is read,
-- or it is absent.
--
-- ⚠ The two filters cannot collide. `"Europa Conference League"` does not
-- contain `"europa league"` — "Europa" is followed by "Conference" — so the
-- 2023/24 vintage string lands in this band and not the Europa one. Verified
-- against all seven tables above.
--
-- ## What it is worth
--
-- **25 a club, order-free — half the Europa band, which is half the top band.**
-- Each European tier is worth half the one above it, which is both the real
-- hierarchy and a rule that fits in a sentence. A perfect Premier League entry
-- goes from 3,550 to 3,575: +0.7%, so decision 10's 12-15% sizing for the Table
-- slice is unchanged, as it was when 092 added Europa.
--
-- ## Two things to know before a second league
--
-- **The band APPEARS mid-season for most leagues.** England tags nothing at
-- rank 6-17 in August and tags Conference by May. That is already true of the
-- Europa band — England reads 5-5 in August and 6-7 at season end — and
-- migration 091's freeze is what stops it moving again after the award. It is
-- worth saying on screen rather than in a migration: the European places are
-- whatever the final table says they are.
--
-- **The Eredivisie would pay four clubs.** Its Conference rows are a four-club
-- PLAY-OFF BRACKET (ranks 4-7), not four qualification places, so the band
-- reads 4-7 and pays four. That is what the feed says and reading it is not
-- guessing, but it is a different thing from one place — worth an explicit
-- decision before a Dutch league ships. Moot until then.
-- =============================================================

ALTER TABLE league_pool_settings
  ADD COLUMN IF NOT EXISTS table_conference_bonus integer NOT NULL DEFAULT 25;

COMMENT ON COLUMN league_pool_settings.table_conference_bonus IS
  'Per club correct in the Conference band, order-free. Half the Europa band, which is half the top band.';

ALTER TABLE league_pool_settings DROP CONSTRAINT IF EXISTS lps_non_negative_ck;
ALTER TABLE league_pool_settings ADD CONSTRAINT lps_non_negative_ck CHECK (
  table_exact_points >= 0 AND table_step_penalty >= 0
  AND table_champion_bonus >= 0 AND table_top_four_bonus >= 0
  AND table_relegation_bonus >= 0 AND table_perfect_top_four_bonus >= 0
  AND table_europa_bonus >= 0 AND table_conference_bonus >= 0
);

-- ---------------------------------------------------------------- the bands

CREATE OR REPLACE FUNCTION public.league_default_bands(p_season_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_final      boolean;
  v_described  integer;
  v_cl         integer;
  v_rel        integer;
  v_rel_group  integer;
  v_eur_from   integer;
  v_eur_to     integer;
  v_conf_from  integer;
  v_conf_to    integer;
  v_clubs      integer;
  v_top_n      integer;
  v_top_src    text;
  v_rel_n      integer;
  v_rel_src    text;
  v_eur_src    text;
  v_conf_src   text;
  v_feed_src   text;
BEGIN
  SELECT club_count INTO v_clubs FROM league_seasons WHERE season_id = p_season_id;
  v_clubs := COALESCE(v_clubs, 20);

  v_final := EXISTS (SELECT 1 FROM league_standings_final f WHERE f.season_id = p_season_id);
  v_feed_src := CASE WHEN v_final THEN 'feed_final' ELSE 'feed' END;

  -- Read the FROZEN labels once the season is over, and the live ones only
  -- before then. Same rule the ranks already follow, for the same reason.
  WITH src AS (
    SELECT f.description, f.rank FROM league_standings_final f
     WHERE f.season_id = p_season_id AND v_final
    UNION ALL
    SELECT s.description, s.rank FROM league_standings s
     WHERE s.season_id = p_season_id AND NOT v_final
  ),
  bounds AS (
    SELECT min(rank) AS lo,
           max(rank) AS hi,
           count(*) FILTER (WHERE description IS NOT NULL) AS described,
           count(*) FILTER (WHERE description ILIKE '%relegation%'
                              AND description NOT ILIKE '%group%') AS rel,
           count(*) FILTER (WHERE description ILIKE '%relegation%'
                              AND description ILIKE '%group%') AS rel_group,
           -- Bounds, not offsets: neither European band starts at rank 1, and
           -- `top_n + 1` lands on Ligue 1's unnamed qualifier (migration 092).
           min(rank) FILTER (WHERE description ILIKE '%europa league%') AS eur_lo,
           -- Cannot overlap the line above: "Europa Conference League" does not
           -- contain "europa league".
           min(rank) FILTER (WHERE description ILIKE '%conference league%') AS conf_lo
      FROM src
  ),
  -- Where each run STOPS: the first rank the tag no longer covers. Everything
  -- tagged below that break qualified some other way — a cup — and a cup is not
  -- a league position.
  cl_break AS (
    SELECT min(s.rank) AS r
      FROM src s, bounds b
     WHERE s.rank >= b.lo
       AND (s.description IS NULL OR s.description NOT ILIKE '%champions league%')
  ),
  eur_break AS (
    SELECT min(s.rank) AS r
      FROM src s, bounds b
     WHERE b.eur_lo IS NOT NULL
       AND s.rank > b.eur_lo
       AND (s.description IS NULL OR s.description NOT ILIKE '%europa league%')
  ),
  conf_break AS (
    SELECT min(s.rank) AS r
      FROM src s, bounds b
     WHERE b.conf_lo IS NOT NULL
       AND s.rank > b.conf_lo
       AND (s.description IS NULL OR s.description NOT ILIKE '%conference league%')
  )
  SELECT b.described,
         b.rel,
         b.rel_group,
         -- The run from the top. Zero when rank 1 is not a Champions League
         -- place, which is how a league without them falls to proportional.
         COALESCE(cb.r, b.hi + 1) - b.lo,
         b.eur_lo,
         CASE WHEN b.eur_lo IS NULL THEN NULL::int ELSE COALESCE(eb.r - 1, b.hi) END,
         b.conf_lo,
         CASE WHEN b.conf_lo IS NULL THEN NULL::int ELSE COALESCE(fb.r - 1, b.hi) END
    INTO v_described, v_rel, v_rel_group, v_cl, v_eur_from, v_eur_to, v_conf_from, v_conf_to
    FROM bounds b, cl_break cb, eur_break eb, conf_break fb;

  -- Nothing described at all: the feed has told us nothing, so extrapolate from
  -- the only thing we know and say plainly that we did. No European band is
  -- invented here — a guessed continental place is not worth guessing.
  IF COALESCE(v_described, 0) = 0 THEN
    RETURN jsonb_build_object(
      'top_n',        LEAST(GREATEST(1, ROUND(v_clubs * 0.20)::int), 10),
      'relegation_n', LEAST(GREATEST(1, ROUND(v_clubs * 0.15)::int), 10),
      'europa_from',  NULL, 'europa_to', NULL,
      'conference_from', NULL, 'conference_to', NULL,
      'top_source',        'proportional',
      'relegation_source', 'proportional',
      'europa_source',     'none',
      'conference_source', 'none',
      'source',            'proportional'
    );
  END IF;

  -- ---- the top band ----
  IF v_cl > 0 THEN
    v_top_n := LEAST(v_cl, 10);
    v_top_src := v_feed_src;
  ELSE
    v_top_n := LEAST(GREATEST(1, ROUND(v_clubs * 0.20)::int), 10);
    v_top_src := 'proportional';
  END IF;

  -- ---- the relegation band ----
  -- Deliberately still a count: nothing a club can win puts it in this band, so
  -- it does not scatter the way the European ones do.
  IF v_rel_group > 0 THEN
    v_rel_n := LEAST(GREATEST(1, ROUND(v_clubs * 0.15)::int), 10);
    v_rel_src := 'unclear';
  ELSIF v_rel > GREATEST(1, v_clubs / 4) THEN
    v_rel_n := LEAST(GREATEST(1, ROUND(v_clubs * 0.15)::int), 10);
    v_rel_src := 'unclear';
  ELSE
    v_rel_n := v_rel;
    v_rel_src := v_feed_src;
  END IF;

  -- ---- the European bands ----
  -- Read or absent, both of them. Never extrapolated: a league without European
  -- places should not be paying for them, and there is no ratio that could tell
  -- us otherwise.
  v_eur_src  := CASE WHEN v_eur_from IS NULL THEN 'none' ELSE v_feed_src END;
  v_conf_src := CASE WHEN v_conf_from IS NULL THEN 'none' ELSE v_feed_src END;

  RETURN jsonb_build_object(
    'top_n',             v_top_n,
    'relegation_n',      v_rel_n,
    'europa_from',       v_eur_from,
    'europa_to',         v_eur_to,
    'conference_from',   v_conf_from,
    'conference_to',     v_conf_to,
    'top_source',        v_top_src,
    'relegation_source', v_rel_src,
    'europa_source',     v_eur_src,
    'conference_source', v_conf_src,
    'source', CASE
                WHEN v_top_src = 'proportional' OR v_rel_src IN ('proportional', 'unclear')
                  THEN 'partial'
                ELSE v_feed_src
              END
  );
END;
$fn$;

-- ---------------------------------------------------------------- the score

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
  v_conf_bonus   integer;
  v_conf_from    integer;
  v_conf_to      integer;
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
         COALESCE(s.table_europa_bonus, 50),
         COALESCE(s.table_conference_bonus, 25)
    INTO v_exact, v_penalty, v_champ, v_top_bonus, v_releg_bonus, v_perfect, v_top_n, v_releg_n, v_eur_bonus,
         v_conf_bonus
    FROM (SELECT 1) x
    LEFT JOIN league_pool_settings s ON s.pool_id = p_pool_id;

  -- Rank bounds, not a count — Europa does not start at 1 (see migration 092).
  -- NULL when the competition has no Europa places, and every comparison below
  -- then yields NULL, which the CASE reads as "no", so the band simply pays
  -- nothing rather than needing a guard of its own.
  v_eur_from  := (v_bands->>'europa_from')::int;
  v_eur_to    := (v_bands->>'europa_to')::int;
  v_conf_from := (v_bands->>'conference_from')::int;
  v_conf_to   := (v_bands->>'conference_to')::int;

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
                     AND actual_position   BETWEEN v_eur_from AND v_eur_to THEN 1 ELSE 0 END)::int AS europa_hits,
           SUM(CASE WHEN predicted_position BETWEEN v_conf_from AND v_conf_to
                     AND actual_position   BETWEEN v_conf_from AND v_conf_to THEN 1 ELSE 0 END)::int AS conference_hits
      FROM paired GROUP BY entry_id
  ),
  totals AS (
    SELECT e.entry_id,
           CASE WHEN v_profile = 'full_table' THEN COALESCE(g.positional, 0) ELSE 0 END
           + COALESCE(g.champion_hit, 0) * v_champ
           + COALESCE(g.top_hits, 0)     * v_top_bonus
           + CASE WHEN COALESCE(g.top_hits, 0) = v_top_n AND v_top_n > 0 THEN v_perfect ELSE 0 END
           + COALESCE(g.releg_hits, 0)   * v_releg_bonus
           + COALESCE(g.europa_hits, 0)  * v_eur_bonus
           + COALESCE(g.conference_hits, 0) * v_conf_bonus AS bonus
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

-- ------------------------------------------------------------ the breakdown
--
-- DROP first: the RETURNS TABLE signature gains `conference_hit`, and CREATE OR
-- REPLACE cannot change a function's output columns.
--
-- ⚠ A DROP TAKES THE GRANTS WITH IT. Migration 102 revoked PUBLIC/anon EXECUTE
-- on this function and granted it to service_role and authenticated; recreating
-- it without re-applying that would silently restore the default PUBLIC grant
-- and reopen what 102 closed. The two lines are repeated verbatim below.

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
  conference_hit     boolean,
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
  v_conf_from   integer;
  v_conf_to     integer;
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

  v_eur_from  := (v_bands->>'europa_from')::int;
  v_eur_to    := (v_bands->>'europa_to')::int;
  v_conf_from := (v_bands->>'conference_from')::int;
  v_conf_to   := (v_bands->>'conference_to')::int;

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
    COALESCE(tp.predicted_position BETWEEN v_conf_from AND v_conf_to
             AND a.rank            BETWEEN v_conf_from AND v_conf_to, false) AS conference_hit,
    v_is_final AS is_final
  FROM league_table_predictions tp
  JOIN league_clubs lc ON lc.club_id = tp.club_id
  LEFT JOIN actual a ON a.club_id = tp.club_id
  WHERE tp.entry_id = p_entry_id
  ORDER BY tp.predicted_position;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.league_table_breakdown(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.league_table_breakdown(uuid) TO service_role, authenticated;
