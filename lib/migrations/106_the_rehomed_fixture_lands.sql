-- =============================================================
-- 106 — THE RE-HOMED FIXTURE IS WRITTEN, AND AN EMPTY WEEK STOPS BEING A TRAP
-- =============================================================
-- 105 taught the sync to see a fixture move. This is where the move lands: our
-- matchweeks are PICKING rounds, and a game played in February is picked in
-- February whatever round the league calls it.
--
-- The policy — which fixture goes where, and the floor of five under which a
-- round stops being a round — lives in `lib/league/rehome.ts`, tested against
-- three real Premier League seasons. This function does not re-derive any of
-- it. It applies a list, and refuses anything the policy should never have
-- asked for.
--
-- ⚠ BEFORE YOU RUN THIS — two live functions are REPLACED
-- =============================================================
--   SELECT pg_get_functiondef('public.league_snapshot_matchweek_ranks'::regproc);
--   SELECT pg_get_functiondef('public.league_lms_settle'::regproc);
-- They should be 094's and 097's respectively, plus nothing. Both bodies below
-- were taken from those files verbatim and edited in one place each; if the live
-- ones have drifted, reconcile FIRST — CREATE OR REPLACE eats the difference
-- without a word.
-- =============================================================
--
-- ## Why parts 2 and 3 are in this migration and not a later one
--
-- Re-homing EMPTIES a matchweek. Measured over 2022-24, exactly one a season,
-- in all three. And an empty matchweek was, until this migration, a permanent
-- stall: `league_snapshot_matchweek_ranks` refused to settle one, and both
-- Showdown and Last Man Standing settle off that snapshot going non-NULL. So
-- shipping part 1 alone would freeze every Showdown and LMS pool in the league
-- around March, once a year, for good.
--
-- Showdown needed nothing: its accuracy sums COALESCE to 0, so a week with no
-- games is 0-0, a draw, a point each — which is also the honest answer. Last
-- Man Standing needed part 3, because its "no pick is elimination" rule fires
-- on a week nobody COULD pick in and takes the entire pool out at once. That is
-- not a hypothetical: it happened in production in August, and 097 fixed the
-- other road to it.
-- =============================================================


-- --------------------------------------------------------------- 1. the write
--
-- Every guard here is also in the planner, and that is the point: the planner
-- decides, but it is one deploy away from being wrong, and this is the thing
-- that cannot be bypassed. A move is refused unless
--
--   · the fixture is in this season, and so is its destination — otherwise a
--     malformed payload could file a fixture under another competition;
--   · the fixture has not been played (re-homing a played match restates a
--     scored week);
--   · no admin has taken it over;
--   · NEITHER matchweek has locked. Both, and they are different questions:
--     the source protects predictions already made, the destination protects
--     people from being scored on a fixture that appeared after they picked.

