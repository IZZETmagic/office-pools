-- =============================================================
-- 128 — THE REVEAL LANDS AT TEN TONIGHT  (⏳ TEMPORARY — REPLACE ME)
-- =============================================================
-- ⚠ BEFORE YOU RUN THIS — one live function is REPLACED
-- =============================================================
--   SELECT md5(prosrc) FROM pg_proc
--    WHERE oid = 'public.league_duel_reveals_at'::regproc;
--   -- must be 1b5e015736f1de6f9645ac83a5f81674 (1584 bytes) = migration 123
-- =============================================================
--
-- Ryan, 2026-09-01: *"update the showdown reveal timer to reveal at 10pm
-- Bermuda time today… and then when I review all of that we need to update the
-- length of the time after the last game settles because 48 hours is too long."*
--
-- ## This is a REVIEW WINDOW, not a rule
--
-- Two changes were asked for and they are deliberately kept apart:
--
--   128 (this)  move tonight's reveal to a time Ryan can sit and watch it
--   129 (next)  the real hold, chosen AFTER he has watched it
--
-- Nothing here is a considered answer to "how long should the hold be". It is
-- one number picked to make one flip happen at one moment so the walk-out can
-- be reviewed live. **Do not read 28h as a decision.** 129 replaces it.
--
-- ## Why 28 hours 1 minute, which is obviously not a round number
--
-- The reveal instant is DERIVED (110/123) — there is no stored switch to set,
-- and that is the right design, so this does not add one. The only lever is the
-- hold, and the arithmetic is fixed at both ends:
--
--   matchweek 2 settled   2026-08-31 20:59:00.888 UTC
--   target                2026-09-01 22:00      Bermuda  (ADT, UTC−3)
--                       = 2026-09-02 01:00      UTC
--   difference            28h 00m 59.1s
--
-- so the hold is 28h01m and matchweek 3 opens at 01:00:00.888 UTC — 10:00:00.9pm
-- in Bermuda. Any ROUND value fails: 27h or less had already elapsed by the time
-- this was written (the flip would fire on apply, with nothing to watch), and the
-- next round value up, 30h, lands at midnight Bermuda.
--
-- ## Blast radius — the two seeded test pools, and nothing else
--
-- `league_duel_reveals_at` gates the Showdown draw only. Verified live against
-- `pools` on 2026-09-02: exactly two pools carry `league_mode = 'showdown'`, and
-- both are the seeded UX pools —
--
--   5eed0003-…-000000000003  Showdown Duels
--   5eed0004-…-000000000004  Showdown: Exact Scores
--
-- No member-facing pool is in Showdown mode, so no real member's reveal moves.
-- Re-run that check before assuming it still holds.
--
-- ## ⚠ THE GATE THIS MUST NOT WALK INTO
--
-- 123's header is explicit: the reveal opens on a CLOCK, never on a visit or a
-- tap — and *"the moment a reveal requires the member to BE somewhere at a time
-- — 'drops at 8pm' — it stops being a surprise and becomes a retention
-- mechanic."*
--
-- Tonight's 10pm is Ryan choosing when to watch his own test pool. It is a
-- review appointment for the author, not an appointment sold to a member, and
-- it lasts one evening. **The thing that WOULD trip the gate is generalising it
-- — pinning reveals to an hour of the day so members learn to show up at 10.**
-- 129 must stay an interval measured from settlement, exactly as 123 is.
--
-- Disclosure sentence is unchanged and still true:
--   "Your next opponent is revealed after your last duel is decided."

-- -------------------------------------------------------------
-- One line differs from 123: the hold. Everything else is byte-identical,
-- deliberately — a REPLACE that also "tidies" the body is how comment lines
-- get silently eaten (055).
-- -------------------------------------------------------------
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
      -- ⏳ 128: 48h -> 28h01m for one evening's review. NOT the chosen hold.
      (SELECT prev.ranks_snapshot_at + interval '28 hours 1 minute'
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
  '⏳ TEMPORARY (128) — the hold is 28h01m, a number chosen ONLY to land the '
  'seeded Showdown pools'' matchweek-3 reveal at 10pm Bermuda on 2026-09-01 so '
  'the walk-out could be reviewed live. It is NOT a considered hold; migration '
  '129 replaces it with the real one. Otherwise identical to 123: the instant '
  'this pool''s duel opens is the hold after the PREVIOUS matchweek settled, or '
  '24 hours before this one''s own lock (120''s floor, covering a postponement '
  'stalling settlement, 094) — whichever is first. Returns -infinity for the '
  'season''s first playable matchweek. NULL if the matchweek has no fixtures. '
  'Ordered by LOCK TIME, never matchweek number (101). Derived, never stored '
  '(110). Migrations 116 -> 119 -> 120 -> 123 -> 128.';

-- =============================================================
-- VERIFY
-- =============================================================
--   SELECT * FROM league_first_sealed_matchweek('5eed0003-0000-4000-8000-000000000003');
--   -- expect: 3 | 2026-09-02 01:00:00.888+00 | 2
--   -- i.e. 2026-09-01 22:00:00.9 Bermuda
