-- =============================================================
-- 119 — ONE DUEL AT A TIME
-- =============================================================
-- ⚠ BEFORE YOU RUN THIS — one live function is REPLACED
-- =============================================================
--   SELECT md5(prosrc) FROM pg_proc
--    WHERE oid = 'public.league_duel_is_revealed'::regproc;
-- It should match migration 116's body, and nothing else.
-- =============================================================
--
-- Ryan, 2026-08-30, watching matchweek 2 with one fixture still to play:
--
--   *"the only thing that should be showing is the duel for whatever matchweek
--   is in play. adding on the upcoming matchweek loses focus on the current
--   duel that is ongoing. IZZETmagic should not know that they are playing
--   Marcus yet. everything should be focused on the duel with Sarah C until all
--   matches for that duel have been completed. the walk out and the theatrics
--   for matchweek 3 should not occur until after the duel with Sarah C is fully
--   completed."*
--
-- 116 revealed a duel when its matchweek OPENED FOR PICKS. That is R1, and R1
-- was chosen over this on my recommendation — the argument being that revealing
-- at completion would leave members picking a sheet before meeting the opponent
-- it would be judged against.
--
-- ## ⚠ THAT ARGUMENT WAS NOT CHECKED, AND IT IS WRONG FOR THIS COMPETITION
--
-- Measured against the real Premier League 2026/27 fixture list, over all 37
-- matchweek transitions:
--
--     minimum gap, last kickoff of MW n -> lock of MW n+1 :  66 hours
--     average                                             : 168 hours
--     transitions under 48 hours                          :   0
--     transitions where the next locks first              :   0
--
-- Even in the tightest week of the season a member gets nearly three days
-- between their duel finishing and the next one locking. The blind window is
-- the WEEKEND — precisely the time the current duel should own — and the
-- informed window is the three-to-seven days after it. There is no cost here to
-- weigh; R1's justification simply does not survive the fixture list.
--
-- ## The rule
--
--   A matchweek's duel opens when the matchweek BEFORE IT has settled.
--
-- Not "when its own fixtures are done" — that would be a matchweek revealing
-- itself, which is too late to pick in. The PREVIOUS one, so the reveal lands
-- the moment your current duel resolves: result, then walk-out.
--
-- ⚠ SETTLED MEANS `ranks_snapshot_at`, NOT `completed >= total`. A postponed
-- fixture leaves `completed < total` forever, so keying on the count would stall
-- the reveal for the rest of the season — the exact failure migration 094 was
-- written to fix, which is why 094 settles a matchweek when its WINDOW CLOSES.
-- `ranks_snapshot_at` already carries that, and it is the same stamp the duel
-- settle trigger fires on (084). Reusing it means the reveal cannot drift from
-- the result it is supposed to follow.
--
-- ⚠ THE BASE CASE IS LOAD-BEARING. The season's first playable matchweek has no
-- predecessor, and `COALESCE(..., true)` reveals it. Without that arm a brand
-- new pool would have nothing visible at all, for ever — a seal with no key.
--
-- ## What this does NOT change
--
-- Still derived, still no stored column (110). Still measured in LOCK ORDER, so
-- "the matchweek before" means the one that closed last, not the lower number —
-- rounds are played out of numerical order (101, minimum gap −121 days).
--
-- The reveal line stays INSIDE the redraw line. 117 refuses to redraw a
-- matchweek that is locked, or open-and-already-drawn; a matchweek revealed by
-- this rule is necessarily one of those two, because its predecessor settling
-- means it is either open or already locked. Nothing revealed can be rewritten,
-- which was the whole point of aligning them.

CREATE OR REPLACE FUNCTION public.league_duel_is_revealed(
  p_pool_id          uuid,
  p_matchweek_number integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM pools p
      JOIN league_matchweeks m
        ON m.season_id = p.league_season_id
       AND m.matchweek_number = p_matchweek_number
     WHERE p.pool_id = p_pool_id
       -- No fixtures yet means no duel to open. Also seals a matchweek the
       -- floor-of-5 has emptied (106); those duels can never settle either.
       AND m.lock_at IS NOT NULL
       AND COALESCE(
             (SELECT prev.ranks_snapshot_at IS NOT NULL
                FROM league_matchweeks prev
               WHERE prev.season_id = m.season_id
                 AND prev.lock_at IS NOT NULL
                 AND (prev.lock_at, prev.matchweek_number)
                       < (m.lock_at, m.matchweek_number)
               ORDER BY prev.lock_at DESC, prev.matchweek_number DESC
               LIMIT 1),
             -- No predecessor: the season's first playable matchweek. Open it,
             -- or the pool has nothing to show and no way to ever show it.
             true)
  );
$fn$;

COMMENT ON FUNCTION public.league_duel_is_revealed(uuid, integer) IS
  'Has this pool''s duel for this matchweek opened yet? True once the matchweek '
  'BEFORE it has settled (ranks_snapshot_at), so exactly one duel is live at a '
  'time and the next opponent is not known until the current duel is decided. '
  'The season''s first playable matchweek has no predecessor and is open. '
  'Ordered by LOCK TIME, never matchweek number (migration 101). Settled means '
  'ranks_snapshot_at, never completed >= total: a postponed fixture would stall '
  'the reveal for the rest of the season (migration 094). Derived, never stored '
  '(migration 110). Supersedes migration 116''s open-for-picks rule. Migration 119.';
