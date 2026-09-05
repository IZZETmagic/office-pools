-- =============================================================
-- 134 — a member who left is not an opponent, and not a winner
-- =============================================================
-- Migration 057 stopped a retired entry being SCORED by the fixture engine and
-- showing on the web leaderboard. The two engines that decide who WON something
-- were never given the same predicate, and both of them run on Showdown and Last
-- Man Standing — the two modes Premier League 2026/27 ships with.
--
-- ⚠ VERIFIED AGAINST PRODUCTION BEFORE WRITING, not taken from these files.
-- `league_lms_settle`'s stored body is 6,290 chars against 7,870 in migration
-- 132; normalising comments and whitespace both sides gives an identical 4,595
-- chars / md5 7288af51adff94e9b03dfd74f44f0d8d, so the difference is comment
-- stripping in the deploy path and NOT semantic drift. `league_score_duels`
-- matches 121 exactly. Both functions below are therefore the production logic
-- plus the marked `⬅ 134` edits, and nothing else.
--
-- ⚠ NO DATA REPAIR IS INCLUDED, because none is needed — checked, not assumed:
--     settled duels naming a retired entry ........ 0
--     retired entries in league_lms_survivors ..... 0 (crowned: 0, standing: 0)
-- This is prospective. If either count is non-zero when you apply it, stop and
-- repair first: re-running `league_score_duels` recomputes duel_points from the
-- duels, but a closed LMS round will not re-settle (`last_matchweek IS NOT NULL`
-- is never reached again) and has to be reopened by hand.
--
-- WHAT CHANGES
--
-- 1. `league_lms_settle` — a retired entry is not standing, is not counted in
--    `v_left`, and cannot be crowned. It is NOT marked eliminated: leaving and
--    being knocked out are different facts, and Decision 15 restores a season in
--    full, so the survivor row has to keep saying which one happened.
--
--    The bug: a retiree whose filed pick happened to win was crowned and the
--    round closed — while the `rounds_won` INSERT at the bottom, which already
--    filtered retired, credited the win to nobody at all.
--
-- 2. `league_score_duels` — a duel against a retired opponent settles as a BYE
--    (250), the same answer already given to a duel with no opponent. Beating a
--    ghost paid 500 leaderboard points, which then reordered the pool.
-- =============================================================

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
       -- ⬅ 134. A retired entry is not standing. It is not eliminated either —
       -- it stopped competing, which is a different fact, and Decision 15
       -- restores a season IN FULL. Marking the survivor row eliminated would
       -- destroy whether football knocked them out, so this filters at READ
       -- time and the row keeps telling the truth.
       AND EXISTS (SELECT 1 FROM pool_entries pe WHERE pe.entry_id = s.entry_id AND pe.retired_at IS NULL)
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
    FROM league_lms_survivors s
   WHERE s.round_id = v_round AND s.eliminated_matchweek IS NULL
     -- ⬅ 134. Counting a retiree here let a round of three "reduce" to one and
     -- close while two people were still playing.
     AND EXISTS (SELECT 1 FROM pool_entries pe WHERE pe.entry_id = s.entry_id AND pe.retired_at IS NULL);

  -- ⬅ 132. `AND v_mw_done`. Without it, a Saturday result can take the field
  -- from three to one and crown a winner whose own club plays on Monday.
  IF v_left <= 1 AND v_mw_done THEN
    -- One standing wins it. If NOBODY is standing they all went out together,
    -- so they all lasted equally long and they all take the round — the
    -- alternative is a round with no winner, which is a worse answer to the
    -- same football.
    IF v_left = 1 THEN
      UPDATE league_lms_survivors s SET is_winner = true
       WHERE s.round_id = v_round AND s.eliminated_matchweek IS NULL
         -- ⬅ 134. The bug this migration exists for: a retired entry whose
         -- filed pick happened to win was crowned, the round closed, and the
         -- rounds_won INSERT below — which DOES filter retired — credited the
         -- win to nobody at all.
         AND EXISTS (SELECT 1 FROM pool_entries pe WHERE pe.entry_id = s.entry_id AND pe.retired_at IS NULL);
    ELSE
      UPDATE league_lms_survivors s SET is_winner = true
       WHERE s.round_id = v_round AND s.eliminated_matchweek = p_matchweek
         -- ⬅ 134. Same rule on the all-out branch: they share the round, but
         -- only among entries that were still competing for it.
         AND EXISTS (SELECT 1 FROM pool_entries pe WHERE pe.entry_id = s.entry_id AND pe.retired_at IS NULL);
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

