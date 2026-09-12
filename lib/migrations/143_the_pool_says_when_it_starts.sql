-- =============================================================
-- 143 — THE POOL SAYS WHEN IT STARTS
-- =============================================================
-- Ryan, 2026-09-12, an hour before his own pool's first deadline:
--
--   "I set up a last man standing pool with my friends and I chose matchweek
--    five as the deadline... once I went into the pool it's asking me to select
--    something for matchweek four, which is what's happening today, and I'm
--    concerned that if I don't select a team I will be out."
--
-- He was right. `pool 86ba45f6` was created at 01:44 UTC on 2026-09-12 with the
-- wizard's deadline set to matchweek 5. `league_lms_open_round` was called with
-- **matchweek 4** — the first week whose `lock_at` had not passed — and the
-- chosen date was discarded on the way through. `prediction_deadline` on that
-- row reads `2027-05-30`, the season's last kickoff, which is the inert value
-- every league pool gets so the NOT NULL is satisfied (see the create route).
--
-- ## What was actually broken
--
-- Every league mode ALREADY has a start matchweek. None of them let anybody
-- choose it, and each derives it separately:
--
--   LMS        league_lms_rounds.first_matchweek, = first unlocked week
--   Showdown   the generator's floor (095: "a duel is never scheduled in the past")
--   Pick'em    nothing explicit — you simply cannot pick a locked week
--   Table      league_table_lock_at, which DOES honour the admin's date already
--
-- Three derivations of one idea, and a wizard step titled "First matchweek
-- deadline" that set none of them. This makes it one stored fact.
--
-- ## Why a column and not a third derivation
--
-- The alternative is to keep deriving and pass the admin's date down three call
-- paths. That is how the 500/250/0 duel scale ended up implemented in three
-- places and wrong in two of them for four days (see 121 and the programme's
-- Showdown row). One column, read by each mode as its floor.
--
-- ## The floor rule, promoted from Showdown
--
--   effective start = GREATEST(chosen, first matchweek still open)
--
-- That is 095's expression exactly, applied to all of them. It means a choice
-- can never strand a pool in a week that locked while the wizard was open —
-- creation races a deadline exactly once per week, on purpose, because the week
-- that is about to lock is the one most people are looking at.
--
-- ## Why NULL keeps meaning what it means
--
-- NULL is "no floor", which is today's behaviour exactly. Every one of the
-- existing league pools keeps it, so nothing already running moves. The column
-- only ever constrains a pool that asked for it.
--
-- ## Why table mode is excluded
--
-- Decision 11: a league table is a FULL-TIME table. There is no matchweek it
-- starts from — it is one prediction about the final standings, and its
-- deadline IS the question. `league_table_lock_at` already carries the admin's
-- date and is already immutable. Pairing the two in a CHECK, the same shape
-- `pools_league_mode_depth_ck` uses to pair mode with depth.
-- =============================================================

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS league_start_matchweek integer;

COMMENT ON COLUMN public.pools.league_start_matchweek IS
  'The matchweek this league pool plays from, chosen by its admin at creation. '
  'NULL means no floor, which is the behaviour every pool created before '
  'migration 143 has and keeps. Read as a FLOOR, never as an equality: the '
  'effective start is GREATEST(this, the first matchweek still open), so a '
  'choice cannot strand a pool in a week that locked while the wizard was open. '
  'Set at creation and immutable thereafter (trg_league_mode_immutable) — it is '
  'the week members were told the pool begins, and moving it would either void '
  'picks already filed or invent a week nobody was invited to. NULL for table '
  'mode by CHECK: a full-time table has no start matchweek, it has '
  'league_table_lock_at. NULL for all 623 World Cup pools. No column default ON '
  'PURPOSE, exactly as league_mode and league_depth avoid one.';

-- A matchweek number, in the same range every other matchweek column uses
-- (league_lms_rounds.lms_round_mw_ck, league_duels.duel_mw_ck). 60 rather than
-- 38 because the Championship plays 46 and a re-homed fixture can sit past the
-- nominal end of a season.
ALTER TABLE public.pools DROP CONSTRAINT IF EXISTS pools_league_start_mw_ck;
ALTER TABLE public.pools ADD CONSTRAINT pools_league_start_mw_ck
  CHECK (league_start_matchweek IS NULL
         OR league_start_matchweek BETWEEN 1 AND 60);

