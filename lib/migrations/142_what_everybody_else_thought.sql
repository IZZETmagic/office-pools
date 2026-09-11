-- =============================================================
-- 142 — WHAT EVERYBODY ELSE THOUGHT
-- =============================================================
-- ⚠ ADDITIVE ONLY. One new function. No existing table, column, function or
-- policy is touched, so there is no `md5(prosrc)` pre-check to run first.
--
-- ⚠⚠ APPLY THIS BEFORE DEPLOYING THE CODE THAT NAMES IT. `readCrowdMajority`
-- calls this by name; if the code ships first, PostgREST rejects the call for
-- naming a routine that does not exist. 136, 139, 140 and 141 all carry this
-- warning for the same reason; it is not boilerplate.
--
-- WHAT IT IS FOR
--   The contrarian index on the opponent dossier: how often somebody picks
--   against what the rest of the platform picked. That needs a majority per
--   fixture, and a popular fixture carries thousands of predictions — so this
--   counts in the database and returns ONE row per fixture rather than shipping
--   the rows to a function that reduces them. The same call `league_matchweek_points`
--   (130) makes, for the same reason.
--
-- ## ⚠⚠ PLATFORM-WIDE, AND IT TAKES NO POOL. THAT IS THE SECURITY PROPERTY.
--
--   A crowd figure scoped to one pool leaks that pool's picks through the back
--   door of an aggregate — in a six-member pool "67% picked Arsenal" identifies
--   two of the three other members to anybody who knows their own pick, and the
--   weekly reveal and the sealed Showdown draw both exist to prevent exactly
--   that. There is deliberately no `p_pool_id` argument to pass by mistake.
--
--   Platform-wide is safe on the opposite ground: n is large, no member is
--   identifiable in it, and the answer is the same for every caller — which is
--   also why it can be cached freely.
--
-- ## ⚠⚠ IT COUNTS THE OPEN MATCHWEEK TOO, GUARDED BY A POOL COUNT
--
--   An earlier draft excluded it on `lock_at <= now()`, reasoning that an open
--   week's picks are live and nobody may see them. Right for a POOL-SCOPED
--   figure, and it made the function useless for its only surface — the scout
--   sheet opens from the PREDICTION FLOW, where every fixture is in the open
--   week by definition, so the card would have been permanently empty.
--
--   ⚠ THE ANONYMITY COMES FROM `count(DISTINCT pool_id) >= 3`, NOT FROM THE
--   PICK COUNT. Twelve picks can be twelve members of one pool, and reporting
--   that back to one of them is the leak the seal exists to stop. Requiring
--   three unrelated pools means no member can subtract their own and read the
--   rest. See the long note above the function.
--
-- ## ⚠ A NULL MAJORITY MEANS "THE CROWD PICKED A DRAW". IT IS NOT "NO ANSWER."
--
--   A fixture with too few picks to have a majority is ABSENT from the result
--   entirely. A fixture whose plurality was a draw is PRESENT with a NULL
--   majority. The caller reads the two differently and collapsing them would
--   score every drawn crowd call as a break from the crowd.
--
-- ## ⚠ A PLURALITY, NOT A MAJORITY, DESPITE THE NAME
--
--   Three-way outcomes rarely produce anything over 50%: 45/30/25 is a normal
--   week and has no majority at all. The function returns the largest share, and
--   the floor below is what stops it reporting the winner of 2-versus-1.
-- =============================================================

BEGIN;

-- ⚠ DROP FIRST BECAUSE THE RETURN TYPE CHANGED. `CREATE OR REPLACE` cannot
-- widen a function's OUT columns — Postgres raises 42P13 "cannot change return
-- type of existing function". This migration was extended with the three-way
-- split before it was ever applied, so on a clean database the DROP is a no-op;
-- it is here so that a database which DID get the earlier shape can still take
-- this one rather than failing halfway through the transaction.
DROP FUNCTION IF EXISTS public.league_crowd_majority(uuid[]);

