-- Migration 073: the three notifications get producers — and the "which
-- matchweek is open" rule stops being copy-pasted.
--
-- Plan: §4 L-F and §0.6. Product intent, *A Season in a League Pool* §5:
-- "Everyone gets an email and a push ... A reminder before it locks, for anyone
-- who hasn't picked yet. Only for them, and only once."
--
-- ONE DEFINITION OF "OPEN", NOT THREE. Migration 058's own comment admitted the
-- cost: "Duplicating a rule is a cost. The two copies MUST agree." Adding the
-- notice producer would have made three copies in SQL. The rule is extracted
-- into `league_open_matchweek()` and 058's trigger rewritten to call it —
-- leaving ONE SQL definition, plus the TypeScript one in lib/league/read.ts,
-- which cannot be removed because the screen needs the answer without a
-- database round trip per render. Two is the floor, not two hundred.
--
-- THE DISCLOSURE GATE, APPLIED AT DESIGN TIME (CLAUDE.md):
--   matchweek_opened    "We tell you when a new matchweek opens so you can pick
--                        before it locks."                          -> passes
--   lock_reminder       "If you haven't picked yet, we remind you once before
--                        the deadline."                             -> passes
--   matchweek_completed "When a matchweek finishes, we tell you how you did."
--                                                                   -> passes
-- The two constraints are what make the reminder pass rather than fail: ONLY to
-- people who have not picked, and ONLY once. A reminder to somebody who has
-- already picked is engagement bait with no information in it, and a repeating
-- one is nagging.
-- Deliberately NOT built, because they fail the gate: any "you have slipped to
-- 4th, come back" nudge, and anything that holds a result back to time a send.
--
-- ⚠ `league_queue_matchweek_notices` is SUPERSEDED BY 074 — this version could
-- only run globally, which made it impossible to test without touching real
-- pools. Its body is therefore not repeated here; see 074.

CREATE OR REPLACE FUNCTION public.league_open_matchweek(p_season_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  -- The earliest matchweek that is neither finished nor locked. A
  -- locked-but-unfinished matchweek is SKIPPED rather than returned:
  -- postponements mean one can sit locked with fixtures still to play for
  -- weeks, and that must not hold the whole season shut behind it.
  SELECT m.matchweek_id
    FROM league_matchweeks m
   WHERE m.season_id = p_season_id
     AND NOT (m.fixture_count = 0 OR m.completed_fixture_count >= m.fixture_count)
     AND (m.lock_at IS NULL OR m.lock_at > now())
   ORDER BY m.matchweek_number
   LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.league_open_matchweek(uuid) IS
  'Decision 16, the single SQL definition. Mirrors openMatchweekId() in '
  'lib/league/read.ts — those two are the only copies and must agree.';

-- 058's trigger now calls it instead of carrying its own copy.
CREATE OR REPLACE FUNCTION public.enforce_league_prediction_before_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_lock   timestamptz;
  v_done   boolean;
  v_season uuid;
  v_mw     uuid;
  v_open   uuid;
BEGIN
  SELECT mw.lock_at, f.is_completed, f.season_id, f.matchweek_id
    INTO v_lock, v_done, v_season, v_mw
    FROM league_fixtures f
    JOIN league_matchweeks mw ON mw.matchweek_id = f.matchweek_id
   WHERE f.fixture_id = NEW.fixture_id;

  IF v_done IS TRUE THEN RETURN NULL; END IF;
  IF v_lock IS NOT NULL AND v_lock <= now() THEN RETURN NULL; END IF;

  -- Decision 16. Was an inline copy of the rule; now the one definition.
  v_open := league_open_matchweek(v_season);
  IF v_open IS NULL OR v_mw <> v_open THEN RETURN NULL; END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.league_snapshot_matchweek_ranks(p_matchweek_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_season   uuid;
  v_complete boolean;
  v_done     timestamptz;
  v_rows     int := 0;
BEGIN
  SELECT m.season_id,
         (m.fixture_count > 0 AND m.completed_fixture_count >= m.fixture_count),
         m.ranks_snapshot_at
    INTO v_season, v_complete, v_done
    FROM league_matchweeks m
   WHERE m.matchweek_id = p_matchweek_id;

  IF v_season IS NULL OR NOT v_complete OR v_done IS NOT NULL THEN
    RETURN 0;
  END IF;

  -- Migration 061. Complete is not the same as scored.
  IF EXISTS (
    SELECT 1
      FROM league_fixtures f
      LEFT JOIN league_fixture_state s ON s.fixture_id = f.fixture_id
     WHERE f.matchweek_id = p_matchweek_id
       AND (s.fixture_id IS NULL OR s.is_completed IS NOT TRUE)
  ) THEN
    RETURN 0;
  END IF;

  UPDATE league_entry_totals t
     SET previous_final_rank = t.final_rank,
         updated_at = now()
    FROM pools po
   WHERE po.pool_id = t.pool_id
     AND po.league_season_id = v_season;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  UPDATE league_matchweeks SET ranks_snapshot_at = now(), updated_at = now()
   WHERE matchweek_id = p_matchweek_id;

  -- Migration 073. "Results are in." This is the one moment in the season when
  -- a matchweek is genuinely finished AND genuinely counted, and this function
  -- already runs exactly once at it — so the event needs no scheduler and no
  -- second piece of state to decide whether it has fired.
  INSERT INTO league_score_events (pool_id, matchweek_id, kind)
  SELECT po.pool_id, p_matchweek_id, 'matchweek_completed'
    FROM pools po
   WHERE po.league_season_id = v_season
     AND po.archived_at IS NULL
  ON CONFLICT DO NOTHING;

  RETURN v_rows;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.league_open_matchweek(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.league_open_matchweek(uuid) TO service_role, authenticated;
