-- =============================================================
-- 083 — SHOWDOWN: the fixture list
-- =============================================================
-- ⚠⚠ SUPERSEDED IN TWO PLACES. READ THIS BEFORE THE ARGUMENT BELOW.
--
--   · Migration 116 SEALS THE DRAW. The section headed "Why the fixture list
--     is shown in advance" is no longer the product's position — Ryan
--     overturned it on 2026-08-30 and the schedule now opens one matchweek at
--     a time. 083's RLS policy is replaced there. The ROUND-ROBIN stands; only
--     the publishing was reversed.
--   · Migration 117 replaces `league_generate_duel_schedule` (as 095 and 100
--     did before it) so the reveal line and the redraw line are the same line.
--
-- The SQL below is left exactly as applied. It is a record of what ran, not a
-- specification — do not "restore" the publishing behaviour from it.
-- =============================================================
-- L-J. Showdown is a LAYER, not a peer engine (Decision 9): it consumes
-- whichever weekly accuracy number the depth produced, so it works over Results
-- or Scores without knowing which.
--
-- ## 🔴 The pairing is a ROUND-ROBIN, and that overturns the concept note
--
-- The May concept specifies *"every Monday the system randomly pairs all active
-- players"*. **That fails gate 5** of Decision 8: *every element of uncertainty
-- must be inherited from the sport; randomness we add is gambling design
-- whether or not money moves.* Under random pairing a member's duel points
-- depend on how well they picked — inherited, fine — **and on who they happened
-- to draw**, which is our dice. Across 38 matchweeks and ten players that does
-- not average out: one member can face the pool's best picker eight times and
-- another once.
--
-- Ryan's call, 2026-08-24: **published round-robin.** The concept note already
-- pointed at it — *"ten is the office sweet spot, five duels per gameweek, full
-- round-robin across the season"* — and it strengthens the note's own argument
-- that the appeal is mimicking a real league, which has a fixture list rather
-- than a weekly draw. You can also see your rival coming for weeks, which is
-- more anticipation, not less (gate 2).
--
-- ## How the schedule is built
--
-- The circle method: fix the first entry, rotate the rest. `n-1` rounds cover
-- every pair exactly once, then the cycle repeats — 10 entries gives 9 rounds,
-- so 38 matchweeks is about four and a bit full cycles and everyone plays
-- everyone within one duel of equally.
--
-- Odd pools get a NULL padding entry, which becomes a **bye**. The rotation
-- carries it around, so everybody sits out the same number of matchweeks. A bye
-- scores nothing, and says so.
--
-- ## Why rows exist before they are played
--
-- `league_duels` IS the fixture list. Unsettled rows are written at pool
-- creation so the schedule can be shown in advance, which is the honest half of
-- choosing round-robin over a draw. Regeneration NEVER touches a settled row —
-- a duel that has been played is a result, not a plan.
-- =============================================================

-- Migration 077's CHECK named only the modes that existed then. `showdown`
-- carries a depth (Decision 9: it scores differently at each), so it belongs in
-- the same arm as pickem — restated here rather than left to be inferred.
ALTER TABLE pools DROP CONSTRAINT IF EXISTS pools_league_mode_depth_ck;
ALTER TABLE pools ADD CONSTRAINT pools_league_mode_depth_ck
  CHECK (
    league_mode IS NULL
    OR (league_mode IN ('table', 'last_man_standing') AND league_depth IS NULL)
    OR (league_mode IN ('pickem', 'showdown')         AND league_depth IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS league_duels (
  duel_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id          uuid NOT NULL REFERENCES pools(pool_id) ON DELETE CASCADE,
  matchweek_number integer NOT NULL,
  entry_a          uuid NOT NULL REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  entry_b          uuid REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  accuracy_a       integer,
  accuracy_b       integer,
  points_a         integer,
  points_b         integer,
  settled_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duel_distinct_ck CHECK (entry_b IS NULL OR entry_a <> entry_b),
  CONSTRAINT duel_mw_ck CHECK (matchweek_number BETWEEN 1 AND 60)
);

COMMENT ON TABLE league_duels IS
  'One head-to-head duel: two entries, one matchweek. Also the FIXTURE LIST — rows exist unsettled from pool creation, so the schedule can be published in advance. entry_b NULL is a bye.';

COMMENT ON COLUMN league_duels.entry_b IS
  'NULL means a bye. With an odd number of entries somebody sits out each matchweek; the circle method rotates it so everyone sits out equally.';

-- An entry can appear at most ONCE per matchweek, on either side. Two partial
-- indexes rather than one constraint, because the sides are separate columns.
CREATE UNIQUE INDEX IF NOT EXISTS idx_duels_entry_a_once
  ON league_duels(pool_id, matchweek_number, entry_a);
CREATE UNIQUE INDEX IF NOT EXISTS idx_duels_entry_b_once
  ON league_duels(pool_id, matchweek_number, entry_b)
  WHERE entry_b IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_duels_pool_mw ON league_duels(pool_id, matchweek_number);

ALTER TABLE league_duels ENABLE ROW LEVEL SECURITY;

-- The whole pool sees the whole fixture list. There is nothing to hide: it is
-- published on purpose, and the picks it judges are gated separately by the
-- reveal gate.
DROP POLICY IF EXISTS "Members can view their pool's duels" ON league_duels;
CREATE POLICY "Members can view their pool's duels"
  ON league_duels FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM pool_members pm JOIN users u ON pm.user_id = u.user_id
    WHERE pm.pool_id = league_duels.pool_id
      AND u.auth_user_id = (SELECT auth.uid())
  ));

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
