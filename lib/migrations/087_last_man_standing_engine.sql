-- =============================================================
-- 087 — LAST MAN STANDING: surviving, and starting again
-- =============================================================
-- ## The three rules, and why each one is what it is
--
-- **Your club must WIN.** A draw is not survival — that is what "last man
-- standing" means everywhere it is played, and softening it would make the mode
-- last twice as long and mean half as much.
--
-- **No pick is elimination.** Not an auto-pick: choosing a club on somebody's
-- behalf would show them a decision they never made, which is the same class of
-- wrongness Decision 9 forbids when it rules out sentinel scorelines. Not a free
-- pass either — that would make forgetting better than being wrong.
--
-- **A club with no completed fixture SURVIVES.** Postponements happen, and being
-- knocked out by a match that never kicked off is a bad feeling with no sporting
-- cause behind it. It is mildly gameable — pick a club you suspect will be called
-- off — but the club-once-per-round rule prices that in: you have burned one of
-- your twenty on nothing.
--
-- ## Rounds repeat, which is the whole design
--
-- A round ends the moment one player is left. If everybody goes out in the same
-- matchweek nobody is robbed of it — they all lasted equally long, so they all
-- take the round. The next round opens the following matchweek with EVERYONE
-- back in, including whoever went out first. Season score is rounds won.
--
-- ## Ranking
--
-- `rounds_won` becomes the new leading key, ahead of Showdown's `duel_points`.
-- Both are 0 in every other mode, so all three modes share one cascade and one
-- rank writer — the alternative is three leaderboards that can disagree.
-- =============================================================

ALTER TABLE league_entry_totals
  ADD COLUMN IF NOT EXISTS rounds_won integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN league_entry_totals.rounds_won IS
  'Last Man Standing only: elimination rounds won across the season. Zero for every other mode, which is why it can lead the rank cascade unconditionally.';

CREATE OR REPLACE FUNCTION public.league_finalize_ranks(p_pool_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ranked int := 0;
BEGIN
  -- Competing entries get a position...
  WITH ranked AS (
    SELECT t.entry_id,
           ROW_NUMBER() OVER (
             -- Three modes, one ordering. Last Man Standing leads on rounds won
             -- and Showdown on duel points; both are 0 everywhere else, so the
             -- Pick'em and Table cascade below is untouched. A second rank
             -- writer is how two leaderboards start disagreeing about who won.
             ORDER BY t.rounds_won    DESC,
                      t.duel_points   DESC,
                      t.total_points  DESC,
                      t.exact_count   DESC,
                      t.correct_count DESC,
                      t.bonus_points  DESC,
                      -- rung 5: joined and picked first (decision 3). It cannot
                      -- be pool_entries.predictions_submitted_at — that column
                      -- stays NULL for every league entry by design.
                      COALESCE(
                        (SELECT min(lp.created_at) FROM league_predictions lp
                          WHERE lp.entry_id = t.entry_id),
                        'infinity'::timestamptz
                      ) ASC,
                      -- total order, so an unrelated re-score never reshuffles
                      t.entry_id ASC
           )::int AS new_rank
      FROM league_entry_totals t
      JOIN pool_entries pe ON pe.entry_id = t.entry_id
     WHERE t.pool_id = p_pool_id
       AND pe.member_id IS NOT NULL   -- detached: left or was removed
       AND pe.retired_at IS NULL      -- retired: stopped participating
  )
  UPDATE league_entry_totals t
     SET final_rank = r.new_rank,
         updated_at = now()
    FROM ranked r
   WHERE t.entry_id = r.entry_id
     AND t.final_rank IS DISTINCT FROM r.new_rank;
  GET DIAGNOSTICS v_ranked = ROW_COUNT;

  -- ...and everyone else has theirs cleared, so a retired entry cannot leave a
  -- hole in the visible order or show a stale position if it is ever rendered.
  UPDATE league_entry_totals t
     SET final_rank = NULL, previous_final_rank = NULL, updated_at = now()
    FROM pool_entries pe
   WHERE pe.entry_id = t.entry_id
     AND t.pool_id = p_pool_id
     AND (pe.member_id IS NULL OR pe.retired_at IS NOT NULL)
     AND (t.final_rank IS NOT NULL OR t.previous_final_rank IS NOT NULL);

  RETURN v_ranked;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.league_lms_open_round(p_pool_id uuid, p_matchweek integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_mode   text;
  v_round  uuid;
  v_number integer;
  v_joined integer;
BEGIN
  SELECT league_mode INTO v_mode FROM pools WHERE pool_id = p_pool_id;
  IF v_mode IS DISTINCT FROM 'last_man_standing' THEN
    RETURN jsonb_build_object('skipped', 'not a last man standing pool');
  END IF;

  -- One open round at a time — the partial unique index enforces it, and this
  -- makes the refusal explainable instead of a constraint violation.
  IF EXISTS (SELECT 1 FROM league_lms_rounds WHERE pool_id = p_pool_id AND last_matchweek IS NULL) THEN
    RETURN jsonb_build_object('skipped', 'a round is already open');
  END IF;

  SELECT COALESCE(MAX(round_number), 0) + 1 INTO v_number
    FROM league_lms_rounds WHERE pool_id = p_pool_id;

  INSERT INTO league_lms_rounds (pool_id, round_number, first_matchweek)
  VALUES (p_pool_id, v_number, p_matchweek)
  RETURNING round_id INTO v_round;

  -- EVERYONE goes back in, including whoever went out first last time. That is
  -- the point of repeating rounds: nobody is spectating in March.
  INSERT INTO league_lms_survivors (round_id, entry_id)
  SELECT v_round, pe.entry_id
    FROM pool_entries pe
    JOIN pool_members pm ON pe.member_id = pm.member_id
   WHERE pm.pool_id = p_pool_id
     AND pe.retired_at IS NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_joined = ROW_COUNT;

  RETURN jsonb_build_object('round', v_number, 'entries', v_joined, 'from_matchweek', p_matchweek);
END;
$fn$;

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

  SELECT round_id, round_number INTO v_round, v_number
    FROM league_lms_rounds
   WHERE pool_id = p_pool_id AND last_matchweek IS NULL;
  IF v_round IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no open round');
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

CREATE OR REPLACE FUNCTION public.league_settle_lms_on_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pool record;
BEGIN
  -- Same hook as Showdown: `ranks_snapshot_at` going non-NULL is already the
  -- moment a matchweek is both fully played and fully SCORED.
  FOR v_pool IN
    SELECT p.pool_id FROM pools p
     WHERE p.league_season_id = NEW.season_id
       AND p.league_mode = 'last_man_standing'
       AND p.archived_at IS NULL
  LOOP
    PERFORM league_lms_settle(v_pool.pool_id, NEW.matchweek_number);
  END LOOP;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_league_settle_lms ON league_matchweeks;
CREATE TRIGGER trg_league_settle_lms
  AFTER UPDATE OF ranks_snapshot_at ON league_matchweeks
  FOR EACH ROW
  WHEN (OLD.ranks_snapshot_at IS NULL AND NEW.ranks_snapshot_at IS NOT NULL)
  EXECUTE FUNCTION league_settle_lms_on_snapshot();