CREATE OR REPLACE FUNCTION public.league_apply_rehome(
  p_season_id uuid,
  p_moves     jsonb,
  p_now       timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_moved jsonb := '[]'::jsonb;
BEGIN
  IF p_moves IS NULL OR jsonb_array_length(p_moves) = 0 THEN
    RETURN jsonb_build_object('moved', 0, 'fixtures', '[]'::jsonb);
  END IF;

  -- Same lock as league_apply_fixture_sync, and usually the same transaction:
  -- the window trigger aggregates over the fixture list, and two runs
  -- interleaving leave both matchweeks' counts wrong in a way nothing notices.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_season_id::text, 0));

  WITH m AS (
    SELECT * FROM jsonb_to_recordset(p_moves) AS x(
      fixture_id       uuid,
      to_matchweek_id  uuid
    )
  ),
  upd AS (
    UPDATE league_fixtures f
       SET matchweek_id = m.to_matchweek_id,
           updated_at   = p_now
      FROM m
      JOIN league_matchweeks dst ON dst.matchweek_id = m.to_matchweek_id
     WHERE f.fixture_id  = m.fixture_id
       AND f.season_id   = p_season_id
       AND dst.season_id = p_season_id
       AND f.matchweek_id IS DISTINCT FROM m.to_matchweek_id
       AND NOT f.is_completed
       AND NOT f.manual_override
       AND (dst.lock_at IS NULL OR dst.lock_at > p_now)
       -- The source is checked as an EXISTS rather than a second join: the
       -- update target cannot be referenced from a FROM-list join condition,
       -- and reaching for f.matchweek_id there fails at CREATE time.
       AND EXISTS (
             SELECT 1 FROM league_matchweeks src
              WHERE src.matchweek_id = f.matchweek_id
                AND (src.lock_at IS NULL OR src.lock_at > p_now)
           )
    RETURNING f.fixture_id, f.external_fixture_id, f.matchweek_id, f.kickoff_at
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb) INTO v_moved FROM upd u;

  RETURN jsonb_build_object('moved', jsonb_array_length(v_moved), 'fixtures', v_moved);
END;
$fn$;

COMMENT ON FUNCTION public.league_apply_rehome(uuid, jsonb, timestamptz) IS
  'Applies a re-homing plan from lib/league/rehome.ts: moves fixtures between '
  'matchweeks so a game is PICKED in the round it is PLAYED in. Refuses a move '
  'whose fixture or destination is in another season, whose fixture is completed '
  'or manually overridden, or where EITHER matchweek has already locked. Writing '
  'matchweek_id fires trg_refresh_league_matchweek_window_upd, which recomputes '
  'both sides. Returns what actually moved, never what was asked.';


-- -------------------------------------------- 2. an empty matchweek settles
-- Body from 094, one guard changed and one branch widened.

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

  -- 106: `COALESCE(v_fixtures, 0) = 0` USED TO BE PART OF THIS TEST, and it made
  -- an empty matchweek permanently unsettleable — the exact stall 094 exists to
  -- fix, reached by a different road. Re-homing empties roughly one matchweek a
  -- season by design, and both Showdown and Last Man Standing settle off
  -- `ranks_snapshot_at`, so a matchweek that never snapshots holds them shut for
  -- the rest of the season. A week with no games is now a week with no games:
  -- it settles, on nothing, once its window has closed.
  IF v_season IS NULL OR v_done IS NOT NULL THEN
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

  -- `v_fixtures = 0` joins this branch rather than skipping it: 0 < 0 is false, so
  -- an empty matchweek would otherwise settle the moment it was asked, months
  -- before anybody reached it, and take every duel in the season with it.
  IF v_completed < v_fixtures OR v_fixtures = 0 THEN
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


-- ----------------------------------- 3. an empty matchweek eliminates nobody
-- Body from 097, one guard added.

CREATE OR REPLACE FUNCTION public.league_lms_settle(p_pool_id uuid, p_matchweek integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_mode      text;
  v_season    uuid;
  v_round     uuid;
  v_number    integer;
  v_first     integer;
  v_out       integer := 0;
  v_left      integer;
  v_winners   integer := 0;
  v_next      integer;
  v_played    integer;
BEGIN
  SELECT p.league_mode, p.league_season_id INTO v_mode, v_season
    FROM pools p WHERE p.pool_id = p_pool_id;
  IF v_mode IS DISTINCT FROM 'last_man_standing' OR v_season IS NULL THEN
    RETURN jsonb_build_object('skipped', 'not a last man standing pool');
  END IF;

  SELECT round_id, round_number, first_matchweek INTO v_round, v_number, v_first
    FROM league_lms_rounds
   WHERE pool_id = p_pool_id AND last_matchweek IS NULL;
  IF v_round IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no open round');
  END IF;

  -- A matchweek from before this round started is not this round's business.
  -- Without this, catching up an old matchweek eliminates everybody for failing
  -- to pick in a round that did not exist yet.
  IF p_matchweek < v_first THEN
    RETURN jsonb_build_object('skipped', 'matchweek precedes the round',
                              'round', v_number, 'round_starts', v_first);
  END IF;

  -- 106. ⚠ THE SAME SHAPE AS THE BUG ABOVE, AND JUST AS TOTAL. `pk.club_id IS
  -- NULL THEN false` reads a missing pick as elimination, which is right in a
  -- week that was played and catastrophic in a week that was not: an empty
  -- matchweek never opens (`league_open_matchweek` skips fixture_count = 0), so
  -- NOBODY has a pick, so everybody goes out at once. Re-homing's floor empties
  -- about one matchweek a season, so this is not a corner — it is annual.
  SELECT count(*) INTO v_played
    FROM league_fixtures f
    JOIN league_matchweeks mw ON mw.matchweek_id = f.matchweek_id
   WHERE f.season_id = v_season AND mw.matchweek_number = p_matchweek;
  IF v_played = 0 THEN
    RETURN jsonb_build_object('skipped', 'no fixtures in this matchweek',
                              'round', v_number, 'matchweek', p_matchweek);
  END IF;

  -- Judge every entry still standing. `survived` is deliberately generous in one
  -- direction only: a club whose fixture never completed was not beaten.
  WITH standing AS (
    SELECT s.entry_id
      FROM league_lms_survivors s
     WHERE s.round_id = v_round AND s.eliminated_matchweek IS NULL
  ),
  judged AS (
    SELECT st.entry_id,
           pk.club_id,
           CASE
             WHEN pk.club_id IS NULL THEN false          -- no pick is elimination
             WHEN NOT EXISTS (
               SELECT 1 FROM league_fixtures f
                JOIN league_matchweeks mw ON mw.matchweek_id = f.matchweek_id
               WHERE f.season_id = v_season
                 AND mw.matchweek_number = p_matchweek
                 AND f.is_completed
                 AND (f.home_club_id = pk.club_id OR f.away_club_id = pk.club_id)
             ) THEN true                                  -- no completed fixture: not beaten
             ELSE EXISTS (
               SELECT 1 FROM league_fixtures f
                JOIN league_matchweeks mw ON mw.matchweek_id = f.matchweek_id
               WHERE f.season_id = v_season
                 AND mw.matchweek_number = p_matchweek
                 AND f.is_completed
                 AND ((f.home_club_id = pk.club_id AND f.home_goals > f.away_goals)
                   OR (f.away_club_id = pk.club_id AND f.away_goals > f.home_goals))
             )
           END AS survived
      FROM standing st
      LEFT JOIN league_lms_picks pk
             ON pk.round_id = v_round
            AND pk.entry_id = st.entry_id
            AND pk.matchweek_number = p_matchweek
  )
  UPDATE league_lms_survivors s
     SET eliminated_matchweek = p_matchweek
    FROM judged j
   WHERE s.round_id = v_round
     AND s.entry_id = j.entry_id
     AND j.survived = false;
  GET DIAGNOSTICS v_out = ROW_COUNT;

  UPDATE league_lms_picks pk
     SET result = CASE WHEN s.eliminated_matchweek = p_matchweek THEN 'eliminated' ELSE 'survived' END,
         settled_at = now()
    FROM league_lms_survivors s
   WHERE pk.round_id = v_round
     AND pk.matchweek_number = p_matchweek
     AND s.round_id = v_round
     AND s.entry_id = pk.entry_id;

  SELECT count(*) INTO v_left
    FROM league_lms_survivors
   WHERE round_id = v_round AND eliminated_matchweek IS NULL;

  IF v_left <= 1 THEN
    -- One standing wins it. If NOBODY is standing they all went out together,
    -- so they all lasted equally long and they all take the round — the
    -- alternative is a round with no winner, which is a worse answer to the
    -- same football.
    IF v_left = 1 THEN
      UPDATE league_lms_survivors SET is_winner = true
       WHERE round_id = v_round AND eliminated_matchweek IS NULL;
    ELSE
      UPDATE league_lms_survivors SET is_winner = true
       WHERE round_id = v_round AND eliminated_matchweek = p_matchweek;
    END IF;
    GET DIAGNOSTICS v_winners = ROW_COUNT;

    UPDATE league_lms_rounds SET last_matchweek = p_matchweek WHERE round_id = v_round;

    -- Recomputed from the record, never incremented: a corrected result has to
    -- be able to take a round back.
    INSERT INTO league_entry_totals (entry_id, pool_id, rounds_won, updated_at)
    SELECT pe.entry_id, p_pool_id,
           COALESCE((
             SELECT count(*) FROM league_lms_survivors w
               JOIN league_lms_rounds r ON r.round_id = w.round_id
              WHERE r.pool_id = p_pool_id AND w.entry_id = pe.entry_id AND w.is_winner
           ), 0),
           now()
      FROM pool_entries pe
      JOIN pool_members pm ON pe.member_id = pm.member_id
     WHERE pm.pool_id = p_pool_id AND pe.retired_at IS NULL
    ON CONFLICT (entry_id) DO UPDATE
      SET rounds_won = EXCLUDED.rounds_won, updated_at = now();

    -- Straight into the next one, if the season has a next one.
    SELECT MIN(matchweek_number) INTO v_next
      FROM league_matchweeks
     WHERE season_id = v_season AND matchweek_number > p_matchweek;
    IF v_next IS NOT NULL THEN
      PERFORM league_lms_open_round(p_pool_id, v_next);
    END IF;
  END IF;

  PERFORM league_finalize_ranks(p_pool_id);

  RETURN jsonb_build_object(
    'round', v_number, 'eliminated', v_out, 'standing', v_left,
    'round_closed', v_left <= 1, 'winners', CASE WHEN v_left <= 1 THEN v_winners ELSE 0 END
  );
END;
$fn$;
