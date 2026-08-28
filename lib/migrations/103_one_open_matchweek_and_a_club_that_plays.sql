-- =============================================================
-- 103 — ONE DEFINITION OF THE OPEN MATCHWEEK, AND A CLUB THAT ACTUALLY PLAYS
-- =============================================================
-- Two problems, found together while starting L11.
--
-- ⚠ BEFORE YOU RUN THIS — two live functions are REPLACED
-- =============================================================
--   SELECT pg_get_functiondef('public.enforce_league_prediction_before_lock'::regproc);
--   SELECT pg_get_functiondef('public.enforce_lms_pick_before_lock'::regproc);
-- They should be 058's and 086's, plus nothing.
-- =============================================================


-- ------------------------------------------- 1. the rule existed FOUR times
--
-- Migration 101 changed `league_open_matchweek` to order by lock time rather
-- than matchweek number, because three real seasons contain rounds played out
-- of numerical order (minimum gap −121 days). It fixed one copy of the rule.
--
-- There were four. Both pick guards INLINE it rather than calling the function,
-- so after 101 the function and the guards disagreed in exactly the case 101
-- exists to handle: the function would open matchweek 29 while the guards were
-- still only accepting picks for 28. Every pick refused, silently, because
-- these are silent-skip triggers.
--
-- They now CALL `league_open_matchweek`. One definition, so the next change to
-- it cannot leave a guard behind.

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

  -- Unchanged from the original: a finished fixture, or a locked matchweek,
  -- takes no more picks.
  IF v_done IS TRUE THEN RETURN NULL; END IF;
  IF v_lock IS NOT NULL AND v_lock <= now() THEN RETURN NULL; END IF;

  -- Decision 16, via the one function that owns the rule. Was inlined here and
  -- ordered by matchweek_number; see the header.
  v_open := league_open_matchweek(v_season);

  IF v_open IS NULL OR v_mw <> v_open THEN RETURN NULL; END IF;

  RETURN NEW;
END;
$fn$;


-- ------------------------ 2. Last Man Standing: the club has to be playing
--
-- ⚠ THIS CLOSES AN EXPLOIT, not a cosmetic gap.
--
-- `league_lms_settle` (087) survives an entry when there is no COMPLETED fixture
-- for its club that matchweek, commented "no completed fixture: not beaten".
-- That is right for a postponement. It fires identically for a club with no
-- fixture AT ALL — so picking a club that is not playing has been a guaranteed
-- survival. In a blank matchweek, where several clubs sit out, every member
-- could pick a non-playing club and nobody would ever go out. The mode stops
-- being a game.
--
-- Blocked at the door instead of unpicked at the end, because the settle branch
-- has to stay generous: Decision 10 re-homes a moved fixture into another
-- matchweek, so a club CAN legitimately lose its fixture after somebody has
-- already picked it. Punishing that member for a fixture change they could not
-- see would be the wrong half to tighten. So:
--
--   · at PICK time  — the club must have a fixture in that matchweek (here);
--   · at SETTLE time — no completed fixture still means "not beaten" (087,
--     unchanged), which now only reaches the member the fixture moved under.
--
-- Silent-skip, like every other guard in this file: the write path reads back
-- and explains. The UI greys the club out and says why, so this is the floor
-- rather than the message.

CREATE OR REPLACE FUNCTION public.enforce_lms_pick_before_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_season   uuid;
  v_lock     timestamptz;
  v_open_id  uuid;
  v_open     integer;
  v_out      integer;
  v_club_ok  boolean;
  v_plays    boolean;
BEGIN
  SELECT po.league_season_id
    INTO v_season
    FROM league_lms_rounds r
    JOIN pools po ON po.pool_id = r.pool_id
   WHERE r.round_id = NEW.round_id;

  IF v_season IS NULL THEN
    RETURN NULL;
  END IF;

  -- Matchweek level, NOT fixture level. This is the difference between a
  -- Saturday picker and a Sunday picker who has already seen Saturday.
  SELECT mw.lock_at INTO v_lock
    FROM league_matchweeks mw
   WHERE mw.season_id = v_season AND mw.matchweek_number = NEW.matchweek_number;

  IF v_lock IS NOT NULL AND v_lock <= now() THEN
    RETURN NULL;
  END IF;

  -- Only the open matchweek accepts a pick, matching migration 058. Working
  -- ahead would let somebody bank twenty clubs before a ball is kicked.
  -- Via the shared function, for the reason in the header.
  v_open_id := league_open_matchweek(v_season);
  SELECT m.matchweek_number INTO v_open
    FROM league_matchweeks m WHERE m.matchweek_id = v_open_id;

  IF v_open IS NULL OR NEW.matchweek_number <> v_open THEN
    RETURN NULL;
  END IF;

  -- Somebody already knocked out cannot keep picking. Silent, like the rest:
  -- the write path reads back and explains.
  SELECT s.eliminated_matchweek INTO v_out
    FROM league_lms_survivors s
   WHERE s.round_id = NEW.round_id AND s.entry_id = NEW.entry_id;
  IF v_out IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM league_clubs lc WHERE lc.club_id = NEW.club_id AND lc.season_id = v_season
  ) INTO v_club_ok;
  IF NOT v_club_ok THEN
    RAISE EXCEPTION 'club % is not in this pool''s season (%)', NEW.club_id, v_season;
  END IF;

  -- ⚠ NEW — the club must actually have a fixture this matchweek. See header.
  SELECT EXISTS (
    SELECT 1
      FROM league_fixtures f
      JOIN league_matchweeks mw ON mw.matchweek_id = f.matchweek_id
     WHERE f.season_id = v_season
       AND mw.matchweek_number = NEW.matchweek_number
       AND (f.home_club_id = NEW.club_id OR f.away_club_id = NEW.club_id)
  ) INTO v_plays;
  IF NOT v_plays THEN
    RETURN NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