-- Only a league pool has matchweeks at all, and a table pool has no start week.
-- Both halves stated positively so the failure message names the real rule.
ALTER TABLE public.pools DROP CONSTRAINT IF EXISTS pools_league_start_mw_mode_ck;
ALTER TABLE public.pools ADD CONSTRAINT pools_league_start_mw_mode_ck
  CHECK (
    league_start_matchweek IS NULL
    OR (league_season_id IS NOT NULL AND league_mode IS DISTINCT FROM 'table')
  );

-- -------------------------------------------------------------
-- Immutability — folded into the trigger that already owns this
-- -------------------------------------------------------------
-- ⚠ A THIRD TRIGGER ON `pools` WOULD BE THE BUG THIS FILE IS ABOUT. 077 already
-- owns "what about a league pool cannot change after creation" and enforces two
-- columns there. A separate trigger would fire in name order against this one
-- and there would be two places to look when a write is refused.
--
-- Guarded on OLD being non-NULL, as the other two are, so stamping a value onto
-- a pool that has none yet still works — which is what the repair at the foot of
-- this file needs.
CREATE OR REPLACE FUNCTION public.enforce_league_mode_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF OLD.league_mode IS NOT NULL
     AND NEW.league_mode IS DISTINCT FROM OLD.league_mode THEN
    RAISE EXCEPTION
      'league_mode is fixed at pool creation (% -> %). Changing mode mid-season strands every prediction already made — twenty club positions and 380 fixture picks do not convert into one another.',
      OLD.league_mode, NEW.league_mode;
  END IF;

  -- The deadline is a promise. Moving it forward would retroactively close a
  -- window members were told was open; moving it back would reopen one they were
  -- told had shut, letting a late entry predict a table already part-decided.
  IF OLD.league_table_lock_at IS NOT NULL
     AND NEW.league_table_lock_at IS DISTINCT FROM OLD.league_table_lock_at THEN
    RAISE EXCEPTION
      'league_table_lock_at is fixed at pool creation (% -> %). It is the deadline members were shown.',
      OLD.league_table_lock_at, NEW.league_table_lock_at;
  END IF;

  -- ⬅ 143. The same promise, one level up. Moving it LATER abandons picks
  -- already filed for the weeks in between; moving it EARLIER invites members
  -- into weeks they were never asked about and, in Last Man Standing, into a
  -- week they can now be eliminated in without ever having seen a picker.
  IF OLD.league_start_matchweek IS NOT NULL
     AND NEW.league_start_matchweek IS DISTINCT FROM OLD.league_start_matchweek THEN
    RAISE EXCEPTION
      'league_start_matchweek is fixed at pool creation (% -> %). It is the matchweek members were told the pool begins.',
      OLD.league_start_matchweek, NEW.league_start_matchweek;
  END IF;

  RETURN NEW;
END;
$fn$;

-- The trigger itself is unchanged (077), and is recreated only so that applying
-- this file to a database that somehow lacks it is still correct.
DROP TRIGGER IF EXISTS trg_league_mode_immutable ON public.pools;
CREATE TRIGGER trg_league_mode_immutable
  BEFORE UPDATE ON public.pools
  FOR EACH ROW EXECUTE FUNCTION public.enforce_league_mode_immutable();

