-- =============================================================
-- 101 — THE MATCHWEEK WINDOW FOLLOWS THE CLOCK, NOT THE NUMBERING
-- =============================================================
-- Decision 10, the two parts of it that are pure mechanism. Both were settled
-- against three seasons of real Premier League fixtures (2022–24, 114 rounds,
-- 1,140 games, pulled from api-football) rather than assumed.
--
-- ⚠ BEFORE YOU RUN THIS — two live functions are REPLACED
-- =============================================================
--   SELECT pg_get_functiondef('public.refresh_league_matchweek_window'::regproc);
--   SELECT pg_get_functiondef('public.league_open_matchweek'::regproc);
-- They should be 050's and 073's, plus nothing.
-- =============================================================


-- ------------------------------------------ 1. picks close an hour BEFORE kickoff
--
-- `lock_at` was the first kickoff exactly, so the deadline and the whistle were
-- the same instant. An hour's buffer is friendlier — it removes the 14:59:59
-- submission — and it has a second effect worth having: picks reveal at the
-- lock, so the group now sees each other's calls an hour before the games start.
-- Nobody can change anything by then, so there is no fairness cost, and it buys
-- an hour of banter.
--
-- The CASE is unchanged and load-bearing: `lock_at` tracks the fixture list
-- while it is still in the future — so a cup tie pulling a game to the preceding
-- Tuesday moves the deadline with it — and freezes the moment it passes.

CREATE OR REPLACE FUNCTION refresh_league_matchweek_window() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  UPDATE league_matchweeks mw SET
    first_kickoff_at        = agg.first_k,
    last_kickoff_at         = agg.last_k,
    fixture_count           = COALESCE(agg.n, 0),
    completed_fixture_count = COALESCE(agg.done, 0),
    lock_at    = CASE WHEN mw.lock_at IS NULL OR mw.lock_at > now()
                      THEN agg.first_k - interval '1 hour' ELSE mw.lock_at END,
    updated_at = now()
  FROM league_matchweeks m2
  LEFT JOIN LATERAL (
    SELECT min(f.kickoff_at) AS first_k, max(f.kickoff_at) AS last_k,
           count(*) AS n, count(*) FILTER (WHERE f.is_completed) AS done
      FROM league_fixtures f WHERE f.matchweek_id = m2.matchweek_id
  ) agg ON true
  WHERE mw.matchweek_id = m2.matchweek_id
    AND (mw.first_kickoff_at, mw.last_kickoff_at, mw.fixture_count, mw.completed_fixture_count)
        IS DISTINCT FROM (agg.first_k, agg.last_k, COALESCE(agg.n,0), COALESCE(agg.done,0));
  RETURN NULL;
END; $fn$;

-- The function only fires on a fixture write, so every matchweek already in the
-- database would keep its old lock until something touched its fixtures. Move
-- the ones that have not locked yet; never touch one that has, because a passed
-- deadline is a promise that was already kept.
UPDATE league_matchweeks
   SET lock_at = first_kickoff_at - interval '1 hour',
       updated_at = now()
 WHERE first_kickoff_at IS NOT NULL
   AND lock_at IS NOT NULL
   AND lock_at > now()
   AND lock_at = first_kickoff_at;


-- ------------------------------- 2. the open matchweek is the earliest to LOCK
--
-- ⚠ THE NUMBERING AND THE CALENDAR DISAGREE, AND WE HAD THE WRONG ONE.
--
-- Ordering by `matchweek_number` assumes round N is played before round N+1.
-- Across three real seasons that is false: the minimum gap between consecutive
-- rounds' first kickoffs is **−121 days**, because a whole round can be moved.
-- The clearest instance is 2024 round 29, whose earliest fixture was Wed 19 Feb
-- while the rest of it was played on Sat 15 Mar — so it locks before round 28.
--
-- Under the old ORDER BY, that opens a matchweek whose games are weeks away
-- while a later-numbered one is being played, and members pick the wrong week.
-- Ordering by `lock_at` asks the question that was always meant: which
-- matchweek closes next?
--
-- NULLS LAST because a matchweek with no fixtures yet has no lock, and an empty
-- future round must not outrank a real one that is about to close.
-- `matchweek_number` stays as the tiebreak so the result is deterministic when
-- two matchweeks somehow lock at the same instant.

CREATE OR REPLACE FUNCTION public.league_open_matchweek(p_season_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  -- The next matchweek to CLOSE that is neither finished nor already locked. A
  -- locked-but-unfinished matchweek is SKIPPED rather than returned:
  -- postponements mean one can sit locked with fixtures still to play for
  -- weeks, and that must not hold the whole season shut behind it.
  SELECT m.matchweek_id
    FROM league_matchweeks m
   WHERE m.season_id = p_season_id
     AND NOT (m.fixture_count = 0 OR m.completed_fixture_count >= m.fixture_count)
     AND (m.lock_at IS NULL OR m.lock_at > now())
   ORDER BY m.lock_at NULLS LAST, m.matchweek_number
   LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.league_open_matchweek(uuid) IS
  'The matchweek currently taking picks: the next one to CLOSE that is neither '
  'finished nor already locked. Ordered by lock_at, not matchweek_number — three '
  'real seasons contain rounds played out of numerical order (minimum gap −121 '
  'days), and ordering by number opens a matchweek whose games are weeks away. '
  'Migration 101, Decision 10.';

REVOKE EXECUTE ON FUNCTION public.league_open_matchweek(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.league_open_matchweek(uuid) TO service_role, authenticated;
