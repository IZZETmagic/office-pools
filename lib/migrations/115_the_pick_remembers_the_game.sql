-- =============================================================
-- 115 — THE PICK REMEMBERS THE GAME IT WAS MADE AGAINST
-- =============================================================
-- Ryan, 2026-08-30, looking at a Last Man Standing pool on a live Saturday:
--
--   > When they select a team and they've locked it in, who they faced should
--   > remain permanent. If it's three weeks ago, I want to see why I picked
--   > Arsenal and I picked them against this team, and that's why I'm still in,
--   > because they beat that team. I don't want those teams to keep rotating.
--
-- A pick has always been four columns — round, entry, matchweek, club — and the
-- OPPONENT was never one of them. Every screen re-derived it by asking
-- `league_fixtures` who that club plays, filtered to whichever matchweek was
-- open at the moment of the read. So the crest a member chose on Friday pointed
-- at a different game the following Tuesday, and a pick from three weeks ago had
-- no opponent at all — only "used in MW 2" on a greyed tile.
--
-- Deriving was not merely untidy, it was unsound. Migration 106 moves fixtures
-- between matchweeks by design, `planRehome` attaches a makeup game to the
-- weekend BEFORE — which can leave a club with two fixtures in one matchweek and
-- no rule for which one a pick meant — and a club can be re-homed out of the week
-- entirely, leaving the pick pointing at nothing.
--
-- ## The two-state contract this establishes
--
--   fixture_id IS NULL      -> not settled yet. Derive from the matchweek: it
--                              can still legitimately move, and the member needs
--                              the live truth to pick against.
--   fixture_id IS NOT NULL  -> settled. THIS is the record. Nothing re-derives
--                              it, and no later open matchweek can restate it.
--
-- The engine is the only writer, because the engine is already the thing that
-- decides — it locates the fixture that judged the week and then threw the
-- answer away. It now keeps it.
--
-- Re-running `league_lms_settle` (catch-up scoring, migration 096) recomputes
-- `fixture_id` along with `result`, deliberately and for the same reason
-- `rounds_won` is recomputed rather than incremented: a corrected result has to
-- be able to correct the record it explains. What can never happen again is a
-- pick being narrated by a DIFFERENT matchweek's fixture.
--
-- ⚠ BEFORE YOU RUN THIS — one live function is REPLACED
-- =============================================================
--   SELECT pg_get_functiondef('public.league_lms_settle'::regproc);
-- It should be 106's, plus nothing. The body below was taken from 106 verbatim
-- and edited in ONE place — the UPDATE that writes `result` and `settled_at`.
-- If the live one has drifted, reconcile FIRST: CREATE OR REPLACE eats the
-- difference without a word, and 055 was 682 bytes short of the truth.
-- =============================================================


-- ------------------------------------------------------- 1. the column
--
-- ON DELETE SET NULL, not CASCADE. If a fixture row is ever deleted the record
-- should degrade back to "derived" — losing the opponent is a worse outcome than
-- losing the pick, but losing the PICK would take a member's whole round with it.
ALTER TABLE league_lms_picks
  ADD COLUMN IF NOT EXISTS fixture_id uuid
    REFERENCES league_fixtures(fixture_id) ON DELETE SET NULL;

COMMENT ON COLUMN league_lms_picks.fixture_id IS
  'The game this pick was judged on, frozen at settle. NULL means the matchweek has not settled and the opponent is still derived live — see migration 115. Never re-derive a non-NULL one: it is what makes "I picked Arsenal and they beat Fulham" survive the season moving on.';

CREATE INDEX IF NOT EXISTS idx_lms_picks_fixture
  ON league_lms_picks(fixture_id) WHERE fixture_id IS NOT NULL;


