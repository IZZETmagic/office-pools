-- =============================================================
-- 112 — A BAND IS A RUN, NOT A COUNT
-- =============================================================
-- Migrations 089/090/092 derive the scoring bands from api-football's
-- `description` column. Every string they were measured against was pulled on
-- 2026-08-24 — **before any cup had been won**. That is the one time of year the
-- data is simple, and the derivation quietly depends on it.
--
-- At season end the feed also tags **cup winners**, and a cup winner is wherever
-- they finished. Pulled from `/standings` on 2026-08-28 for completed seasons:
--
--   ENG 2023/24   Europa tagged at ranks 5 and 8      (Man Utd, FA Cup)
--   ENG 2024/25   Europa at 6 and 12                  (Crystal Palace, FA Cup)
--                 Champions League at 1-5 and 17      (Tottenham, won the EL)
--   ENG 2025/26   Europa at 6, 7 and 15
--   ESP 2025/26   Europa at 6 and 10                  (Copa del Rey)
--
-- The tagged rows are no longer one block at the top of the table, and both
-- bands assumed they were:
--
--   * the top band counted every `%champions league%` row, so 2024/25 derived
--     **top_n = 6** — six clubs paid a Champions League bonus when five
--     qualified, because the sixth tag is 17th-placed Tottenham.
--   * the Europa band took `min(rank)..max(rank)`, so 2025/26 derived
--     **6..15 — ten clubs**. Migration 092 sized that band at 50 points,
--     ~1.4% of a perfect entry. Ten clubs pay **500**.
--
-- ⚠ And it fires at exactly the wrong moment. Migration 091 freezes
-- `description` into `league_standings_final`, and 092 reads the frozen labels
-- once they exist — so the band is right all season and wrong on the day it
-- pays the award. Nothing is visibly broken until then.
--
-- ## The fix
--
-- **A league-position band is a contiguous run from a known anchor.** Winning a
-- cup is not a league position, so a club that qualified that way is not in the
-- band, however the feed labels it. Concretely:
--
--   * the top band runs from the first rank, and ends at the first rank that is
--     not a Champions League place. 2024/25 → 5, not 6.
--   * the Europa band starts at the lowest Europa-tagged rank — it still does
--     not start at 1, which is why 092 made it bounds — and ends at the first
--     rank after that which is not Europa. 2025/26 → 6..7, not 6..15.
--
-- Read as a run, every one of the eight competitions verified in
-- `scripts/verify-league-bands.ts` derives exactly what it derived before; the
-- four completed seasons added to that file are the ones this changes.
--
-- ## What is deliberately NOT changed
--
-- **Relegation stays a count.** No observed table scatters a relegation tag —
-- there is no cup you win to get relegated — and its two guards already handle
-- the pathological cases (Scotland's six-club `"Relegation Group"`). Changing a
-- band with no demonstrated failure is how a fix becomes a regression.
--
-- **Nothing is estimated.** The proportional fallbacks are untouched, and no
-- band is invented where the feed is silent. England's Conference place is
-- unnamed until the cups resolve; it is left unnamed rather than guessed at from
-- an offset, and the feed does name it formally at season end when it matters.
-- =============================================================

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
  v_clubs      integer;
  v_top_n      integer;
  v_top_src    text;
  v_rel_n      integer;
  v_rel_src    text;
  v_eur_src    text;
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
           -- Still a bound, not an offset: Europa does not start at rank 1, and
           -- `top_n + 1` lands on Ligue 1's unnamed qualifier (migration 092).
           min(rank) FILTER (WHERE description ILIKE '%europa league%') AS eur_lo
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
  )
  SELECT b.described,
         b.rel,
         b.rel_group,
         -- The run from the top. Zero when rank 1 is not a Champions League
         -- place, which is how a league without them falls to proportional.
         COALESCE(cb.r, b.hi + 1) - b.lo,
         b.eur_lo,
         CASE WHEN b.eur_lo IS NULL THEN NULL::int ELSE COALESCE(eb.r - 1, b.hi) END
    INTO v_described, v_rel, v_rel_group, v_cl, v_eur_from, v_eur_to
    FROM bounds b, cl_break cb, eur_break eb;

  -- Nothing described at all: the feed has told us nothing, so extrapolate from
  -- the only thing we know and say plainly that we did. No Europa band is
  -- invented here — a guessed continental place is not worth guessing.
  IF COALESCE(v_described, 0) = 0 THEN
    RETURN jsonb_build_object(
      'top_n',        LEAST(GREATEST(1, ROUND(v_clubs * 0.20)::int), 10),
      'relegation_n', LEAST(GREATEST(1, ROUND(v_clubs * 0.15)::int), 10),
      'europa_from',  NULL, 'europa_to', NULL,
      'top_source',        'proportional',
      'relegation_source', 'proportional',
      'europa_source',     'none',
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

  -- ---- the Europa band ----
  -- Read or absent. Never extrapolated: a league without European places should
  -- not be paying for them, and there is no ratio that could tell us otherwise.
  v_eur_src := CASE WHEN v_eur_from IS NULL THEN 'none' ELSE v_feed_src END;

  RETURN jsonb_build_object(
    'top_n',             v_top_n,
    'relegation_n',      v_rel_n,
    'europa_from',       v_eur_from,
    'europa_to',         v_eur_to,
    'top_source',        v_top_src,
    'relegation_source', v_rel_src,
    'europa_source',     v_eur_src,
    'source', CASE
                WHEN v_top_src = 'proportional' OR v_rel_src IN ('proportional', 'unclear')
                  THEN 'partial'
                ELSE v_feed_src
              END
  );
END;
$fn$;
