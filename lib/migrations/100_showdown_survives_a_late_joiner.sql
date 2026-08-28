-- =============================================================
-- 100 — SHOWDOWN SURVIVES A LATE JOINER
-- =============================================================
-- Decision 10 settles that a pool can begin mid-season and a straggler picks up
-- at the next available matchweek — "the price of joining late, same as
-- fantasy". Pick'em needs nothing for that: every deadline is a kickoff, and a
-- member who was not there scores nothing for the weeks before them.
--
-- Showdown is the mode with state. Its fairness rests on a PUBLISHED
-- round-robin, and a roster change flips the rotation's parity. Most of the
-- handling is already right — 095 stopped duels being scheduled before the pool
-- existed, the schedule is ordered by `created_at` so existing pairs never
-- reshuffle, and a settled duel is never rewritten. Two things were not.
--
-- ⚠ BEFORE YOU RUN THIS — two live functions are being REPLACED
-- =============================================================
-- CREATE OR REPLACE overwrites whatever production actually holds, and a
-- migration file is a claim about that, not evidence (055 was 682 bytes short of
-- the live function). Diff both first:
--
--   SELECT pg_get_functiondef('public.league_generate_duel_schedule'::regproc);
--   SELECT pg_get_functiondef('public.league_score_duels'::regproc);
--
-- They should be 095's and 085's respectively, plus nothing.
--
-- No backfill is included and none is needed: at the time of writing production
-- holds 333 duels and ZERO settled ones, so nothing has been paid at the old
-- bye value. If that has changed by the time this runs, settled byes must be
-- re-scored before this is applied or two members will hold byes worth
-- different amounts.
-- =============================================================


-- ---------------------------------------------------- 1. a bye is worth a point
--
-- It was worth nothing, and the reasoning was sound for a fixed roster: "the
-- circle method rotates it, so in an odd-sized pool everyone sits out the same
-- number of matchweeks." That evens out over a season — and it stops being true
-- the moment people join, because each join flips the parity and restarts the
-- rotation from the next unplayed matchweek. Byes then land unevenly, and a bye
-- costs roughly 1.5 points against expectation.
--
-- A point, not zero, and the precedent is already in this codebase: Last Man
-- Standing survives a club whose match was never played, BECAUSE YOU WERE NOT
-- BEATEN. A bye is the same shape — there was no opponent, so there was no
-- defeat. It is also the version that can be explained in one sentence to the
-- person it happens to, which is the test that matters.

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
         -- A BYE IS WORTH A POINT. No opponent, so no defeat — the same rule
         -- Last Man Standing already applies to a club whose match was never
         -- played. Zero would punish a member for a fixture that did not exist,
         -- and once joins start flipping the rotation's parity the byes stop
         -- being evenly shared.
         points_a = CASE WHEN acc.b IS NULL THEN 1
                         WHEN acc.a > acc.b THEN 3
                         WHEN acc.a = acc.b THEN 1
                         ELSE 0 END,
         points_b = CASE WHEN acc.b IS NULL THEN NULL
                         WHEN acc.b > acc.a THEN 3
                         WHEN acc.a = acc.b THEN 1
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


-- ------------------------------- 2. a join never redraws the live matchweek
--
-- 095 rebuilt from `GREATEST(first unplayed, first matchweek not yet LOCKED)` —
-- and the first matchweek not yet locked is the one members are picking in RIGHT
-- NOW. So a join redrew the open week's duels and a member who had already
-- submitted found their opponent swapped underneath them. Their picks did not
-- change, but who they were measured against did, and that decides the result.
--
-- The open matchweek is now left alone WHEN IT ALREADY HAS DUELS, which
-- separates the two cases cleanly:
--
--   · a pool generating its schedule for the first time has no duels for the
--     open matchweek, so it gets one and plays immediately;
--   · a pool regenerating after somebody joined already has them, so the live
--     week stands and the joiner starts the following matchweek.
--
-- That is exactly the behaviour Decision 10 describes: the straggler sits out
-- the round in progress and is in the draw from the next one, with every
-- remaining duel redrawn so they cannot join and find themselves with no
-- fixtures.

