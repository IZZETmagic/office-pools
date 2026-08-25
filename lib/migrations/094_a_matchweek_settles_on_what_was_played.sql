-- =============================================================
-- 094 — A MATCHWEEK SETTLES ON WHAT WAS PLAYED
-- =============================================================
-- Ryan, 2026-08-24, asking what Showdown does when a match is called off — which
-- is guaranteed every season. Reproduced before it was fixed:
--
--   fixtures 2 · completed 1 · one postponed
--   league_snapshot_matchweek_ranks returned 0
--   ranks_snapshot_at is NULL  ->  the settle trigger NEVER FIRES
--   the duel: settled_at NULL · points - / -
--
-- `refresh_league_matchweek_window` counts every fixture in the denominator and
-- only completed ones in the numerator, so a postponed or cancelled fixture sits
-- in that denominator forever. Everything hangs off that one gate: the Showdown
-- duel, the Last Man Standing round, the weekly arrow, and "results are in".
-- Postponed resolved months late; **cancelled never resolved at all.**
--
-- ## The rule now
--
-- A matchweek settles when **either**:
--
--   · every fixture is completed — the normal week, settling the moment the last
--     result is scored, exactly as before; **or**
--   · its WINDOW HAS CLOSED — the next matchweek has locked — in which case it
--     settles on whatever was actually played.
--
-- The last matchweek of a season has no next one, so there the window closes
-- when nothing is still playable: every fixture completed or cancelled. A
-- postponed final-round fixture is always rearranged, and waiting for it is
-- right.
--
-- ⚠ **Not `last_kickoff_at`.** It looks like the natural signal and it is a
-- trap: `refresh_league_matchweek_window` sets it to `max(kickoff_at)`, so a
-- fixture rearranged to February would push a November matchweek's window into
-- February — the exact stall this migration exists to remove. The next
-- matchweek locking is the moment the competition itself has moved on.
--
-- ## Why neither engine needed changing
--
-- **Showdown** sums `league_match_scores` for the matchweek. An unplayed fixture
-- has no score row, so both duellists are judged on the same played list and the
-- duel stays fair. **Last Man Standing** already says a club with no completed
-- fixture survives — that rule was written assuming settlement happens, and now
-- it does.
--
-- ## What happens when the postponed match is finally played
--
-- It scores normally into `league_match_scores` under its original matchweek, so
-- the points land in the member's total. The DUEL does not reopen —
-- `league_score_duels` only touches `settled_at IS NULL` — because a settled
-- duel is a result, not a draft. Same for an LMS round already resolved. The
-- pick still counts; the week it was in has already been decided.
--
-- ## One thing this deliberately does NOT relax
--
-- A fixture that is COMPLETED but has no `league_fixture_state` witness still
-- blocks (migration 061). That is not a called-off match — it is the ENGINE
-- being behind, and settling then would be settling a week whose scoring had not
-- finished. ⚠ Premier League MW1 is in exactly that state right now: 10 of 10
-- complete, no witnesses, because those fixtures finished before the engine
-- existed. It stays unsettleable, and that is the separate *no catch-up scoring*
-- gap rather than this one.
-- =============================================================

CREATE OR REPLACE FUNCTION public.league_snapshot_matchweek_ranks(p_matchweek_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_season    uuid;
  v_number    integer;
  v_done      timestamptz;
  v_fixtures  integer;
  v_completed integer;
  v_unscored  integer;
  v_has_next  boolean;
  v_closed    boolean;
  v_playable  integer;
  v_rows      int := 0;
BEGIN
  SELECT m.season_id, m.matchweek_number, m.ranks_snapshot_at,
         m.fixture_count, m.completed_fixture_count
    INTO v_season, v_number, v_done, v_fixtures, v_completed
    FROM league_matchweeks m
   WHERE m.matchweek_id = p_matchweek_id;

  IF v_season IS NULL OR v_done IS NOT NULL OR COALESCE(v_fixtures, 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Migration 061. Complete is not the same as scored — but only a fixture that
  -- was actually PLAYED can have been scored, so a match that never kicked off
  -- is no longer asked for a witness it could not have.
  SELECT count(*) INTO v_unscored
    FROM league_fixtures f
    LEFT JOIN league_fixture_state s ON s.fixture_id = f.fixture_id
   WHERE f.matchweek_id = p_matchweek_id
     AND f.is_completed
     AND (s.fixture_id IS NULL OR s.is_completed IS NOT TRUE);
  IF v_unscored > 0 THEN
    RETURN 0;
  END IF;

  IF v_completed < v_fixtures THEN
    -- Something was not played. Settle anyway once the competition has moved on.
    SELECT EXISTS (
      SELECT 1 FROM league_matchweeks n
       WHERE n.season_id = v_season AND n.matchweek_number > v_number
    ) INTO v_has_next;

    IF v_has_next THEN
      SELECT EXISTS (
        SELECT 1 FROM league_matchweeks n
         WHERE n.season_id = v_season
           AND n.matchweek_number > v_number
           AND n.lock_at IS NOT NULL
           AND n.lock_at <= now()
      ) INTO v_closed;
    ELSE
      -- The final matchweek has nothing after it, so the window closes when
      -- nothing is still playable.
      SELECT count(*) INTO v_playable
        FROM league_fixtures f
       WHERE f.matchweek_id = p_matchweek_id
         AND NOT f.is_completed
         AND f.status IS DISTINCT FROM 'cancelled';
      v_closed := (v_playable = 0);
    END IF;

    IF NOT v_closed THEN
      RETURN 0;
    END IF;
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
