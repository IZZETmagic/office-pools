-- =============================================================
-- 123 — THE REVEAL IS WORTH WAITING FOR
-- =============================================================
-- ⚠ BEFORE YOU RUN THIS — one live function is REPLACED
-- =============================================================
--   SELECT md5(prosrc) FROM pg_proc
--    WHERE oid = 'public.league_duel_is_revealed'::regproc;
--   -- must be 526cbee5669230a2ef5046a1418b922e (1361 bytes) = migration 120
-- =============================================================
--
-- Ryan, 2026-08-31: *"there should be a period between when the current in-play
-- matchweek settles and a period when the user is able to reveal who they're
-- playing the next week… this is the idea of building anticipation."*
--
-- ## What was actually built before this
--
-- The intent was agreed on 30 Aug; the mechanism landed the other way and
-- nobody noticed because both numbers were 24.
--
--   119  a duel opens when the PREVIOUS matchweek settles
--   120  ...OR 24h before its own lock — a FLOOR, i.e. an earliest guarantee
--        for the postponement case, which makes the reveal EARLIER, never later
--
-- So settlement opened the next duel instantly. Worse, `league_score_duels`
-- runs off the same snapshot trigger that sets `ranks_snapshot_at`, so the
-- recap sheet and the next reveal fired in the SAME INSTANT: the member was
-- told who they beat and who they play next in one breath. There was no
-- anticipation to build because there was no gap to build it in.
--
-- ## The hold
--
--     A duel opens 48 HOURS AFTER the previous matchweek settles,
--     or 24 hours before you have to pick — whichever comes FIRST.
--
-- 48h fits every week of the season. Measured across all 37 Premier League
-- matchweek pairs, the gap from a matchweek's last kickoff (settlement is
-- minutes later) to the next lock is:
--
--     min 66h   ·   avg 168h   ·   max 502h
--     pairs under 48h: 0        pairs under 72h: 2
--
-- so the hold always completes with at least 18h of picking left, and usually
-- five days. The 120 floor stays as the backstop for the two tight weeks and
-- for a postponement that stalls settlement (094).
--
-- ## ⚠ THE RULE THAT KEEPS THIS ON THE RIGHT SIDE OF THE GATE
--
-- **The reveal opens on a CLOCK. Never on a visit, never on a tap-to-unlock.**
--
-- Miss it by three days and you simply see it three days later, with nothing
-- lost and nothing to catch up on. The moment a reveal requires the member to
-- BE somewhere at a time — "drops at 8pm", "tap to unlock" — it stops being a
-- surprise and becomes a retention mechanic, which is precisely what the
-- disclosure gate exists to catch. A walk-out animation is fine: that is how
-- you VIEW something already open, not what opens it.
--
-- And note what is NOT held back: the RESULT. The recap fires the moment the
-- duel settles, the score is on the card, the table has already moved. What
-- waits is who you play NEXT — information about the future that changes no
-- outcome and creates no obligation. That is the same argument that settled the
-- sealed draw on 30 Aug; this only chooses when in the week the seal opens.
--
-- Disclosure sentence:
--   "Your next opponent is revealed two days after your last duel is decided."

-- -------------------------------------------------------------
-- 1. When a duel opens — ONE definition, so nothing can drift
-- -------------------------------------------------------------
-- ⚠ `league_duel_is_revealed` becomes a thin wrapper over this. The rule used
-- to live in two places — the SQL policy and a hand-rolled `lock_at - 24h` in
-- `lib/league/read.ts` — which is exactly how `league_open_matchweek` ended up
-- existing four times and drifting (103). The front end now READS this instead
-- of recomputing it, and gets an exact instant to count down to rather than an
-- upper bound.

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
      (SELECT prev.ranks_snapshot_at + interval '48 hours'
         FROM league_matchweeks prev
        WHERE prev.season_id = m.season_id
          AND prev.lock_at IS NOT NULL
          AND (prev.lock_at, prev.matchweek_number) < (m.lock_at, m.matchweek_number)
        ORDER BY prev.lock_at DESC, prev.matchweek_number DESC
        LIMIT 1),
      -- The floor (120): never later than 24h before you have to pick.
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
  'The instant this pool''s duel for this matchweek opens: 48 hours after the '
  'PREVIOUS matchweek settled, or 24 hours before this one''s own lock — '
  'whichever is first. The 48h hold is the anticipation window (Ryan, '
  '2026-08-31); the 24h arm is migration 120''s floor, which covers a '
  'postponement stalling settlement (094) and the two weeks a season where the '
  'gap is under 72h. Returns -infinity for the season''s first playable '
  'matchweek, which has no predecessor and opens at once. NULL if the '
  'matchweek has no fixtures. Ordered by LOCK TIME, never matchweek number '
  '(101). Derived, never stored (110). Migration 123.';

-- -------------------------------------------------------------
-- 2. The policy predicate, now one line of arithmetic
-- -------------------------------------------------------------
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
  SELECT COALESCE(
    league_duel_reveals_at(p_pool_id, p_matchweek_number) <= now(),
    false)
$fn$;

COMMENT ON FUNCTION public.league_duel_is_revealed(uuid, integer) IS
  'Has this pool''s duel for this matchweek opened yet? A thin wrapper over '
  'league_duel_reveals_at so the rule has exactly ONE definition — it lived in '
  'two places before 123 (this function and a hand-rolled lock_at - 24h in '
  'lib/league/read.ts), which is how league_open_matchweek came to exist four '
  'times and drift (103). NULL (no fixtures) reads as NOT revealed. Used by '
  'the RLS policy from migration 116. Migrations 116 -> 119 -> 120 -> 123.';
