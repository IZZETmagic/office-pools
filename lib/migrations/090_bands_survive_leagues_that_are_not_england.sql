-- =============================================================
-- 090 — THE BAND MATCHER MEETS SEVEN OTHER LEAGUES
-- =============================================================
-- 089 derived the bands by counting `league_standings.description` for
-- `%champions league%` and `%relegation%`. Against live api-football data for
-- eight competitions, that is **wrong for two of them** — and wrong in the
-- expensive direction.
--
--   Premier League  4× "Promotion - Champions League (League phase)"   → 4 / 3  ✅
--   La Liga         4× "Champions League league stage"                 → 4 / 3  ✅
--   Bundesliga      4× CL · 1× "Relegation Playoffs" · 2× "Relegation" → 4 / 3  ✅
--   Serie A                                                            → 4 / 3  ✅
--   Ligue 1         3× CL · rank 4 is " Qualifying"                    → 3 / 3  ⚠
--   Eredivisie      1× CL (League phase) · 1× CL (Qualification)       → 2 / 3  ✅
--   Scottish Prem   NO "champions league" at all;
--                   6× "Premiership (Relegation Group)"                → 0 / 6  🔴
--   MLS             no CL, no relegation, 18× play-off promotion       → 0 / 0  ⚠
--
-- **Scotland is the one that would have cost money.** "Relegation Group" is the
-- bottom half of a post-split table — six clubs of twelve — not six relegation
-- places. The old matcher would have paid a relegation bonus for **half the
-- league**, and paid no top-band bonus at all.
--
-- ## Two changes, and a refusal
--
-- 1. **A description containing "group" is a SPLIT, not a relegation band.** It
--    is excluded — and its presence marks the whole derivation `unclear`, because
--    inferring "zero relegation" from an exclusion is not the same as the feed
--    saying there is none.
-- 2. **A relegation band larger than a quarter of the league is not a relegation
--    band.** A sanity bound for phrasings nobody has seen yet.
-- 3. **Zero stays zero when the feed genuinely says so.** MLS describes its table
--    in detail and never mentions relegation — that is information, not silence,
--    and paying a relegation bonus in a league without relegation would be
--    inventing a competition that does not exist.
--
-- Each band now carries its OWN source, because they fail independently:
-- Scotland's top band is extrapolated while its relegation band is refused, and
-- one word for both would hide that.
--
-- ⚠ Ligue 1 keeps 3 rather than 4. Rank 4 reads `" Qualifying"` — leading space,
-- no competition named — and guessing which competition it qualifies for is
-- exactly the kind of inference this migration exists to stop doing. A pool that
-- disagrees sets `league_pool_settings.table_top_n` and that always wins.
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
  v_clubs      integer;
  v_top_n      integer;
  v_top_src    text;
  v_rel_n      integer;
  v_rel_src    text;
  v_feed_src   text;
BEGIN
  SELECT club_count INTO v_clubs FROM league_seasons WHERE season_id = p_season_id;
  v_clubs := COALESCE(v_clubs, 20);

  v_final := EXISTS (SELECT 1 FROM league_standings_final f WHERE f.season_id = p_season_id);
  v_feed_src := CASE WHEN v_final THEN 'feed_final' ELSE 'feed' END;

  SELECT count(*) FILTER (WHERE s.description IS NOT NULL),
         count(*) FILTER (WHERE s.description ILIKE '%champions league%'),
         count(*) FILTER (WHERE s.description ILIKE '%relegation%'
                            AND s.description NOT ILIKE '%group%'),
         count(*) FILTER (WHERE s.description ILIKE '%relegation%'
                            AND s.description ILIKE '%group%')
    INTO v_described, v_cl, v_rel, v_rel_group
    FROM league_standings s
   WHERE s.season_id = p_season_id;

  -- Nothing described at all: the feed has told us nothing, so extrapolate from
  -- the only thing we know and say plainly that we did.
  IF COALESCE(v_described, 0) = 0 THEN
    RETURN jsonb_build_object(
      'top_n',        LEAST(GREATEST(1, ROUND(v_clubs * 0.20)::int), 10),
      'relegation_n', LEAST(GREATEST(1, ROUND(v_clubs * 0.15)::int), 10),
      'top_source',        'proportional',
      'relegation_source', 'proportional',
      'source',            'proportional'
    );
  END IF;

  -- ---- the top band ----
  -- Champions League places where the competition has them. Where it does not
  -- (Scotland, MLS) there is no equivalent phrase to read, so the band is
  -- extrapolated rather than dropped — a league still has a top that matters.
  IF v_cl > 0 THEN
    v_top_n := LEAST(v_cl, 10);
    v_top_src := v_feed_src;
  ELSE
    v_top_n := LEAST(GREATEST(1, ROUND(v_clubs * 0.20)::int), 10);
    v_top_src := 'proportional';
  END IF;

  -- ---- the relegation band ----
  IF v_rel_group > 0 THEN
    -- "Relegation Group" is a post-split half of the table. Refuse to read it.
    v_rel_n := LEAST(GREATEST(1, ROUND(v_clubs * 0.15)::int), 10);
    v_rel_src := 'unclear';
  ELSIF v_rel > GREATEST(1, v_clubs / 4) THEN
    -- Bigger than a quarter of the league is not a relegation band, whatever it
    -- calls itself.
    v_rel_n := LEAST(GREATEST(1, ROUND(v_clubs * 0.15)::int), 10);
    v_rel_src := 'unclear';
  ELSE
    -- Zero is a real answer here: a described table that never mentions
    -- relegation is a league without it.
    v_rel_n := v_rel;
    v_rel_src := v_feed_src;
  END IF;

  RETURN jsonb_build_object(
    'top_n',             v_top_n,
    'relegation_n',      v_rel_n,
    'top_source',        v_top_src,
    'relegation_source', v_rel_src,
    -- One word for the pair, for callers that only want the headline: the WORSE
    -- of the two, so a summary can never look more confident than its parts.
    'source', CASE
                WHEN v_top_src = 'proportional' OR v_rel_src IN ('proportional', 'unclear')
                  THEN 'partial'
                ELSE v_feed_src
              END
  );
END;
$fn$;
