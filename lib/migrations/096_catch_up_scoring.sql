-- =============================================================
-- 096 — CATCH-UP SCORING
-- =============================================================
-- Nine Premier League matchweek-1 fixtures finished **before the league engine
-- existed**. They are `is_completed`, they carry real scores, and they have no
-- `league_fixture_state` witness — so as far as every downstream rule is
-- concerned they were never scored.
--
-- The consequence was not "some points are missing". It was structural:
-- migration 061 requires a witness for every played fixture before a matchweek
-- may snapshot, so matchweek 1 could never settle, which means **no weekly
-- arrow, no "results are in", and — since Showdown and Last Man Standing settle
-- off that same snapshot — a duel that never resolves and a round that never
-- ends.** One gap at the start of a season quietly disabling two whole modes.
--
-- ## What this does
--
-- Finds every completed fixture with no witness and puts it back through
-- `league_score_fixture`, oldest first. That function is idempotent and
-- recomputes totals from score rows rather than incrementing, so running it on a
-- fixture that turns out to be fine changes nothing.
--
-- ## Why the notifications are suppressed
--
-- Scoring a fixture queues `fixture_scored`, which only invalidates a cache —
-- harmless. But completing a matchweek queues `matchweek_completed`, which sends
-- **"results are in"**. Catching up on a week that finished days ago would push
-- that to everybody, for football they already know the result of. That is a
-- notification with no sporting cause, which fails the disclosure gate on its
-- face — the same reasoning that stopped a recalc firing badge pushes at members
-- of finished pools.
--
-- So the events this run creates are marked processed immediately, scoped to the
-- matchweeks it actually touched. The reason is written into `last_error`, which
-- is the only free-text column the outbox has; it is a note, not a failure.
--
-- ⚠ **Not fixed here, and deliberately:** matchweek 12 fixture 111 still carries
-- `Arsenal 2-1 Manchester City`, a hand-set result from the migration 055
-- verification for a match in November. This function will happily score it,
-- because it cannot tell a fabricated result from a real one. Clearing that row
-- is its own job.
-- =============================================================

CREATE OR REPLACE FUNCTION public.league_score_missed_fixtures(p_season_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_started   timestamptz := now();
  v_fixture   record;
  v_scored    integer := 0;
  v_mws       uuid[] := ARRAY[]::uuid[];
  v_muted     integer := 0;
BEGIN
  FOR v_fixture IN
    SELECT f.fixture_id, f.matchweek_id, mw.matchweek_number, f.fixture_number
      FROM league_fixtures f
      JOIN league_matchweeks mw ON mw.matchweek_id = f.matchweek_id
      LEFT JOIN league_fixture_state s ON s.fixture_id = f.fixture_id
     WHERE f.season_id = p_season_id
       AND f.is_completed
       AND (s.fixture_id IS NULL OR s.is_completed IS NOT TRUE)
     ORDER BY mw.matchweek_number, f.fixture_number
  LOOP
    PERFORM league_score_fixture(v_fixture.fixture_id);
    v_scored := v_scored + 1;
    IF NOT (v_fixture.matchweek_id = ANY (v_mws)) THEN
      v_mws := v_mws || v_fixture.matchweek_id;
    END IF;
  END LOOP;

  -- Mute only what this run created, and only for the matchweeks it touched.
  -- A "results are in" for a week that finished days ago is a notification with
  -- no sporting cause.
  IF array_length(v_mws, 1) > 0 THEN
    UPDATE league_score_events
       SET processed_at = now(),
           last_error = 'suppressed: historical catch-up, no live notification'
     WHERE kind = 'matchweek_completed'
       AND processed_at IS NULL
       AND created_at >= v_started
       AND matchweek_id = ANY (v_mws);
    GET DIAGNOSTICS v_muted = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'scored', v_scored,
    'matchweeks', COALESCE(array_length(v_mws, 1), 0),
    'notifications_suppressed', v_muted
  );
END;
$fn$;