CREATE OR REPLACE FUNCTION public.league_score_duels(p_pool_id uuid, p_matchweek_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_mode    text;
  v_settled integer := 0;
BEGIN
  SELECT league_mode INTO v_mode FROM pools WHERE pool_id = p_pool_id;
  IF v_mode IS DISTINCT FROM 'showdown' THEN
    RETURN jsonb_build_object('skipped', 'not a showdown pool');
  END IF;

  -- The weekly accuracy number is whatever the DEPTH produced: both Results and
  -- Scores write league_match_scores.total_points, so Showdown reads one column
  -- and never learns which depth it is layered over. That is the whole reason
  -- Decision 9 calls it a layer and not a peer engine.
  WITH acc AS (
    SELECT d.duel_id,
           -- ⬅ 134. Who is still in the pool. A duel names two entries and
           -- either can have walked away between the draw and the whistle.
           EXISTS (SELECT 1 FROM pool_entries pe
                    WHERE pe.entry_id = d.entry_a AND pe.retired_at IS NOT NULL) AS a_gone,
           (d.entry_b IS NOT NULL AND EXISTS (SELECT 1 FROM pool_entries pe
                    WHERE pe.entry_id = d.entry_b AND pe.retired_at IS NOT NULL)) AS b_gone,
           COALESCE((SELECT SUM(s.total_points) FROM league_match_scores s
                      WHERE s.entry_id = d.entry_a AND s.pool_id = p_pool_id
                        AND s.matchweek_number = p_matchweek_number), 0) AS a,
           CASE WHEN d.entry_b IS NULL THEN NULL ELSE
             COALESCE((SELECT SUM(s.total_points) FROM league_match_scores s
                        WHERE s.entry_id = d.entry_b AND s.pool_id = p_pool_id
                          AND s.matchweek_number = p_matchweek_number), 0)
           END AS b
      FROM league_duels d
     WHERE d.pool_id = p_pool_id
       AND d.matchweek_number = p_matchweek_number
       AND d.settled_at IS NULL
  )
  UPDATE league_duels d
     SET accuracy_a = acc.a,
         accuracy_b = acc.b,
         -- 500 / 250 / 0 — half a perfect matchweek for a win, a quarter for a
         -- tie. These are LEADERBOARD points now, not a private 3/1/0 currency:
         -- league_finalize_ranks below adds them to what your picking scored.
         --
         -- A BYE IS WORTH A TIE. No opponent, so no defeat — the same rule Last
         -- Man Standing already applies to a club whose match was never played.
         -- Zero would punish a member for a fixture that did not exist, and
         -- once joins start flipping the rotation's parity the byes stop being
         -- evenly shared. (Migration 100, unchanged in reasoning.)
         --
         -- ⬅ 134. A RETIRED OPPONENT IS A BYE, NOT A WIN. The retiree filed no
         -- picks, so they scored 0 and the member left standing beat a ghost
         -- 500 — an advantage decided by an admin action rather than by
         -- football, which is exactly the uncertainty this product refuses to
         -- manufacture. 250 is the answer already given to "no opponent", and a
         -- retired opponent is no opponent.
         --
         -- The retiree themselves takes 0. They are filtered out of the totals
         -- INSERT below and off every leaderboard, so the number is bookkeeping
         -- rather than a score — but it must not be 500 either, in case a
         -- restore (Decision 15) ever brings the row back into view.
         points_a = CASE WHEN acc.a_gone THEN 0
                         WHEN acc.b IS NULL OR acc.b_gone THEN 250
                         WHEN acc.a > acc.b THEN 500
                         WHEN acc.a = acc.b THEN 250
                         ELSE 0 END,
         points_b = CASE WHEN acc.b IS NULL THEN NULL
                         WHEN acc.b_gone THEN 0
                         WHEN acc.a_gone THEN 250
                         WHEN acc.b > acc.a THEN 500
                         WHEN acc.a = acc.b THEN 250
                         ELSE 0 END,
         settled_at = now()
    FROM acc
   WHERE d.duel_id = acc.duel_id;
  GET DIAGNOSTICS v_settled = ROW_COUNT;

  -- INSERT, not UPDATE: an entry that has never picked has no totals row yet,
  -- and updating nothing would drop them off the leaderboard entirely. They are
  -- still in the pool, so they appear on 0 — the same call decision 11 makes for
  -- a late joiner in Table mode.
  --
  -- Recomputed from the duels, never incremented: a corrected fixture has to be
  -- able to take duel points back, exactly as the fixture engine does.
  INSERT INTO league_entry_totals (entry_id, pool_id, duel_points, updated_at)
  SELECT pe.entry_id, p_pool_id,
         COALESCE((
           SELECT SUM(CASE WHEN d.entry_a = pe.entry_id THEN d.points_a ELSE d.points_b END)
             FROM league_duels d
            WHERE d.pool_id = p_pool_id
              AND d.settled_at IS NOT NULL
              AND (d.entry_a = pe.entry_id OR d.entry_b = pe.entry_id)
         ), 0),
         now()
    FROM pool_entries pe
    JOIN pool_members pm ON pe.member_id = pm.member_id
   WHERE pm.pool_id = p_pool_id
     AND pe.retired_at IS NULL
  ON CONFLICT (entry_id) DO UPDATE
    SET duel_points = EXCLUDED.duel_points,
        updated_at  = now();

  PERFORM league_finalize_ranks(p_pool_id);

  RETURN jsonb_build_object('settled', v_settled, 'matchweek', p_matchweek_number);
END;
$fn$;