-- -------------------------------------------------------------
-- Showdown: the generator gets the floor it half-had already
-- -------------------------------------------------------------
-- 095 exists because six seed pools carried five duels in a matchweek played
-- four days before the pools existed. Nobody could pick, so every one of those
-- duels settled 0-0 — a draw — and **everybody collected for a week they were
-- not in**. That is the identical failure a pool starting at matchweek 5 would
-- have in matchweek 4, arriving by a different road.
--
-- Body below is 118's, byte-for-byte, plus one conjunct and one DECLARE. The
-- permutation, the circle fold and the sealed-draw exclusion are untouched.
--
-- ⚠ THE `DELETE` DELIBERATELY DOES NOT GET THE CONJUNCT. It clears unsettled
-- duels in unlocked weeks; leaving it unfiltered means a duel that somehow
-- exists before the start is removed and then NOT redrawn, because the loop
-- below will not reach that week. Filtering both would preserve exactly the rows
-- this migration exists to prevent.
--
-- ⚠ `pg_get_functiondef` ON THE LIVE FUNCTION WAS NOT AVAILABLE WHEN THIS WAS
-- WRITTEN — no DATABASE_URL, no psql, and PostgREST cannot read pg_catalog. The
-- body here is taken from 118 on the assumption the file matches production,
-- which is exactly the assumption `project_migration_file_drift` says to stop
-- making. HASH `prosrc` AGAINST 118 BEFORE APPLYING THIS.
CREATE OR REPLACE FUNCTION public.league_generate_duel_schedule(p_pool_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_mode      text;
  v_season    uuid;
  v_start     integer;   -- ⬅ 143
  v_base      uuid[];
  v_cur       uuid[];
  v_n         integer;
  v_rounds    integer;
  v_open_id   uuid;
  v_open_has_duels boolean;
  v_from_mw   integer;
  v_mw        integer;
  v_pos       integer;
  v_cycle     integer;
  v_slot      integer;
  v_perm      integer[];
  v_last_cycle integer := -1;
  v_r         integer;
  v_j         integer;
  v_i         integer;
  v_a         uuid;
  v_b         uuid;
  v_written   integer := 0;
BEGIN
  SELECT league_mode, league_season_id, league_start_matchweek
    INTO v_mode, v_season, v_start
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

  -- ⚠ THE one definition. Not MIN(matchweek_number) — see 117's header.
  v_open_id := league_open_matchweek(v_season);

  IF v_open_id IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no open matchweek left', 'written', 0);
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM league_duels d
      JOIN league_matchweeks m
        ON m.season_id = v_season
       AND m.matchweek_number = d.matchweek_number
     WHERE d.pool_id = p_pool_id
       AND m.matchweek_id = v_open_id
  ) INTO v_open_has_duels;

  DELETE FROM league_duels d
   USING league_matchweeks m
   WHERE d.pool_id = p_pool_id
     AND d.settled_at IS NULL
     AND m.season_id = v_season
     AND m.matchweek_number = d.matchweek_number
     AND (m.lock_at IS NULL OR m.lock_at > now())
     AND NOT (v_open_has_duels AND m.matchweek_id = v_open_id);

  FOR v_mw, v_pos IN
    -- Same eligibility predicate as the DELETE. `pos` is computed over the
    -- WHOLE season before filtering, so it is the matchweek's own place in the
    -- calendar rather than its place in this particular regeneration.
    SELECT q.matchweek_number, q.pos
      FROM (
        SELECT m.matchweek_number, m.matchweek_id, m.lock_at,
               (ROW_NUMBER() OVER (ORDER BY m.lock_at NULLS LAST, m.matchweek_number) - 1)::integer AS pos
          FROM league_matchweeks m
         WHERE m.season_id = v_season
      ) q
     WHERE (q.lock_at IS NULL OR q.lock_at > now())
       AND NOT (v_open_has_duels AND q.matchweek_id = v_open_id)
       -- ⬅ 143. A pool does not duel in a week it has not started. `pos` above
       -- is deliberately computed BEFORE this filter, so who you play in
       -- matchweek 9 does not depend on which week the pool began — two pools
       -- of the same members starting a week apart still get different
       -- opponents in the same week, which is the point of the per-cycle
       -- permutation, but neither gets a reshuffled calendar.
       AND (v_start IS NULL OR q.matchweek_number >= v_start)
     ORDER BY q.lock_at NULLS LAST, q.matchweek_number
  LOOP
    IF v_from_mw IS NULL THEN v_from_mw := v_mw; END IF;

    v_cycle := v_pos / v_rounds;
    v_slot  := v_pos % v_rounds;

    -- One permutation per cycle, hashed from the pool and the cycle number.
    -- Deterministic: the same pool regenerated a hundred times produces the
    -- same ordering, so an unrevealed matchweek does not churn.
    IF v_cycle IS DISTINCT FROM v_last_cycle THEN
      SELECT array_agg(r ORDER BY md5(p_pool_id::text || ':' || v_cycle::text || ':' || r::text))
        INTO v_perm
        FROM generate_series(0, v_rounds - 1) AS r;
      v_last_cycle := v_cycle;
    END IF;

    -- Postgres arrays are 1-based; `v_slot` is 0-based.
    v_r := v_perm[v_slot + 1];

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
  END LOOP;

  RETURN jsonb_build_object(
    'written', v_written,
    'entries', v_n - (CASE WHEN v_base[v_n] IS NULL THEN 1 ELSE 0 END),
    'rounds_per_cycle', v_rounds,
    'from_matchweek', v_from_mw,
    -- ⬅ 143. Surfaced so an operator can tell "this pool has not started yet"
    -- apart from "this pool has no entries" — both write zero duels.
    'pool_starts_at', v_start
  );
