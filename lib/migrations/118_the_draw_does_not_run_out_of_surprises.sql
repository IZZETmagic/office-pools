-- =============================================================
-- 118 — THE DRAW DOES NOT RUN OUT OF SURPRISES
-- =============================================================
-- ⚠ BEFORE YOU RUN THIS — one live function is REPLACED
-- =============================================================
--   SELECT md5(prosrc) FROM pg_proc
--    WHERE oid = 'public.league_generate_duel_schedule'::regproc;
-- It should match migration 117's body, and nothing else. Apply 117 first.
-- =============================================================
--
-- Migration 116 seals the draw and opens it one matchweek at a time. The seal
-- has a half-life, and this is what extends it.
--
-- =============================================================
-- ## The problem: elimination
-- =============================================================
--
-- It is still a round-robin. Ten entries is nine rounds per cycle, and a member
-- who is paying attention has played everybody else by round eight — so the
-- ninth opponent is not a surprise, it is arithmetic. The back half of every
-- cycle leaks, and it leaks more the further in you get.
--
-- Sequential round order makes that worse than it needs to be: rounds arrive in
-- the same order every cycle, so by the second cycle a member does not even
-- need to eliminate. They have seen the pattern.
--
-- =============================================================
-- ## The fix: permute which ROUND lands in which matchweek, per cycle
-- =============================================================
--
-- The circle method produces `n-1` rounds. Which round is played in which
-- matchweek is a free choice — the rounds are a SET, and nothing about the
-- fixture list requires them in index order. So each cycle gets its own
-- ordering of the same rounds.
--
-- Every guarantee survives, because the multiset of pairs per cycle is
-- untouched: a cycle still contains each of the `n-1` rounds exactly once, so
-- it still covers every pair exactly once and still hands out byes one each.
-- `scripts/verify-showdown.ts` asserts all three of those directly, which is
-- what makes this change safe to make rather than merely plausible.
--
-- =============================================================
-- ## ⚠ Gate 5, honestly
-- =============================================================
--
-- The obvious objection is that a hash-ordered permutation is randomness WE
-- added, and Decision 8's fifth gate forbids that. The answer is that the
-- round-to-matchweek assignment was ALWAYS ours — there is nothing in the
-- sport that says the circle method's round 0 belongs in August. Sequential is
-- not a natural ordering inherited from anywhere; it is an arbitrary choice
-- that happens to be predictable.
--
-- What gate 5 protects is the thing a member's points depend on: **who they are
-- drawn against, and how often.** That is a property of the pair multiset, and
-- it is provably unchanged here — same rounds, same pairs, same counts, same
-- byes. One member still cannot face the pool's best picker eight times while
-- another faces them once, which is the exact failure that made us reject the
-- concept note's weekly random draw in the first place.
--
-- So this changes HOW we make a choice we were already making, not WHETHER we
-- make it. If that reading is ever disputed, the fallback is trivial: delete
-- the permutation and `v_r` returns to `v_slot`.
--
-- =============================================================
-- ## ⚠ Deterministic. Never random().
-- =============================================================
--
-- The permutation is seeded from `(pool_id, cycle)` and hashed, so regenerating
-- after a join produces the SAME future for every matchweek nobody has seen.
-- `random()` would redraw the entire remaining season every time somebody's
-- cousin joined in October — and under a sealed draw nobody could tell, which
-- makes it more dangerous rather than less. There is no way for a member to
-- audit this from the outside, so it has to be right by construction.
--
-- ## The round index is now a property of the SEASON, not of the loop
--
-- 117 (and 083 before it) derived the round from `v_k`, a counter starting at 0
-- on the first matchweek the regeneration happened to touch. That means a pool
-- regenerated in November restarts the rotation — the same rotation it already
-- played in August. Keying on the matchweek's own position in the season's lock
-- order removes that: a matchweek's round is the same whenever the generator
-- runs, so regeneration no longer silently rewinds the cycle.
--
-- Position is taken in LOCK order over the whole season, matching migration 101
-- and the reveal gate in 116 — not by matchweek number, which a moved round
-- breaks.

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
    'from_matchweek', v_from_mw
  );
END;
$fn$;

COMMENT ON FUNCTION public.league_generate_duel_schedule(uuid) IS
  'Rebuilds the unplayed remainder of a Showdown pool''s round-robin. Draws every '
  'matchweek still unlocked, EXCEPT the open one when it already has a draw. '
  'Finds the open matchweek with league_open_matchweek(), never '
  'MIN(matchweek_number). Which circle-method ROUND lands in which matchweek is '
  'permuted per cycle, hashed from (pool_id, cycle) so it is deterministic and a '
  'regeneration cannot reshuffle a future nobody has seen — the sealed draw '
  '(migration 116) would otherwise be derivable by elimination in the back half '
  'of every cycle. The pair multiset per cycle is unchanged, so gate 5 is '
  'untouched. Migrations 117 + 118.';