-- ------------------------------------ 2. which fixture decided the week
--
-- One club can hold more than one fixture in a matchweek — `planRehome` has no
-- clash guard, and a makeup game lands on the weekend before. The engine's
-- verdict is EXISTS-based ("did this club win ANY completed game this week"), so
-- the fixture we record has to be the one that produced that verdict, or the
-- record would contradict the result printed beside it.
--
-- The ordering IS the verdict, in the same order the engine asks it:
--
--   a game this club WON        -> the reason they survived
--   else any COMPLETED game     -> the reason they went out
--   else the earliest scheduled -> postponed; nothing beat them, but there was
--                                  a game and naming it explains the week
--
-- `fixture_id` last, so two identical candidates still resolve the same way on
-- every call. A silent coin-flip is exactly what this migration exists to end.
CREATE OR REPLACE FUNCTION public.league_lms_deciding_fixture(
  p_season_id  uuid,
  p_matchweek  integer,
  p_club_id    uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT f.fixture_id
    FROM league_fixtures f
    JOIN league_matchweeks mw ON mw.matchweek_id = f.matchweek_id
   WHERE f.season_id = p_season_id
     AND mw.matchweek_number = p_matchweek
     AND (f.home_club_id = p_club_id OR f.away_club_id = p_club_id)
   ORDER BY
     -- COALESCE, not the bare comparison: a completed row with a NULL goal
     -- yields NULL, and `ORDER BY <null> DESC` sorts it AHEAD of true.
     COALESCE(
       (f.home_club_id = p_club_id AND f.is_completed AND f.home_goals > f.away_goals)
       OR (f.away_club_id = p_club_id AND f.is_completed AND f.away_goals > f.home_goals),
       false) DESC,
     COALESCE(f.is_completed, false) DESC,
     f.kickoff_at ASC NULLS LAST,
     f.fixture_id ASC
   LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.league_lms_deciding_fixture(uuid, integer, uuid) IS
  'The fixture that judged one LMS pick: a win first, else any completed game, else the earliest scheduled one. Mirrors league_lms_settle''s own EXISTS test so the recorded game and the recorded result can never disagree.';

-- Engines are not public (migration 102). Nothing client-side calls this — the
-- front end reads the stored fixture_id.
REVOKE EXECUTE ON FUNCTION public.league_lms_deciding_fixture(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_lms_deciding_fixture(uuid, integer, uuid) TO service_role;


-- --------------------------------------------- 3. the engine records it
--
-- 106's body verbatim. The ONLY edit is `fixture_id` on the UPDATE below,
-- marked ⬅ 115.
--
-- The lock trigger does not fire on this write: 088 scoped it to
-- `UPDATE OF club_id, matchweek_number`, because the engine recording an outcome
-- is not a member changing their pick. That scoping is what makes adding a
-- column here safe — under 086's all-columns trigger this write would have been
-- silently eaten for exactly the entries it had just eliminated.
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
         settled_at = now(),
         -- ⬅ 115. The game that produced the verdict on the same row as the
         -- verdict. From here the opponent is a stored fact, not a query.
         fixture_id = league_lms_deciding_fixture(v_season, p_matchweek, pk.club_id)
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


-- ------------------------------------------------------ 4. the backfill
--
-- Every already-settled pick gets the game it was judged on, by the same rule
-- the engine now uses. Without this a member's history would begin abruptly at
-- whichever matchweek settled after this deploy, with everything before it
-- silently opponent-less — the same half-populated shape that makes a bug look
-- like a design.
--
-- Settled rows only. An unsettled pick is supposed to be NULL: that is the
-- signal to derive live, and pre-filling it would freeze an opponent that can
-- still legitimately move.
UPDATE league_lms_picks pk
   SET fixture_id = league_lms_deciding_fixture(p.league_season_id, pk.matchweek_number, pk.club_id)
  FROM league_lms_rounds r
  JOIN pools p ON p.pool_id = r.pool_id
 WHERE pk.round_id = r.round_id
   AND pk.settled_at IS NOT NULL
   AND pk.fixture_id IS NULL
   AND p.league_season_id IS NOT NULL;