-- =============================================================
-- ⚠⚠ THE OPEN MATCHWEEK IS NOW INCLUDED, AND THIS IS THE DELICATE PART
-- =============================================================
-- The first version excluded it — `lock_at <= now()` — on the reasoning that an
-- unlocked week's picks are live and nobody may see them. That is exactly right
-- for a POOL-SCOPED figure and it made this function useless for the surface it
-- was built for: the scout sheet opens from the PREDICTION FLOW, where every
-- fixture on screen is in the open week by definition. The card would have been
-- permanently empty in the one place it appears.
--
-- What the seal actually protects is a member learning what the people they are
-- PLAYING AGAINST have picked. A platform-wide count across unrelated pools
-- does not tell them that — unless the platform is, for this fixture, mostly
-- their own pool. So the floor is no longer a count of picks alone.
--
-- ⚠ TWO FLOORS, AND THE SECOND IS THE ONE THAT MATTERS. `MIN_PICKS` stops a
-- handful of taps being reported as a crowd. `MIN_POOLS` is what makes the
-- aggregate genuinely anonymous: with picks required from at least three
-- distinct pools, no member can subtract their own pool and read the rest, and
-- a fixture that only one pool has picked is reported as having no crowd at all.
-- A count alone cannot do that — twelve picks can be twelve members of one pool.
--
-- ⚠ IF THIS IS JUDGED TOO LOOSE, the fix is to raise `MIN_POOLS`, not to put
-- `lock_at` back — that would return the function to being correct and unused.
-- =============================================================

