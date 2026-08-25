-- =============================================================
-- 091 — THE BANDS FREEZE WITH THE TABLE
-- =============================================================
-- §0.3 froze the finishing table so that a feed correction could not restate a
-- paid award. `league_standings_final` captured rank, points, goal difference
-- and games played — **and not `description`**.
--
-- So the RANKS were frozen and the BANDS were not. `league_default_bands` kept
-- reading the live table, which means:
--
--   A member is paid a top-four bonus in May. In June the feed re-tags the table
--   — an extra Champions League place on coefficient, a cup winner shifting the
--   Europa places — and the band becomes top five. The engine reprices against
--   the new band and the award changes, months after it was announced.
--
-- That is precisely the failure the snapshot exists to prevent, left open on the
-- half nobody thought to copy. Ryan named the mechanism before the code did:
-- *"these positions may be increased in each league depending on other
-- tournaments and other teams' performances in Europe."* They move, and they
-- move for reasons that have nothing to do with the season being predicted.
--
-- Three changes:
--   1. `league_standings_final` carries `description`.
--   2. The snapshot copies it.
--   3. `league_default_bands` reads the FROZEN description once one exists, and
--      the live table only before then.
--
-- ## On checking monthly
--
-- Worth recording, because the instinct was right and the answer is that it is
-- already better than that: the standings are re-read on **every tick where a
-- fixture completed** — roughly every matchweek, not monthly — because the table
-- cannot move for any other reason. A monthly poll would be a downgrade, and a
-- timer would spend the api-football allowance re-reading a number that had not
-- changed. What was actually missing was not more frequent reading. It was
-- stopping.
-- =============================================================

ALTER TABLE league_standings_final
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN league_standings_final.description IS
  'The band label as it stood when the season ended — Champions League, Europa, relegation. Frozen with the rank, because a band that moves after payout changes an award that was already announced.';

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

  -- `description` rides along now: the BANDS have to freeze with the ranks, or a
  -- re-tagged table months later reprices an award that was already paid.
  INSERT INTO league_standings_final (season_id, club_id, rank, points, goals_diff, played, description)
  SELECT season_id, club_id, rank, points, goals_diff, played, description
    FROM league_standings WHERE season_id = p_season_id;
  GET DIAGNOSTICS v_written = ROW_COUNT;

  RETURN jsonb_build_object('final', true, 'written', v_written);
END;
$fn$;

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

  -- Read the FROZEN labels once the season is over, and the live ones only
  -- before then. Same rule the ranks already follow, for the same reason.
  WITH src AS (
    SELECT f.description FROM league_standings_final f
     WHERE f.season_id = p_season_id AND v_final
    UNION ALL
    SELECT s.description FROM league_standings s
     WHERE s.season_id = p_season_id AND NOT v_final
  )
  SELECT count(*) FILTER (WHERE description IS NOT NULL),
         count(*) FILTER (WHERE description ILIKE '%champions league%'),
         count(*) FILTER (WHERE description ILIKE '%relegation%'
                            AND description NOT ILIKE '%group%'),
         count(*) FILTER (WHERE description ILIKE '%relegation%'
                            AND description ILIKE '%group%')
    INTO v_described, v_cl, v_rel, v_rel_group
    FROM src;

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
