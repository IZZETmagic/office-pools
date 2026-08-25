-- =============================================================
-- 092 — THE EUROPA BAND
-- =============================================================
-- A fourth thing to be right about: who takes the Europa League places.
--
-- Measured across eight competitions before building it, every league that has
-- Europa places names them — `"Promotion - Europa League (League phase)"`,
-- `"Europa League league stage"`, `"Promotion - Europa League (Qualification)"`.
-- Six of six. That is why this band is safe to add and the **Conference band is
-- not**: Spain calls that one `"ECL Playoffs"` and Italy and France just say
-- `"Play-offs"`, so a Conference band would silently pay nothing in three of the
-- five leagues that have one.
--
-- ## Why RANKS and not a count
--
-- The top band is `position <= top_n`, which works because the Champions League
-- places always start at 1. Europa does not start at 1, so it needs bounds — and
-- an offset from the top band would be **wrong for Ligue 1**, where the feed
-- reads:
--
--   1-3  "Champions League league stage"
--   4    " Qualifying"                      <- unnamed, so top_n stays 3
--   5    "Europa League league stage"
--
-- `top_n + 1` would put the Europa band on rank 4, which is a Champions League
-- qualifier. So the bounds are read directly: MIN and MAX rank of the clubs the
-- feed tags Europa. France gets 5-5, Germany 5-6, the Netherlands 3-3.
--
-- ## What it is worth
--
-- **50 a club — half the top band**, because finishing fifth is worth less than
-- finishing fourth and the scoring should say so out loud. Set-based like the
-- others: who takes the places is the argument, and the order inside them is
-- already paid for by the positional term.
--
-- It adds ~50 points to a perfect Premier League entry against ~3,550 — about
-- 1.4%. Deliberately small: decision 10 sized the Table slice at 12-15% of a
-- season, and a new band should sharpen that argument, not resize it.
-- =============================================================

ALTER TABLE league_pool_settings
  ADD COLUMN IF NOT EXISTS table_europa_bonus integer NOT NULL DEFAULT 50;

COMMENT ON COLUMN league_pool_settings.table_europa_bonus IS
  'Per club correct in the Europa band, order-free. Half the top-band bonus: fifth is worth less than fourth.';

ALTER TABLE league_pool_settings DROP CONSTRAINT IF EXISTS lps_non_negative_ck;
ALTER TABLE league_pool_settings ADD CONSTRAINT lps_non_negative_ck CHECK (
  table_exact_points >= 0 AND table_step_penalty >= 0
  AND table_champion_bonus >= 0 AND table_top_four_bonus >= 0
  AND table_relegation_bonus >= 0 AND table_perfect_top_four_bonus >= 0
  AND table_europa_bonus >= 0
);

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
  )
  SELECT count(*) FILTER (WHERE description IS NOT NULL),
         count(*) FILTER (WHERE description ILIKE '%champions league%'),
         count(*) FILTER (WHERE description ILIKE '%relegation%'
                            AND description NOT ILIKE '%group%'),
         count(*) FILTER (WHERE description ILIKE '%relegation%'
                            AND description ILIKE '%group%'),
         -- Bounds, not a count: Europa does not start at rank 1, and an offset
         -- from the top band lands on Ligue 1's unnamed qualifier.
         min(rank) FILTER (WHERE description ILIKE '%europa league%'),
         max(rank) FILTER (WHERE description ILIKE '%europa league%')
    INTO v_described, v_cl, v_rel, v_rel_group, v_eur_from, v_eur_to
    FROM src;

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
