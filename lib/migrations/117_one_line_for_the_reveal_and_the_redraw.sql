-- =============================================================
-- 117 — ONE LINE FOR THE REVEAL AND THE REDRAW
-- =============================================================
-- ⚠ BEFORE YOU RUN THIS — one live function is REPLACED
-- =============================================================
--   SELECT md5(prosrc) FROM pg_proc
--    WHERE oid = 'public.league_generate_duel_schedule'::regproc;
-- It should match migration 100's body, and nothing else. Migration 055's
-- lesson: a file saying "dumped from the live definition" is a claim, not
-- evidence, and CREATE OR REPLACE eats whatever it disagrees with silently.
-- =============================================================
--
-- Migration 116 seals the draw until a matchweek opens. That creates a
-- requirement 100 does not currently meet.
--
-- =============================================================
-- ## The reveal line and the redraw line have to be the SAME line
-- =============================================================
--
-- 100 already refuses to redraw the live matchweek, for exactly the right
-- reason: *"redrawing it swaps the opponent of somebody who has already
-- picked."* But it finds that matchweek with its own inline rule —
--
--     SELECT MIN(matchweek_number) INTO v_first_open
--       FROM league_matchweeks
--      WHERE season_id = v_season AND (lock_at IS NULL OR lock_at > now());
--
-- — which is MIN by NUMBER, while `league_open_matchweek` is MIN by LOCK TIME.
-- Migration 101 changed the function to lock time because across three real
-- seasons the minimum gap between consecutive rounds' first kickoffs is
-- **−121 days**: 2024 round 29's earliest fixture was 19 Feb while the rest of
-- it was played on 15 Mar, so it locks before round 28.
--
-- 100 predates 103, which found the same rule written out four times and made
-- the two pick guards call the function instead. The generator was the copy
-- 103 missed.
--
-- Today that is latent. Under a sealed draw it is VISIBLE: the line below which
-- duels are revealed (116, by lock time) and the line below which regeneration
-- refuses to redraw (100, by number) would be two different lines. A member
-- would be shown "you v Priya" on Friday and find it changed on Saturday when
-- somebody joined. That is the precise failure 100 exists to prevent, reopened
-- by the seal.
--
-- =============================================================
-- ## What replaces the boundary arithmetic
-- =============================================================
--
-- 100 computed a starting matchweek NUMBER from three sources and took the
-- GREATEST. Numbers cannot express "unlocked" once rounds are out of order, so
-- the rule is now stated directly as the SET of matchweeks eligible to be drawn:
--
--     every matchweek still unlocked,
--     minus the open one if it already has a draw.
--
-- That is one predicate, used twice — once to DELETE and once to iterate — so
-- the two cannot disagree. Three things fall out of it for free:
--
--   · "never rewrite a settled duel" — a settled matchweek is fully played, so
--     its lock is in the past and it is not in the set. `settled_at IS NULL`
--     stays on the DELETE anyway, because 105 lets the sync move a kickoff and
--     a guard that costs nothing should not depend on that never mattering.
--   · "no duels for weeks the pool missed" — a locked matchweek is not in the
--     set, so a pool created in November is never scheduled into August (095).
--   · "a first generation still gets the live matchweek" — it has no draw yet,
--     so it is not excluded (100).
--
-- `from_matchweek` in the return payload is now the first matchweek actually
-- scheduled, in lock order. For every in-order season that is the same number
-- 100 returned, which is what `scripts/verify-showdown.ts` asserts.

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
  v_open_id   uuid;
  v_open_has_duels boolean;
  v_from_mw   integer;
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
  -- there. Under a sealed draw nobody can check that from the outside, which
  -- makes it more important rather than less.
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

  -- ⚠ THE one definition. Not MIN(matchweek_number) — see the header.
  v_open_id := league_open_matchweek(v_season);

  IF v_open_id IS NULL THEN
    -- Every matchweek has locked or finished. Nothing left to schedule, and
    -- falling back to matchweek 1 would recreate the bug 095 removed.
    RETURN jsonb_build_object('skipped', 'no open matchweek left', 'written', 0);
  END IF;

  -- Does the matchweek people are picking in already have a draw? If it does it
  -- is off limits: their picks would survive a redraw but the opponent they are
  -- being measured against would not. If it does not — a pool generating for the
  -- first time — they get it, or they would sit out a week for no reason.
  SELECT EXISTS (
    SELECT 1
      FROM league_duels d
      JOIN league_matchweeks m
        ON m.season_id = v_season
       AND m.matchweek_number = d.matchweek_number
     WHERE d.pool_id = p_pool_id
       AND m.matchweek_id = v_open_id
  ) INTO v_open_has_duels;

  -- The eligible set, stated once. `settled_at IS NULL` is belt and braces: a
  -- settled matchweek is already excluded by its lock being in the past.
  DELETE FROM league_duels d
   USING league_matchweeks m
   WHERE d.pool_id = p_pool_id
     AND d.settled_at IS NULL
     AND m.season_id = v_season
     AND m.matchweek_number = d.matchweek_number
     AND (m.lock_at IS NULL OR m.lock_at > now())
     AND NOT (v_open_has_duels AND m.matchweek_id = v_open_id);

  v_k := 0;
  FOR v_mw IN
    -- Same predicate as the DELETE, ordered the way 101 orders the season:
    -- by when each matchweek closes, not by what it is numbered. NULLS LAST so
    -- a matchweek with no fixtures yet does not outrank a real one.
    SELECT m.matchweek_number
      FROM league_matchweeks m
     WHERE m.season_id = v_season
       AND (m.lock_at IS NULL OR m.lock_at > now())
       AND NOT (v_open_has_duels AND m.matchweek_id = v_open_id)
     ORDER BY m.lock_at NULLS LAST, m.matchweek_number
  LOOP
    IF v_from_mw IS NULL THEN v_from_mw := v_mw; END IF;

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

COMMENT ON FUNCTION public.league_generate_duel_schedule(uuid) IS
  'Rebuilds the unplayed remainder of a Showdown pool''s round-robin. Draws every '
  'matchweek still unlocked, EXCEPT the open one when it already has a draw — '
  'redrawing that swaps the opponent of somebody who has already picked. Finds '
  'the open matchweek with league_open_matchweek(), never MIN(matchweek_number): '
  'rounds are played out of numerical order and the reveal gate in migration 116 '
  'measures the same line in lock time, so the two must agree. Migration 117.';