END;
$fn$;

-- =============================================================
-- The repair — the one pool this was found in
-- =============================================================
-- `Football Daddies Standing` (86ba45f6-8833-4344-8d3a-077973a26332), created
-- 2026-09-12 01:44 UTC with matchweek 5 chosen in the wizard and round 1 opened
-- at matchweek 4. Measured the same morning: 1 member, 1 entry, 0 picks filed,
-- 0 eliminations. Matchweek 4 locked at 13:00 UTC that day.
--
-- ## What would have happened without this
--
-- At the first matchweek-4 final whistle, `settle_league_lms_upd` fires,
-- `league_lms_settle` finds a standing entry with no pick, and *no pick is
-- elimination* takes him out. When matchweek 4 finishes and
-- `ranks_snapshot_at` is stamped, `v_left = 0` reaches the everybody-out branch
-- — they all went out together, so they all take the round — and he is crowned
-- winner of a round he was the only member of and never picked in.
-- `rounds_won = 1` LEADS the rank cascade, so a pool of friends who joined the
-- following week would have started the season permanently one round behind
-- their admin, for a week none of them were invited to.
--
-- That is 097 exactly. 097 stopped a round settling a matchweek that PRECEDED
-- it; this is a round that should never have covered the matchweek in the first
-- place.
--
-- ## Why moving `first_matchweek` is the whole repair
--
-- `league_lms_settle` already refuses a matchweek earlier than the round's own
-- start (097), and the read path already gates every wall column, fixture list
-- and open-week on `n >= first_matchweek` (`app/api/pools/[pool_id]/lms/route.ts`,
-- the `inRound` predicate that 106's re-homing needed). So matchweek 4 stops
-- being judged AND stops being offered, from one column.
--
-- ⚠ EVERY GUARD BELOW IS LOAD-BEARING AND THE WHOLE THING IS IDEMPOTENT. If a
-- pick has been filed for matchweek 4 by the time this runs, the round has
-- started for real and moving it would void a decision somebody made — so it
-- does nothing and says so.

DO $repair$
DECLARE
  v_pool   uuid := '86ba45f6-8833-4344-8d3a-077973a26332';
  v_round  uuid;
  v_picks  integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pools WHERE pool_id = v_pool) THEN
    RAISE NOTICE '143 repair: pool % not present, skipping', v_pool;
    RETURN;
  END IF;

  SELECT round_id INTO v_round
    FROM league_lms_rounds
   WHERE pool_id = v_pool
     AND round_number = 1
     AND last_matchweek IS NULL     -- a closed round is history, not a mistake
     AND first_matchweek = 4;       -- already 5 on a re-run

  IF v_round IS NULL THEN
    RAISE NOTICE '143 repair: no open round 1 at matchweek 4, nothing to do';
  ELSE
    SELECT count(*) INTO v_picks
      FROM league_lms_picks WHERE round_id = v_round;

    IF v_picks > 0 THEN
      RAISE EXCEPTION
        '143 repair REFUSED: round 1 of % already holds % pick(s). Moving its start would void a decision a member actually made.',
        v_pool, v_picks;
    END IF;

    UPDATE league_lms_rounds SET first_matchweek = 5 WHERE round_id = v_round;

    -- Only reachable if a matchweek-4 whistle beat this migration. The verdict
    -- was passed on a week the round no longer covers, so it is not a verdict.
    UPDATE league_lms_survivors
       SET eliminated_matchweek = NULL
     WHERE round_id = v_round
       AND eliminated_matchweek = 4;

    RAISE NOTICE '143 repair: round 1 of % moved to matchweek 5', v_pool;
  END IF;

  -- The column, so the pool now states its own start rather than implying it
  -- through a round that can close and reopen. Written second and separately:
  -- the round move above is the urgent half, this is the durable half.
  UPDATE pools
     SET league_start_matchweek = 5
   WHERE pool_id = v_pool
     AND league_start_matchweek IS NULL;
END
$repair$;
