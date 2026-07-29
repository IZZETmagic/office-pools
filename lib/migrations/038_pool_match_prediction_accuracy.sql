-- 038: pool_match_prediction_accuracy — count the pool's correct picks per match
--       in the database, instead of shipping every prediction to the browser.
--
-- WHY
-- Banter's desktop "Matchday Pulse" panel shows, for the THREE most recently
-- completed matches, what share of the pool called the result right. To produce
-- three percentages it filtered the pool-wide predictions array — 13,385 rows on
-- the largest pool — which is one of only two reasons that array is still
-- fetched at all (DesktopSidebar.tsx:307).
--
-- This returns one row per match with a result: how many predictions exist and
-- how many were correct. ~104 tiny rows instead of 13,385 fat ones, and the
-- browser stops doing the counting.
--
-- CORRECTNESS DEFINITION — mirrors the client exactly, deliberately:
--   predicted winner = home/away/draw from predicted_home_score vs
--                      predicted_away_score
--   actual winner    = home/away/draw from home_score_ft vs away_score_ft
--   correct          = the two agree
-- Full-time scores only. Penalties are NOT considered, matching the panel today
-- — a match won on penalties counts as the draw it was after 90/120 minutes.
-- If that is ever judged wrong it is a PRODUCT change to make deliberately, not
-- something to quietly "fix" here, because it would move a number members have
-- already seen.
--
-- NULL predicted scores are excluded: a row with no score is not a pick and must
-- not count toward the denominator (it would depress everyone's percentage).
--
-- SECURITY
-- SECURITY INVOKER (the default), granted to service_role only — same posture as
-- 037. It is called with the admin client from getPoolData, which runs after the
-- caller's pool membership has been established.

CREATE OR REPLACE FUNCTION public.pool_match_prediction_accuracy(p_pool_id uuid)
RETURNS TABLE (match_id uuid, total integer, correct integer)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.match_id,
    count(*)::int AS total,
    count(*) FILTER (
      WHERE CASE
              WHEN p.predicted_home_score > p.predicted_away_score THEN 'home'
              WHEN p.predicted_away_score > p.predicted_home_score THEN 'away'
              ELSE 'draw'
            END
          = CASE
              WHEN m.home_score_ft > m.away_score_ft THEN 'home'
              WHEN m.away_score_ft > m.home_score_ft THEN 'away'
              ELSE 'draw'
            END
    )::int AS correct
  FROM predictions p
  JOIN pool_entries pe ON pe.entry_id = p.entry_id
  JOIN pool_members pm ON pm.member_id = pe.member_id
  JOIN matches m       ON m.match_id   = p.match_id
  WHERE pm.pool_id = p_pool_id
    AND m.is_completed
    AND m.home_score_ft IS NOT NULL
    AND m.away_score_ft IS NOT NULL
    AND p.predicted_home_score IS NOT NULL
    AND p.predicted_away_score IS NOT NULL
  GROUP BY p.match_id;
$$;

REVOKE ALL ON FUNCTION public.pool_match_prediction_accuracy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pool_match_prediction_accuracy(uuid) TO service_role;
