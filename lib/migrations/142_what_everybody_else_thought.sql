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
-- ## ⚠ AND IT ONLY COUNTS LOCKED MATCHWEEKS
--
--   A majority computed over a matchweek still open is a live tally of picks
--   nobody is allowed to see yet, and it moves as they arrive. The join to
--   `league_matchweeks` with `lock_at <= now()` is not an optimisation.
--
--   ⚠ KEYED ON `lock_at`, NEVER A STATE STRING. Nothing in this schema stores
--   matchweek state — `read.ts` is explicit that it is derived from time — so a
--   status column would be a thing to go stale, and stale here means leaking.
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

-- Fewest predictions before a fixture has a crowd opinion worth reporting.
-- ⚠ It is a FLOOR ON THE FIXTURE, not on the winning side: twenty picks split
-- 8/7/5 is a real, reportable split; three picks split 2/1/0 is not a crowd.
CREATE OR REPLACE FUNCTION public.league_crowd_majority(p_fixture_ids uuid[])
RETURNS TABLE (fixture_id uuid, majority text, picks integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH revealed AS (
    SELECT
      lp.fixture_id,
      CASE
        WHEN lp.predicted_home_score > lp.predicted_away_score THEN 'home'
        WHEN lp.predicted_home_score < lp.predicted_away_score THEN 'away'
        ELSE 'draw'
      END AS call
    FROM league_predictions lp
    JOIN league_fixtures   lf ON lf.fixture_id  = lp.fixture_id
    JOIN league_matchweeks mw ON mw.matchweek_id = lf.matchweek_id
    WHERE lp.fixture_id = ANY(p_fixture_ids)
      -- ⚠⚠ THE SEAL. See the header.
      AND mw.lock_at IS NOT NULL
      AND mw.lock_at <= now()
  ),
  tally AS (
    SELECT r.fixture_id, r.call, count(*) AS n
      FROM revealed r
     GROUP BY r.fixture_id, r.call
  ),
  totals AS (
    SELECT t.fixture_id, sum(t.n) AS total
      FROM tally t
     GROUP BY t.fixture_id
  ),
  ranked AS (
    SELECT
      t.fixture_id,
      t.call,
      t.n,
      tot.total,
      -- ⚠ THE TIEBREAK IS DETERMINISTIC AND IT MATTERS. An exact 5/5/0 split
      -- between home and away has two winners; without an ordering the answer
      -- changes between calls and the same member reads as contrarian on
      -- Tuesday and conformist on Wednesday. Alphabetical is arbitrary but it
      -- is STABLE, which is the property being bought.
      row_number() OVER (
        PARTITION BY t.fixture_id ORDER BY t.n DESC, t.call ASC
      ) AS seat
      FROM tally t
      JOIN totals tot ON tot.fixture_id = t.fixture_id
     WHERE tot.total >= 10
  )
  SELECT
    r.fixture_id,
    -- 'draw' becomes NULL at the boundary, once, here. See the header.
    nullif(r.call, 'draw') AS majority,
    r.total::integer       AS picks
    FROM ranked r
   WHERE r.seat = 1;
$$;

COMMENT ON FUNCTION public.league_crowd_majority(uuid[]) IS
  'How the whole platform called each fixture, for the scouting contrarian index. '
  'SECURITY DEFINER because league_predictions is deny-all to authenticated. '
  'Takes NO pool: a pool-scoped crowd figure leaks that pool''s picks through an '
  'aggregate. Counts only matchweeks whose lock_at has passed. A NULL majority '
  'means the crowd picked a DRAW; a fixture with no crowd answer is absent.';

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
-- 2. ⚠ AN OPEN MATCHWEEK RETURNS NOTHING — the seal. Take the currently open
--    matchweek's fixtures and expect ZERO rows back, however many picks exist.
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
