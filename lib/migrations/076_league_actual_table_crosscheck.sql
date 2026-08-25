-- Migration 076: our own table, demoted to a cross-check.
--
-- Plan §0.3. §3.5 originally made this the SOURCE OF TRUTH; it is not, because
-- it cannot see points deductions. It survives for one purpose: to disagree
-- with the feed loudly enough that somebody notices.
--
-- A deduction is invisible in our own data by construction. Everton played the
-- same matches and scored the same goals whether or not the Premier League took
-- ten points off them — the only place the deduction exists is the feed. So
-- "our arithmetic says 34, the feed says 24" IS the detection mechanism.
--
-- ⚠ RANK differences are EXPECTED and are not the signal. Our order breaks ties
-- with `name ASC`; the real competition uses head-to-head (decision 13, kept as
-- a known simplification because this is only a cross-check now). POINTS
-- differences are the signal, and the two are reported separately so a real
-- deduction is never buried under harmless tiebreaker noise.
--
-- ⚠ The OUT column is `table_position`, not `position`: `position` is a
-- reserved word in PostgreSQL (the substring function), and naming a column
-- that fails at CREATE time.
--
-- ============================================================
-- IT EARNED ITS PLACE ON THE FIRST RUN
-- ============================================================
-- Run against the live feed on 2026-08-24 it immediately reported ONE points
-- mismatch: Arsenal, feed 3, ours 6. The cause was not a deduction — it was
-- `MW12 fixture 111, Arsenal 2-1 Manchester City`, a November match carrying a
-- hand-set result left behind by the migration 055 engine verification.
--
-- Nothing else in the product would have noticed. The fixture looks complete,
-- the engine scores it happily, and the only thing that can tell the difference
-- between "a result we recorded" and "a result that happened" is comparing our
-- arithmetic against somebody else's.

CREATE OR REPLACE FUNCTION public.league_actual_table(p_season_id uuid)
RETURNS TABLE (
  club_id        uuid,
  table_position int,
  played         int,
  won            int,
  drawn          int,
  lost           int,
  gf             int,
  ga             int,
  gd             int,
  points         int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  WITH sides AS (
    -- Every completed fixture contributes two rows: one per club, from that
    -- club's point of view. Incomplete fixtures contribute nothing.
    SELECT f.home_club_id AS club_id, f.home_goals AS scored, f.away_goals AS conceded
      FROM league_fixtures f
     WHERE f.season_id = p_season_id AND f.is_completed
       AND f.home_goals IS NOT NULL AND f.away_goals IS NOT NULL
    UNION ALL
    SELECT f.away_club_id, f.away_goals, f.home_goals
      FROM league_fixtures f
     WHERE f.season_id = p_season_id AND f.is_completed
       AND f.home_goals IS NOT NULL AND f.away_goals IS NOT NULL
  ),
  agg AS (
    SELECT c.club_id, c.name,
           count(s.club_id)::int                              AS played,
           count(*) FILTER (WHERE s.scored > s.conceded)::int  AS won,
           count(*) FILTER (WHERE s.scored = s.conceded)::int  AS drawn,
           count(*) FILTER (WHERE s.scored < s.conceded)::int  AS lost,
           COALESCE(sum(s.scored), 0)::int                     AS gf,
           COALESCE(sum(s.conceded), 0)::int                   AS ga
      FROM league_clubs c
      LEFT JOIN sides s ON s.club_id = c.club_id
     WHERE c.season_id = p_season_id
     GROUP BY c.club_id, c.name
  )
  SELECT a.club_id,
         ROW_NUMBER() OVER (
           -- `name ASC` is the last rung, and it is a KNOWN simplification: the
           -- real competition uses head-to-head. Harmless because this is a
           -- cross-check, not the table anybody is shown.
           ORDER BY (a.won * 3 + a.drawn) DESC, (a.gf - a.ga) DESC, a.gf DESC, a.name ASC
         )::int AS table_position,
         a.played, a.won, a.drawn, a.lost, a.gf, a.ga,
         (a.gf - a.ga)::int         AS gd,
         (a.won * 3 + a.drawn)::int AS points
    FROM agg a;
$fn$;

COMMENT ON FUNCTION public.league_actual_table(uuid) IS
  'Our own 3/1/0 table from completed fixtures. A CROSS-CHECK ONLY (plan §0.3) — '
  'it cannot see points deductions, which is exactly why disagreeing with the '
  'feed detects one. Never show this to a member and never score against it.';

CREATE OR REPLACE FUNCTION public.league_standings_crosscheck(p_season_id uuid)
RETURNS TABLE (
  club_id        uuid,
  club_name      text,
  feed_points    int,
  derived_points int,
  points_delta   int,
  feed_rank      int,
  derived_rank   int,
  kind           text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  SELECT s.club_id,
         c.name,
         s.points,
         d.points,
         (s.points - d.points)::int AS points_delta,
         s.rank,
         d.table_position,
         CASE
           -- The one that matters. Our arithmetic cannot be wrong about matches
           -- played, so a points gap means the competition applied something we
           -- cannot see — almost always a deduction.
           WHEN s.points <> d.points THEN 'points_mismatch'
           -- Expected noise: same points, different order.
           WHEN s.rank <> d.table_position THEN 'tiebreak_only'
           ELSE 'agree'
         END AS kind
    FROM league_standings s
    JOIN league_clubs c ON c.club_id = s.club_id
    JOIN league_actual_table(p_season_id) d ON d.club_id = s.club_id
   WHERE s.season_id = p_season_id
   ORDER BY s.rank;
$fn$;

COMMENT ON FUNCTION public.league_standings_crosscheck(uuid) IS
  'Compares the ingested table against our own arithmetic. kind=points_mismatch '
  'is the real signal and usually means a points deduction the feed knows about '
  'and we cannot derive. kind=tiebreak_only is EXPECTED noise — our last rung is '
  'name, the competition''s is head-to-head.';

REVOKE EXECUTE ON FUNCTION public.league_actual_table(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.league_actual_table(uuid) TO service_role, authenticated;
REVOKE EXECUTE ON FUNCTION public.league_standings_crosscheck(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.league_standings_crosscheck(uuid) TO service_role, authenticated;
