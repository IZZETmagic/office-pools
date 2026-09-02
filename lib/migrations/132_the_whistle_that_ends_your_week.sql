-- =============================================================
-- 132 — THE WHISTLE THAT ENDS YOUR WEEK
-- =============================================================
-- ⚠ BEFORE YOU RUN THIS — one live function is REPLACED
--     league_lms_settle
--       md5(prosrc)          = 288e11a5fa0a53932703f373e05dfeee   (6,569 bytes)
--       md5(code, no comments) = 9b414ae294fde0b6ef2694240ea4c7bc
--   Read from production 2026-09-02, immediately before writing this file. If
--   either disagrees, something changed underneath it and the diff must be read
--   before applying — the 105/106 lesson, where a 54-byte drift turned out to be
--   comment rewording and a raw length check alone would have blocked a safe
--   apply. Hash the comment-stripped form when the raw one differs.
--
-- Plan: drafts/2026-09-02_table_mode_fix_and_rn_league_plan.md §C.
--
-- ✅ APPLIED TO PRODUCTION 2026-09-02. Both bodies re-hashed after, identical:
--   league_lms_settle               7288af51adff94e9b03dfd74f44f0d8d  (4,595 b)
--   league_lms_on_fixture_complete  eacdc4da2ddcdb8a4366942dbbdb708c  (902 b)
--
-- ## Proved against the live pool, in rolled-back transactions
--
-- The real Last Man Standing pool had **3 players standing** — the exact shape
-- that exposes the trap. Given picks where two back a club that then loses:
--
--   * one whistle → **2 eliminated, 1 standing, round NOT closed.** Before this
--     migration that would have closed the round and crowned the survivor
--   * a CORRECTION on the already-completed fixture → **all 3 standing again**.
--     This is the case that caught the first draft of the trigger, which fired
--     only on the transition to completed and so could never un-eliminate
--   * the round still closes, and a new one opens, when the matchweek snapshots
--
-- ⚠ **A SEPARATE, PRE-EXISTING DEFECT WAS FOUND WHILE TESTING THIS, and it is
-- not fixed here — see R26.** A matchweek does not snapshot on the whistle that
-- completes it. Measured: after all 10 fixtures completed one at a time, with
-- `completed_fixture_count` at 10/10 and every fixture scored,
-- `ranks_snapshot_at` was still NULL — and one further touch to any fixture set
-- it. The cause is trigger name order on `league_fixtures`:
--
--   broadcast_league_fixtures_upd → score_league_fixture_upd
--     → settle_league_lms_upd → trg_refresh_league_matchweek_window_upd
--
-- The scorer attempts the snapshot BEFORE the refresher updates the count, so
-- the count it reads is always one behind. Everything hanging off
-- `ranks_snapshot_at` is therefore late by one write: Showdown duel settlement,
-- LMS round closure, the `matchweek_completed` outbox event, and the movement
-- arrows. It self-heals in production only because the feed keeps touching
-- completed fixtures.
--
-- This migration is unaffected — its closure gate opens whenever the snapshot
-- lands, which is no later than today — but the two findings should not be
-- confused when reading a test run.
-- =============================================================
--
-- Ryan, 2026-09-02, walking the update flow mode by mode:
--
--   > That happens at the final whistle of each one.
--
-- Last Man Standing was the one mode that did not. It settled ONCE per
-- matchweek, off `league_matchweeks.ranks_snapshot_at` — the moment a matchweek
-- is both fully played and fully scored. So a member whose club lost at 3pm on
-- Saturday was told on Monday night, after the last game of the round.
--
-- Table, Pick'em and Showdown all already matched the spec. This is the fourth.
--
-- ## What did NOT need changing — the rule
--
-- The judge was already right, and its five outcomes are already covered by
-- `scripts/verify-last-man-standing.ts`:
--
--   picked club won                 → survives
--   picked club lost                → out
--   picked club DREW                → out       ⟵ confirmed by Ryan 2026-09-02:
--                                                 "only a win keeps you in it"
--   picked club had no completed fixture → survives ("you were not beaten")
--   no pick                         → out
--
-- Crucially the judge ALREADY survives a club whose fixture has not completed,
-- which is what makes it safe to run mid-matchweek at all. Calling it after one
-- fixture judges everybody, eliminates those whose club has already lost or
-- drawn, and leaves everyone whose club plays later untouched. **No new judging
-- logic is needed and none is added.**
--
-- ## ⚠ THE TRAP: eliminating and closing the round are not the same event
--
-- `league_lms_settle` also CLOSES the round when one player is left — stamps
-- winners, recomputes `rounds_won`, and opens the next round with everybody back
-- in. Left as it was, judging progressively would mean a Saturday 3pm result
-- taking the field from three to one and **crowning a winner whose own club
-- plays on Monday.** That is worse than settling late.
--
-- So the two events are separated by a single gate: the round may only close
-- when the matchweek is done.
--
-- ⚠ THE GATE IS `ranks_snapshot_at IS NOT NULL`, NOT A FIXTURE COUNT. That
-- column is the single existing definition of "this matchweek is finished", and
-- it already includes the case a naive `completed >= total` would get wrong: a
-- POSTPONED fixture, where migration 094 settles on the window closing rather
-- than on every game being played. Re-deriving the test here would re-break 094
-- by a different road — and this mode has already been broken by exactly that
-- class of duplication twice (086's lock ate the engine's own write in 088;
-- 106's empty matchweek eliminated all ten members of a production pool).
--
-- ## ⚠ AND IT NOW UNDOES ITS OWN VERDICT BEFORE RE-JUDGING
--
-- Judging once, at the end, meant every fixture was final by the time anyone was
-- eliminated. Judging progressively does not: a result corrected on Sunday must
-- be able to put back somebody eliminated on Saturday. `eliminated_matchweek`
-- was only ever SET, never cleared, so without this the first verdict would
-- stand for ever.
--
-- This is the same principle the function already applies one block down —
-- *"Recomputed from the record, never incremented: a corrected result has to be
-- able to take a round back."*
--
-- ⚠ It is safe precisely because the round is found by `last_matchweek IS NULL`.
-- A closed round is never selected, so this can only ever clear a verdict inside
-- the round that is still running — it can never strand a next round that has
-- already opened. A correction after a round has closed is a repair job, not
-- something a trigger should attempt.

CREATE OR REPLACE FUNCTION public.league_lms_settle(p_pool_id uuid, p_matchweek integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_mw_done   boolean := false;   -- ⬅ 132
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

  -- ⬅ 132. Is the matchweek FINISHED? Only then may the round close. See the
  -- header: this column, not a fixture count, because it already accounts for a
  -- postponed fixture (094).
  SELECT mw.ranks_snapshot_at IS NOT NULL INTO v_mw_done
    FROM league_matchweeks mw
   WHERE mw.season_id = v_season AND mw.matchweek_number = p_matchweek;
  v_mw_done := COALESCE(v_mw_done, false);

  -- ⬅ 132. Undo this matchweek's verdicts before re-judging them, so the
  -- function is idempotent and a result corrected on Sunday can put back
  -- somebody eliminated on Saturday. Safe because the round above was selected
  -- on `last_matchweek IS NULL` — a closed round is never reached.
  UPDATE league_lms_survivors
     SET eliminated_matchweek = NULL
   WHERE round_id = v_round
     AND eliminated_matchweek = p_matchweek;

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

  -- ⬅ 132. `AND v_mw_done`. Without it, a Saturday result can take the field
  -- from three to one and crown a winner whose own club plays on Monday.
  IF v_left <= 1 AND v_mw_done THEN
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
    -- ⬅ 132. `matchweek_done` is surfaced so an operator can tell the two
    -- reasons a round did not close apart: still more than one player, versus
    -- one player but the week is not over.
    'matchweek_done', v_mw_done,
    'round_closed', v_left <= 1 AND v_mw_done,
    'winners', CASE WHEN v_left <= 1 AND v_mw_done THEN v_winners ELSE 0 END
  );
END;
$function$;

-- ------------------------------------------------------- the whistle, per game
-- Settles every Last Man Standing pool in the season the moment a fixture goes
-- completed. The judge does the rest: entries whose club played are decided,
-- entries whose club plays later are untouched.
--
-- ⚠ ON A COMPLETED FIXTURE CHANGING, not on every goal, and not only on the
-- transition to completed.
--
--   n.is_completed  AND  (goals, is_completed) changed
--
-- Both halves earn their place, and the first draft got the second one wrong:
--
--   * `n.is_completed` — a LIVE fixture cannot eliminate anybody, because the
--     judge counts only `is_completed` games. Without this the trigger would
--     loop every pool in the season on every goal, once a minute, all afternoon,
--     to change nothing.
--   * the goals in the diff, not just the completion flag — the first version
--     fired only on `n.is_completed AND o.is_completed IS NOT TRUE`, the
--     transition. A result CORRECTED after the whistle — 0-1 restated as 2-1 —
--     leaves `is_completed` true on both sides, so it never fired and the
--     member eliminated on Saturday stayed eliminated for ever. Caught by the
--     rolled-back test, which is the only reason this comment exists.
CREATE OR REPLACE FUNCTION public.league_lms_on_fixture_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  w record;
  p record;
BEGIN
  IF COALESCE(
       (SELECT setting_value FROM sync_settings
         WHERE setting_key = 'league_db_scoring_enabled'),
       to_jsonb(true)) = to_jsonb(false)
  THEN
    RETURN NULL;
  END IF;

  FOR w IN
    SELECT DISTINCT mw.season_id, mw.matchweek_number
      FROM new_rows n
      JOIN old_rows o ON o.fixture_id = n.fixture_id
      JOIN league_matchweeks mw ON mw.matchweek_id = n.matchweek_id
     -- Completed AND something that changes a verdict moved. See the header:
     -- the goals belong in this diff, or a corrected result never re-judges.
     WHERE n.is_completed
       AND (n.home_goals, n.away_goals, n.is_completed)
           IS DISTINCT FROM
           (o.home_goals, o.away_goals, o.is_completed)
  LOOP
    FOR p IN
      SELECT pool_id FROM pools
       WHERE league_season_id = w.season_id
         AND league_mode = 'last_man_standing'
         AND archived_at IS NULL
    LOOP
      BEGIN
        PERFORM league_lms_settle(p.pool_id, w.matchweek_number);
      EXCEPTION WHEN OTHERS THEN
        -- Swallowed, like 126 and 131: raising would roll back the feed's own
        -- fixture write, losing a result to protect a verdict.
        RAISE WARNING 'league_lms_on_fixture_complete: pool % mw % failed: %',
          p.pool_id, w.matchweek_number, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  RETURN NULL;
END;
$fn$;

-- ⚠ NAMED TO SORT AFTER `score_league_fixture_upd`. Postgres fires triggers in
-- name order, and while the LMS judge reads only `league_fixtures` — so it has
-- no real dependency on the scorer — settling first would rank the pool on
-- totals the scorer is about to change, and the second ranking would be the one
-- that counts. Cheaper and clearer to run second.
DROP TRIGGER IF EXISTS settle_league_lms_upd ON public.league_fixtures;
CREATE TRIGGER settle_league_lms_upd
  AFTER UPDATE ON public.league_fixtures
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.league_lms_on_fixture_complete();

COMMENT ON FUNCTION public.league_lms_on_fixture_complete() IS
  'Statement-level AFTER UPDATE on league_fixtures: settles every Last Man '
  'Standing pool in the season when a fixture goes completed, so a member whose '
  'club lost at 3pm knows at 3pm rather than on Monday. Fires when a COMPLETED '
  'fixture''s goals or completion change — not on a live goal (the judge counts '
  'only completed games, so that would be a no-op loop over every pool once a '
  'minute), and not only on the transition to completed (a result corrected '
  'after the whistle must be able to put somebody back). The round still closes '
  'at matchweek end, gated inside league_lms_settle on ranks_snapshot_at. '
  'Migration 132.';

COMMENT ON FUNCTION public.league_lms_settle(uuid, integer) IS
  'Judges one matchweek for a last_man_standing pool. Only a WIN survives — a '
  'draw is elimination (Ryan, 2026-09-02). A club with no completed fixture '
  'survives: you were not beaten. Safe to call mid-matchweek, which is what '
  'migration 132 made it do: it clears its own verdicts for the matchweek before '
  're-judging, so a corrected result can put somebody back, and it only CLOSES '
  'the round when ranks_snapshot_at says the matchweek is finished — otherwise a '
  'Saturday result could crown a winner whose club plays Monday.';
