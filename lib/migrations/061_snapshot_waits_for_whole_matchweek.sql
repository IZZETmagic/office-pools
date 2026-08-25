-- Migration 061: the arrow waits for the whole matchweek to be SCORED.
--
-- Fixes a real bug in 059, caught by scripts/verify-league-leaderboard.ts before
-- it ever ran against a member.
--
-- 059 snapshotted `previous_final_rank` as soon as the matchweek looked
-- complete — `completed_fixture_count >= fixture_count`. But "complete" and
-- "scored" are different moments, and on a normal Saturday they are minutes
-- apart: several 3pm fixtures finish together, the sync marks them ALL complete,
-- and only then scores them ONE AT A TIME. The first of those score calls would
-- see a complete matchweek and freeze the arrows against a standing that
-- included only some of the week's points — a position no member ever saw, and
-- one that every arrow for the following week would then be measured against.
--
-- The fix: also require that every fixture in the matchweek has been scored.
-- `league_fixture_state` is exactly that witness — the engine writes one row per
-- fixture it has scored, which is why it exists.
--
-- Still idempotent, still a no-op until the real moment, and `ranks_snapshot_at`
-- remains the set-once guard.

CREATE OR REPLACE FUNCTION public.league_snapshot_matchweek_ranks(p_matchweek_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_season   uuid;
  v_complete boolean;
  v_done     timestamptz;
  v_rows     int := 0;
BEGIN
  SELECT m.season_id,
         (m.fixture_count > 0 AND m.completed_fixture_count >= m.fixture_count),
         m.ranks_snapshot_at
    INTO v_season, v_complete, v_done
    FROM league_matchweeks m
   WHERE m.matchweek_id = p_matchweek_id;

  -- Not finished yet, or already frozen. Both are ordinary, not errors: this is
  -- called after every fixture and must be a no-op for all but the last.
  IF v_season IS NULL OR NOT v_complete OR v_done IS NOT NULL THEN
    RETURN 0;
  END IF;

  -- Migration 061. Complete is not the same as scored. If any fixture in this
  -- matchweek has no scored-witness row yet, the standing is still mid-flight
  -- and freezing it now would record a position nobody ever saw.
  IF EXISTS (
    SELECT 1
      FROM league_fixtures f
      LEFT JOIN league_fixture_state s ON s.fixture_id = f.fixture_id
     WHERE f.matchweek_id = p_matchweek_id
       AND (s.fixture_id IS NULL OR s.is_completed IS NOT TRUE)
  ) THEN
    RETURN 0;
  END IF;

  UPDATE league_entry_totals t
     SET previous_final_rank = t.final_rank,
         updated_at = now()
    FROM pools po
   WHERE po.pool_id = t.pool_id
     AND po.league_season_id = v_season;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  UPDATE league_matchweeks SET ranks_snapshot_at = now(), updated_at = now()
   WHERE matchweek_id = p_matchweek_id;

  RETURN v_rows;
END;
$fn$;

COMMENT ON FUNCTION public.league_snapshot_matchweek_ranks(uuid) IS
  'Decision 4. Freezes previous_final_rank = final_rank once a matchweek is '
  'fully played AND fully scored (league_fixture_state witnesses every fixture), '
  'so movement arrows are weekly while final_rank stays live. '
  'ranks_snapshot_at is the set-once guard. No-op until the real moment.';
