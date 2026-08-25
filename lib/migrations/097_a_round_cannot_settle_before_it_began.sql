-- =============================================================
-- 097 — A ROUND CANNOT SETTLE A MATCHWEEK BEFORE IT BEGAN
-- =============================================================
-- Caught in production, by running the matchweek-1 catch-up (096) and reading
-- the result rather than assuming it.
--
-- `league_lms_settle(pool, matchweek)` judged **every entry still standing**,
-- with no check that the matchweek belonged to the open round. The seed pool's
-- round 1 begins at matchweek 2 — correctly, it was created after matchweek 1
-- was played — but catching up matchweek 1 fired the settle trigger for
-- matchweek 1, and:
--
--   round 1: first_matchweek 2, last_matchweek 1, eliminated 10, winners 10
--
-- A round that closed one matchweek **before it opened**. Nobody had a pick for
-- matchweek 1 — the round did not exist then — so "no pick is elimination" took
-- all ten out at once, which under the everybody-out rule made all ten joint
-- winners of a round they never played. Then round 2 opened and their eight real
-- matchweek-2 picks were left behind in a closed round.
--
-- ## The fix
--
-- One guard: a matchweek earlier than the round's `first_matchweek` is not this
-- round's business. It is the same class of mistake migration 095 fixed for
-- Showdown an hour earlier — a mode reaching back into matchweeks that were
-- played before its pool existed. Two modes, two places, same blind spot.
--
-- ## The repair
--
-- Scoped to an exactly-impossible signature: `last_matchweek < first_matchweek`,
-- a round that closed before it began. That cannot be a legitimate state, so the
-- repair cannot touch a real one.
--
--   1. delete the round auto-opened by the bad closure — only where it holds no
--      picks and no eliminations, so a round anybody has actually played is
--      never removed
--   2. reopen the impossible round: clear its closure, its eliminations and its
--      phantom winners
--   3. recompute `rounds_won` from the record, never by decrementing
--
-- The picks themselves were never touched — they are still attached to the round
-- that gets reopened, which is why this is repairable at all.
-- =============================================================

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

-- ---- repair -------------------------------------------------------------
-- 1. Remove the round auto-opened by an impossible closure, but only where
--    nobody has played in it.
DELETE FROM league_lms_rounds later
USING league_lms_rounds bad
WHERE bad.last_matchweek < bad.first_matchweek
  AND later.pool_id = bad.pool_id
  AND later.round_number > bad.round_number
  AND NOT EXISTS (SELECT 1 FROM league_lms_picks pk WHERE pk.round_id = later.round_id)
  AND NOT EXISTS (
    SELECT 1 FROM league_lms_survivors s
     WHERE s.round_id = later.round_id AND s.eliminated_matchweek IS NOT NULL
  );

-- 2. Reopen the impossible round and undo its phantom eliminations and wins.
UPDATE league_lms_survivors s
   SET eliminated_matchweek = NULL, is_winner = false
  FROM league_lms_rounds bad
 WHERE s.round_id = bad.round_id
   AND bad.last_matchweek < bad.first_matchweek;

UPDATE league_lms_rounds
   SET last_matchweek = NULL
 WHERE last_matchweek < first_matchweek;

-- 3. Recompute rounds_won from the record for every affected pool.
UPDATE league_entry_totals t
   SET rounds_won = COALESCE((
         SELECT count(*) FROM league_lms_survivors w
           JOIN league_lms_rounds r ON r.round_id = w.round_id
          WHERE r.pool_id = t.pool_id AND w.entry_id = t.entry_id AND w.is_winner
       ), 0),
       updated_at = now()
 WHERE t.pool_id IN (SELECT pool_id FROM pools WHERE league_mode = 'last_man_standing');
