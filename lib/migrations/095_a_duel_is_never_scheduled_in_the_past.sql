-- =============================================================
-- 095 — A DUEL IS NEVER SCHEDULED IN A MATCHWEEK THAT ALREADY LOCKED
-- =============================================================
-- `league_generate_duel_schedule` started at matchweek 1 for any pool with no
-- settled duels — including a pool created in November. Found on live data:
-- the six seed pools created 2026-08-25 carry **five duels in matchweek 1**, a
-- week played four days before those pools existed.
--
-- Nobody could have picked in it, so every one of those duels would settle 0-0 —
-- a draw — and hand every member a duel point for a week they were not in. The
-- bug was invisible until the matchweek-1 catch-up was about to run, which is
-- exactly when it would have paid out.
--
-- ⚠ The other two modes already got this right, which is what made it findable:
-- Last Man Standing opens its first round at the currently-open matchweek (the
-- create route), and Table mode's deadline is "the first matchweek that had not
-- yet locked". Only the duel generator counted from one.
--
-- ## The rule
--
--   start at GREATEST(last settled + 1, the first matchweek still open)
--
-- The first half is unchanged and protects results. The second is new and
-- protects the past — and note it says *still open*, not *unplayed*: a matchweek
-- that has locked but not yet finished keeps the duels it already has, because
-- its picks are already in and repairing the fixture list underneath them would
-- change who somebody was playing after they picked.
--
-- A season with no open matchweek left has nothing to schedule, and says so
-- rather than falling back to matchweek 1.
-- =============================================================

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

  v_from_mw := GREATEST(v_from_mw, v_first_open);

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

-- ---- one-off repair -------------------------------------------------------
-- Duels already written for a matchweek that had ALREADY LOCKED when their pool
-- was created. Scoped exactly that way rather than "any locked matchweek",
-- because a pool that legitimately held a duel through a lock must keep it.
DELETE FROM league_duels d
USING pools p, league_matchweeks mw
WHERE d.pool_id = p.pool_id
  AND mw.season_id = p.league_season_id
  AND mw.matchweek_number = d.matchweek_number
  AND d.settled_at IS NULL
  AND mw.lock_at IS NOT NULL
  AND mw.lock_at <= p.created_at;
