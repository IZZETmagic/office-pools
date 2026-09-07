-- =============================================================
-- 138 — THE HOLD GOES BACK TO A DAY
-- =============================================================
-- ⚠ BEFORE YOU RUN THIS — one live function is REPLACED
-- =============================================================
--   SELECT md5(prosrc) FROM pg_proc
--    WHERE oid = 'public.league_duel_reveals_at(uuid,integer)'::regprocedure;
--   -- must be migration 137's body (the 6h46m58.853394s hold).
-- =============================================================
--
-- ⏳⏳ DO NOT APPLY BEFORE 2026-09-07 17:28:01 UTC (2:28pm Bermuda).
--
-- This is the one precondition, and it is not a style note. 137 pulled
-- matchweek 4's reveal forward to 2026-09-07 00:15 so the walkout could be
-- watched. Restoring 24 hours puts it back to 2026-09-07 17:28 — LATER than
-- the moment it actually opened — so applying this in between **re-seals a duel
-- that has already been revealed**:
--
--   · RLS (116) withdraws the duel row from the member's own client
--   · the band falls back to the sealed countdown and the opponent vanishes
--   · and 136's marker is already stamped, so the walkout does NOT fire again
--     when the week re-opens — the ceremony is simply lost
--
-- 128 -> 129 never hit this only because 129's 24h happened to be EARLIER than
-- 128's 28h01m. Nothing was withdrawn then. This direction is the dangerous one.
--
-- After 17:28:01 UTC both the 6h46m and the 24h answers agree that matchweek 4
-- is revealed, and the swap is invisible.
--
-- ## What this restores
--
-- 129, unchanged and for its original reasons:
--
--     Your next opponent is revealed 24 hours after the last game of the
--     previous matchweek — or 24 hours before you have to pick, whichever
--     comes first.
--
-- Chosen by Ryan on 2026-09-01 after being shown the distribution over all 37
-- real matchweek pairs: the wait is always 1.0 day, the knowing window runs
-- 1.7 to 19.8 days and averages 5.9. Three weeks a season sit behind an
-- international break; he was shown that tail and chose the settlement anchor
-- anyway.
--
-- ⚠ ONLY THE HOLD MOVES. The second `interval \'24 hours\'` is migration 120's
-- floor and was never touched by 137 either.
--
-- ## VERIFY
--
--   SELECT league_duel_reveals_at('5eed0003-0000-4000-8000-000000000003', 4)
--            AS reveals_at,
--          league_duel_reveals_at('5eed0003-0000-4000-8000-000000000003', 4) <= now()
--            AS still_revealed;
--   -- expect: 2026-09-07 17:28:01+00, and still_revealed TRUE.
--   -- ⚠ If still_revealed is FALSE you have applied this too early and have
--   --   just re-sealed a live duel. Re-apply 137 immediately.
-- =============================================================

CREATE OR REPLACE FUNCTION public.league_duel_reveals_at(
  p_pool_id          uuid,
  p_matchweek_number integer
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    -- No predecessor: the season's first playable matchweek. It opens at once,
    -- or the pool has nothing to show and no way to ever show it. `-infinity`
    -- rather than now() so the answer does not move every time it is asked.
    WHEN NOT EXISTS (
      SELECT 1 FROM league_matchweeks prev
       WHERE prev.season_id = m.season_id
         AND prev.lock_at IS NOT NULL
         AND (prev.lock_at, prev.matchweek_number) < (m.lock_at, m.matchweek_number)
    ) THEN '-infinity'::timestamptz
    ELSE LEAST(
      -- The hold. NULL while the previous matchweek is unsettled — and LEAST
      -- IGNORES NULLS in Postgres, so an unsettled predecessor falls through to
      -- the floor rather than making the whole expression NULL.
      -- 129: a day after the previous matchweek's last game (Ryan, 2026-09-01).
      -- 137's 6h46m was a throwaway to land one reveal at 21:15 for review.
      (SELECT prev.ranks_snapshot_at + interval '24 hours'
         FROM league_matchweeks prev
        WHERE prev.season_id = m.season_id
          AND prev.lock_at IS NOT NULL
          AND (prev.lock_at, prev.matchweek_number) < (m.lock_at, m.matchweek_number)
        ORDER BY prev.lock_at DESC, prev.matchweek_number DESC
        LIMIT 1),
      -- The floor (120): never later than 24h before you have to pick.
      -- ⚠ UNTOUCHED BY 137. Different rule, different migration.
      m.lock_at - interval '24 hours'
    )
  END
    FROM pools p
    JOIN league_matchweeks m
      ON m.season_id = p.league_season_id
     AND m.matchweek_number = p_matchweek_number
   WHERE p.pool_id = p_pool_id
     -- No fixtures yet means no duel to open. Also seals a matchweek the
     -- floor-of-5 has emptied (106); those duels can never settle either.
     AND m.lock_at IS NOT NULL
   LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.league_duel_reveals_at(uuid, integer) IS
  'The instant this pool''s duel for this matchweek opens: 24 HOURS after the '
  'previous matchweek''s last game (Ryan, 2026-09-01), or 24 hours before this '
  'one''s own lock — whichever is first. The second arm is migration 120''s '
  'floor, covering a postponement stalling settlement (094). Anchored on '
  'ranks_snapshot_at, NOT max(kickoff_at): a postponed fixture means the last '
  'game played is not the last game scheduled. Returns -infinity for the '
  'season''s first playable matchweek. NULL if the matchweek has no fixtures. '
  'Ordered by LOCK TIME, never matchweek number (101). Derived, never stored '
  '(110). 128''s 28h01m and 137''s 6h46m were both throwaway review windows, '
  'not decisions. Migrations 116 -> 119 -> 120 -> 123 -> 128 -> 129 -> 137 -> 138.';