CREATE OR REPLACE FUNCTION public.league_crowd_majority(p_fixture_ids uuid[])
RETURNS TABLE (
  fixture_id      uuid,
  majority        text,
  picks           integer,
  home_picks      integer,
  draw_picks      integer,
  away_picks      integer,
  -- The most-picked scoreline, over the picks that HAVE one. ⚠ A Results pool
  -- files no scoreline, so this denominator is smaller than `picks` and travels
  -- with it rather than being assumed equal.
  top_score       text,
  top_score_picks integer,
  score_picks     integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH votes AS (
    SELECT
      lp.fixture_id,
      pe.pool_id,
      -- ⚠⚠ BOTH PICK SHAPES. Migration 064 made these mutually exclusive per
      -- row: a Scores pool files a scoreline and leaves `predicted_outcome`
      -- null, a Results pool files an outcome and leaves both scores null, and
      -- `league_predictions_shape_ck` refuses a row with both or neither.
      --
      -- ⚠ SO A BARE `ELSE 'draw'` IS WRONG, NOT MERELY INCOMPLETE. Two nulls
      -- fail both comparisons and fall into it, so every pick in a Results pool
      -- would be counted as a crowd vote for the draw — silently, and in the
      -- direction that makes the whole platform look draw-happy.
      CASE
        WHEN lp.predicted_outcome IS NOT NULL THEN lp.predicted_outcome
        WHEN lp.predicted_home_score IS NULL OR lp.predicted_away_score IS NULL THEN NULL
        WHEN lp.predicted_home_score > lp.predicted_away_score THEN 'home'
        WHEN lp.predicted_home_score < lp.predicted_away_score THEN 'away'
        ELSE 'draw'
      END AS call,
      CASE
        WHEN lp.predicted_home_score IS NOT NULL AND lp.predicted_away_score IS NOT NULL
        THEN lp.predicted_home_score || '-' || lp.predicted_away_score
        ELSE NULL
      END AS scoreline
    FROM league_predictions lp
    JOIN pool_entries pe ON pe.entry_id = lp.entry_id
    WHERE lp.fixture_id = ANY(p_fixture_ids)
      -- ⚠ A ROW WITH NEITHER SHAPE IS NOT A VOTE. The CHECK constraint should
      -- make this impossible; counting it would be counting a pick nobody made.
      AND (lp.predicted_outcome IS NOT NULL
           OR (lp.predicted_home_score IS NOT NULL AND lp.predicted_away_score IS NOT NULL))
      -- ⚠ A RETIRED ENTRY IS NOT A VOTER. Same filter the leaderboard carries.
      AND pe.retired_at IS NULL
  ),
  eligible AS (
    -- ⚠⚠ THE ANONYMITY GATE. See the header: the pool count is the load-bearing
    -- half, not the pick count.
    SELECT v.fixture_id
      FROM votes v
     GROUP BY v.fixture_id
    HAVING count(*) >= 10
       AND count(DISTINCT v.pool_id) >= 3
  ),
  tally AS (
    SELECT v.fixture_id, v.call, count(*) AS n
      FROM votes v
      JOIN eligible e ON e.fixture_id = v.fixture_id
     GROUP BY v.fixture_id, v.call
  ),
  totals AS (
    SELECT t.fixture_id, sum(t.n) AS total
      FROM tally t
     GROUP BY t.fixture_id
  ),
  ranked AS (
    SELECT
      t.fixture_id, t.call, t.n, tot.total,
      -- ⚠ THE TIEBREAK IS DETERMINISTIC AND IT MATTERS. An exact 5/5/0 split
      -- has two winners; without an ordering the answer changes between calls
      -- and the same member reads as contrarian on Tuesday and conformist on
      -- Wednesday. Alphabetical is arbitrary but STABLE, which is the property
      -- being bought.
      row_number() OVER (PARTITION BY t.fixture_id ORDER BY t.n DESC, t.call ASC) AS seat
      FROM tally t
      JOIN totals tot ON tot.fixture_id = t.fixture_id
  ),
  scorelines AS (
    SELECT
      v.fixture_id, v.scoreline, count(*) AS n,
      -- Same tiebreak reasoning; on a tie the lower-scoring line wins so that a
      -- run of 1-0s beats a coincidence of 4-3s.
      row_number() OVER (
        PARTITION BY v.fixture_id ORDER BY count(*) DESC, v.scoreline ASC
      ) AS seat
      FROM votes v
      JOIN eligible e ON e.fixture_id = v.fixture_id
     WHERE v.scoreline IS NOT NULL
     GROUP BY v.fixture_id, v.scoreline
  ),
  score_totals AS (
    SELECT v.fixture_id, count(*) AS n
      FROM votes v
      JOIN eligible e ON e.fixture_id = v.fixture_id
     WHERE v.scoreline IS NOT NULL
     GROUP BY v.fixture_id
  )
  SELECT
    r.fixture_id,
    -- 'draw' becomes NULL at the boundary, once, here. See the header.
    nullif(r.call, 'draw')        AS majority,
    r.total::integer              AS picks,
    -- ⚠ COUNTS, NOT PERCENTAGES. Rounding three shares to whole numbers lets
    -- them total 99 or 101; the caller divides and owns its own rounding.
    coalesce(h.n, 0)::integer     AS home_picks,
    coalesce(d.n, 0)::integer     AS draw_picks,
    coalesce(a.n, 0)::integer     AS away_picks,
    sl.scoreline                  AS top_score,
    coalesce(sl.n, 0)::integer    AS top_score_picks,
    coalesce(st.n, 0)::integer    AS score_picks
    FROM ranked r
    LEFT JOIN tally h  ON h.fixture_id = r.fixture_id AND h.call = 'home'
    LEFT JOIN tally d  ON d.fixture_id = r.fixture_id AND d.call = 'draw'
    LEFT JOIN tally a  ON a.fixture_id = r.fixture_id AND a.call = 'away'
    LEFT JOIN scorelines sl ON sl.fixture_id = r.fixture_id AND sl.seat = 1
    LEFT JOIN score_totals st ON st.fixture_id = r.fixture_id
   WHERE r.seat = 1;
$$;

COMMENT ON FUNCTION public.league_crowd_majority(uuid[]) IS
  'How the whole platform called each fixture, for the scouting contrarian index. '
  'SECURITY DEFINER because league_predictions is deny-all to authenticated. '
  'Takes NO pool: a pool-scoped crowd figure leaks that pool''s picks through an '
  'aggregate. INCLUDES the open matchweek — the scout sheet is opened from the '
  'prediction flow, where every fixture is in it — and is kept anonymous by '
  'requiring picks from at least 3 DISTINCT POOLS as well as 10 picks. The pool '
  'count is the load-bearing half: twelve picks can be twelve members of one '
  'pool. A NULL majority means the crowd picked a DRAW; a fixture with no crowd '
  'answer is absent. '
  'Returns the full three-way split as COUNTS so the caller owns its rounding — '
  'three percentages rounded independently total 99 or 101.';

-- ⚠ `authenticated` MAY EXECUTE IT, which is safe for the two reasons above and
-- only those two: the answer names no member, and it covers only picks that are
-- already revealed. Widening either of those makes this grant wrong.
REVOKE ALL ON FUNCTION public.league_crowd_majority(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_crowd_majority(uuid[]) TO authenticated, service_role;

COMMIT;

-- =============================================================
-- VERIFY — run after applying.
-- =============================================================
--
-- 1. It exists, and anon cannot run it. expect: one row; anon absent.
--
-- SELECT proname, pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'league_crowd_majority';
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
--  WHERE routine_name = 'league_crowd_majority';
--
-- 2. ⚠⚠ THE ANONYMITY GATE BITES. Find a fixture picked by FEWER THAN THREE
--    pools and expect ZERO rows back however many picks it has — that is the
--    guard doing its job, not a missing feature.
--
-- WITH per_fixture AS (
--   SELECT lp.fixture_id, count(*) AS picks, count(DISTINCT pe.pool_id) AS pools
--     FROM league_predictions lp
--     JOIN pool_entries pe ON pe.entry_id = lp.entry_id AND pe.retired_at IS NULL
--    GROUP BY lp.fixture_id)
-- SELECT f.fixture_id, f.picks, f.pools,
--        (SELECT count(*) FROM league_crowd_majority(ARRAY[f.fixture_id])) AS returned
--   FROM per_fixture f
--  WHERE f.pools < 3 AND f.picks >= 10
--  LIMIT 5;   -- expect returned = 0 on every row
--
-- 2b. And an OPEN matchweek is now included where it clears the gate, which is
--     the whole point — these are the fixtures the prediction flow shows.
--
-- WITH open_mw AS (
--   SELECT matchweek_id FROM league_matchweeks
--    WHERE lock_at IS NOT NULL AND lock_at > now()
--    ORDER BY lock_at LIMIT 1)
-- SELECT count(*) FROM league_crowd_majority(
--   ARRAY(SELECT fixture_id FROM league_fixtures
--          WHERE matchweek_id = (SELECT matchweek_id FROM open_mw)));
--
-- 3. A locked matchweek returns at most one row per fixture, and `picks` is the
--    total across all three calls rather than the winner's count.
--
-- SELECT * FROM league_crowd_majority(
--   ARRAY(SELECT fixture_id FROM league_fixtures
--          WHERE matchweek_id = (SELECT matchweek_id FROM league_matchweeks
--                                 WHERE lock_at <= now() ORDER BY lock_at DESC LIMIT 1)));
--
-- 4. ⚠ A DRAW-MAJORITY FIXTURE IS PRESENT WITH majority IS NULL, not absent.
--    If this returns 0 across a whole season, the nullif is being dropped
--    somewhere downstream rather than there being no drawish fixtures.
--
-- SELECT count(*) FROM league_crowd_majority(
--   ARRAY(SELECT fixture_id FROM league_fixtures WHERE is_completed)) WHERE majority IS NULL;