CREATE OR REPLACE FUNCTION public.league_generate_duel_schedule(p_pool_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_mode      text;
  v_season    uuid;
  v_base      uuid[];
  v_cur       uuid[];
  v_n         integer;
  v_rounds    integer;
  v_from_mw   integer;
  v_first_open integer;
  v_open_has_duels boolean;
  v_mw        integer;
  v_k         integer;
  v_r         integer;
  v_j         integer;
  v_i         integer;
  v_a         uuid;
  v_b         uuid;
  v_written   integer := 0;
BEGIN
  SELECT league_mode, league_season_id INTO v_mode, v_season
    FROM pools WHERE pool_id = p_pool_id;
  IF v_mode IS DISTINCT FROM 'showdown' OR v_season IS NULL THEN
    RETURN jsonb_build_object('skipped', 'not a showdown pool');
  END IF;

  -- Ordered by created_at so the schedule is STABLE: regenerating after a
  -- membership change must not reshuffle the pairs of everyone who was already
  -- there, or a published fixture list means nothing.
  SELECT array_agg(pe.entry_id ORDER BY pe.created_at, pe.entry_id)
    INTO v_base
    FROM pool_entries pe
    JOIN pool_members pm ON pe.member_id = pm.member_id
   WHERE pm.pool_id = p_pool_id
     AND pe.retired_at IS NULL;

  IF v_base IS NULL OR array_length(v_base, 1) < 2 THEN
    DELETE FROM league_duels WHERE pool_id = p_pool_id AND settled_at IS NULL;
    RETURN jsonb_build_object('skipped', 'fewer than two entries', 'written', 0);
  END IF;

  -- The padding entry. Whoever it lands opposite has a bye that matchweek.
  IF array_length(v_base, 1) % 2 = 1 THEN
    v_base := v_base || ARRAY[NULL]::uuid[];
  END IF;
  v_n := array_length(v_base, 1);
  v_rounds := v_n - 1;

  -- Rebuild only from the first matchweek that has not been played. A settled
  -- duel is a result and is never rewritten.
  SELECT COALESCE(MAX(matchweek_number), 0) + 1 INTO v_from_mw
    FROM league_duels WHERE pool_id = p_pool_id AND settled_at IS NOT NULL;

  -- ...and never earlier than the first matchweek still OPEN. A pool created in
  -- November has no business holding duels for August: nobody could have picked
  -- in them, so they would settle as draws and pay everybody a point for a week
  -- they were not in.
  SELECT MIN(matchweek_number) INTO v_first_open
    FROM league_matchweeks
   WHERE season_id = v_season
     AND (lock_at IS NULL OR lock_at > now());

  IF v_first_open IS NULL THEN
    -- Every matchweek has locked. Nothing left to schedule, and falling back to
    -- matchweek 1 would recreate the bug this migration exists to remove.
    RETURN jsonb_build_object('skipped', 'no open matchweek left', 'written', 0);
  END IF;

  -- ⚠ ...and never the LIVE matchweek if it already has a draw. See the header:
  -- redrawing it swaps the opponent of somebody who has already picked.
  SELECT EXISTS (
    SELECT 1 FROM league_duels
     WHERE pool_id = p_pool_id AND matchweek_number = v_first_open
  ) INTO v_open_has_duels;

  v_from_mw := GREATEST(
    v_from_mw,
    CASE WHEN v_open_has_duels THEN v_first_open + 1 ELSE v_first_open END
  );

  DELETE FROM league_duels
   WHERE pool_id = p_pool_id AND settled_at IS NULL AND matchweek_number >= v_from_mw;

  v_k := 0;
  FOR v_mw IN
    SELECT matchweek_number FROM league_matchweeks
     WHERE season_id = v_season AND matchweek_number >= v_from_mw
     ORDER BY matchweek_number
  LOOP
    v_r := v_k % v_rounds;

    -- Round r's arrangement, computed directly rather than by mutating state
    -- across iterations: first entry fixed, the rest rotated left by r.
    v_cur := ARRAY[v_base[1]];
    FOR v_j IN 0 .. v_rounds - 1 LOOP
      v_cur := v_cur || v_base[2 + ((v_j + v_r) % v_rounds)];
    END LOOP;

    -- Fold the circle: first against last, second against second-last.
    FOR v_i IN 1 .. v_n / 2 LOOP
      v_a := v_cur[v_i];
      v_b := v_cur[v_n + 1 - v_i];

      IF v_a IS NULL AND v_b IS NULL THEN
        CONTINUE;
      END IF;
      -- Keep the padding on side B, so entry_a is always a real entry and the
      -- NOT NULL holds.
      IF v_a IS NULL THEN
        v_a := v_b;
        v_b := NULL;
      END IF;

      INSERT INTO league_duels (pool_id, matchweek_number, entry_a, entry_b)
      VALUES (p_pool_id, v_mw, v_a, v_b)
      ON CONFLICT DO NOTHING;
      v_written := v_written + 1;
    END LOOP;

    v_k := v_k + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'written', v_written,
    'entries', v_n - (CASE WHEN v_base[v_n] IS NULL THEN 1 ELSE 0 END),
    'rounds_per_cycle', v_rounds,
    'from_matchweek', v_from_mw
  );
END;
$fn$;
