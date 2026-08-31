-- =============================================================
-- 127 — ONE ANSWER TO WHICH DUEL IS SEALED
-- =============================================================
-- ⚠ ADDITIVE ONLY. One new function; nothing is replaced.
-- =============================================================
--
-- Ryan, 2026-08-31, on the sealed card: *"this card says matchweek four... it
-- should say matchweek three because that's the next one coming up. We just
-- finished matchweek two... right now I don't know who I'm going to be facing.
-- His opponent has gone forward a week."*
--
-- He was right, and the card was internally consistent while being wrong: it
-- named matchweek 4 and counted down 10d 15h, which IS matchweek 4's correct
-- reveal instant. It picked the wrong week and then described that week
-- accurately.
--
-- ## The bug: a mirror that stopped tracking
--
-- `lib/league/read.ts` chose the sealed matchweek with a hand-rolled copy of
-- the reveal rule:
--
--     const revealedAt = (i) =>
--       i === 0
--       || inLockOrder[i - 1].ranks_snapshot_at !== null      <-- migration 119
--       || lock_at - 24h <= now                               <-- migration 120
--
-- That is migration 119's rule: *a duel opens the moment the previous matchweek
-- settles*. Migration 123 replaced it with *48 hours after the previous
-- matchweek settles* — the anticipation window Ryan asked for. The SQL was
-- updated. This copy was not.
--
-- So when matchweek 2 settled at 20:59 tonight, the mirror declared matchweek
-- 3's duel revealed at 20:59:01 and moved on to matchweek 4. The database
-- disagreed the whole time:
--
--     mw 3   reveals_at 2026-09-02 20:59   revealed false   <-- the real answer
--     mw 4   reveals_at 2026-09-11 13:00   revealed false
--
-- ## ⚠ MIGRATION 123 PREDICTED THIS EXACTLY
--
-- Its own header says:
--
--     "The rule used to live in two places — the SQL policy and a hand-rolled
--      `lock_at - 24h` in lib/league/read.ts — which is exactly how
--      league_open_matchweek came to exist four times and drift (103). The
--      front end now READS this instead of recomputing it."
--
-- The front end did not. 123 added an RPC call for the countdown INSTANT and
-- left the SELECTION hand-rolled, so the file kept a copy of the very rule the
-- migration existed to centralise. Half a cutover reads as a whole one.
--
-- ## What this is
--
-- The selection, in SQL, next to the rule it depends on. It returns the whole
-- answer the card needs in one row, which also collapses the two round trips
-- `read.ts` was making into one:
--
--   matchweek_number  — the first duel still sealed, in LOCK order
--   reveals_at        — when it opens (the countdown target)
--   opens_after       — the matchweek that has to settle first, or NULL
--
-- ⚠ LOCK ORDER, NEVER MATCHWEEK NUMBER. A round can be moved by months (101,
-- observed gap −121 days), so "the next one" is the next to lock.
--
-- ⚠ `-infinity` is not a countdown target. The season's first playable week has
-- no predecessor and opens at once; it is never sealed, and returning it here
-- would render a card counting down to the beginning of time.
--
-- ## GUARD RULE — columns dereferenced here, verified live 2026-08-31
--   pools:             pool_id, league_season_id
--   league_matchweeks: season_id, matchweek_number, lock_at
-- =============================================================

CREATE OR REPLACE FUNCTION public.league_first_sealed_matchweek(p_pool_id uuid)
RETURNS TABLE (
  matchweek_number integer,
  reveals_at       timestamptz,
  opens_after      integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH ordered AS (
    SELECT m.matchweek_number,
           m.lock_at,
           -- ⚠ THE ONE DEFINITION. Not re-derived, not mirrored: called.
           league_duel_reveals_at(p_pool_id, m.matchweek_number) AS reveals_at,
           LAG(m.matchweek_number) OVER (ORDER BY m.lock_at, m.matchweek_number)
             AS prev_number
      FROM pools p
      JOIN league_matchweeks m ON m.season_id = p.league_season_id
     WHERE p.pool_id = p_pool_id
       AND m.lock_at IS NOT NULL
  )
  SELECT o.matchweek_number, o.reveals_at, o.prev_number
    FROM ordered o
   WHERE o.reveals_at IS NOT NULL
     AND o.reveals_at > now()          -- still sealed
     AND o.reveals_at <> '-infinity'   -- belt and braces; -infinity is never > now()
   ORDER BY o.lock_at, o.matchweek_number
   LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.league_first_sealed_matchweek(uuid) IS
  'The next duel a member cannot see yet: its matchweek, the instant it opens, '
  'and the matchweek that has to settle first. Exists because lib/league/read.ts '
  'chose this by MIRRORING the reveal rule in TypeScript, and the mirror still '
  'implemented migration 119 (open the moment the previous week settles) after '
  '123 replaced it with a 48-hour hold — so the card skipped a week the instant '
  'matchweek 2 settled and offered to count down to matchweek 4. Ordered by '
  'LOCK TIME, never matchweek number (101). Returns no row when nothing is '
  'sealed. Migration 127.';

-- =============================================================
-- VERIFY
-- =============================================================
--   select * from league_first_sealed_matchweek('<showdown pool>');
--   -- on 2026-08-31 21:07 UTC, expect: 3 | 2026-09-02 20:59 | 2
--   -- (matchweek 2 settled 20:59 tonight; 48h hold)
--
--   -- and it must agree with the policy predicate for every week:
--   select m.matchweek_number,
--          league_duel_is_revealed('<pool>', m.matchweek_number) as revealed
--     from league_matchweeks m ... ;
--   -- the first `false` in lock order is the row this function returns.
