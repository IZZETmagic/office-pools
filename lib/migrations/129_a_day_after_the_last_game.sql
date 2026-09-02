-- =============================================================
-- 129 — A DAY AFTER THE LAST GAME
-- =============================================================
-- ⚠ BEFORE YOU RUN THIS — one live function is REPLACED
-- =============================================================
--   SELECT md5(prosrc) FROM pg_proc
--    WHERE oid = 'public.league_duel_reveals_at'::regproc;
--   -- must be a6b3f0c3f0621e181706d4a9c73dafe8 (1670 bytes) = migration 128
-- =============================================================
--
-- Ryan, 2026-09-01, choosing the hold: *"24 hours after the last game from the
-- previous match week."*
--
-- This is the answer 128 was holding a place for, and it retires 128's throwaway
-- 28h01m. The hold was 48h (123) and is now 24h.
--
--     Your next opponent is revealed 24 hours after the last game of the
--     previous matchweek — or 24 hours before you have to pick, whichever
--     comes first.
--
-- ## Why the anchor stays `ranks_snapshot_at`
--
-- "The last game" and "settlement" are the same instant in practice, and
-- settlement is the safer of the two to measure from. Checked live on the
-- seeded season:
--
--     mw 2   last game ends 20:55   settles 20:59   lag 0.07h
--     mw 1   last game ends 20:55   settles 00:37   lag 3.71h  <- see below
--
-- Matchweek 1's lag is not the engine: it is the catch-up backfill from 096
-- scoring nine fixtures that never had a state witness. A live week settles
-- four minutes after the final whistle.
--
-- ⚠ AND `max(kickoff_at)` WOULD BE WRONG, which is the real reason. A postponed
-- fixture means the last game PLAYED is not the last game SCHEDULED, and 094
-- settles such a matchweek when its WINDOW CLOSES rather than at a kickoff that
-- never happened. Measuring from the fixture list would restart the clock on a
-- game nobody played; `ranks_snapshot_at` is the timestamp that already means
-- "everything that is going to be scored has been scored".
--
-- ## What this does to the season
--
-- Measured over all 37 real matchweek pairs (gap from settlement to next lock:
-- min 64h, avg 168h, max 500h):
--
--     the wait      always 1.0 day        (was 2.0)
--     the knowing   1.7 d -> 19.8 d       (was 0.7 -> 18.8), avg 5.9 d
--
-- ⚠ THE KNOWING WINDOW STILL SWINGS, and shortening the hold widens it slightly
-- rather than narrowing it. Three weeks a season sit behind an international
-- break — mw 6 (19.7 d), mw 11 (13.9 d), mw 31 (20.8 d) — and in those you will
-- know your opponent for the better part of three weeks. Ryan was shown this
-- distribution and chose the settlement anchor anyway, which is a coherent call:
-- the wait is what a member feels in 34 weeks out of 37, and pinning it at a day
-- is worth a long tail in the three weeks where there is no football on anyway.
--
-- ⚠ If that tail ever needs capping, the fix is a THIRD arm on the existing
-- GREATEST/LEAST — `GREATEST(m.lock_at - interval 'N days', ...)` — NOT a
-- special case for international breaks. There is no "international break" in
-- this schema and inventing one would be a calendar we maintain by hand.
--
-- ## The two tight weeks still work
--
-- mw 14 and mw 19 have a 64h gap (Boxing Day and the midweek round). The floor
-- from 120 is lock − 24h = settlement + 40h, so LEAST picks the 24h hold and
-- both reveal on time with 40h of picking left. No week in the season is tight
-- enough for the floor to beat the hold — that only happens under 48h of gap,
-- and the minimum is 64h.
--
-- ## The gate, unchanged from 123
--
-- The reveal still opens on a CLOCK measured from a football event, never on a
-- visit and never on a tap. Miss it by three days and you see it three days
-- later with nothing lost. What waits is who you play NEXT — information about
-- the future that changes no outcome. The RESULT is not held back at all: the
-- recap fires the moment the duel settles.
--
-- Disclosure sentence:
--   "Your next opponent is revealed a day after your last duel is decided."

-- -------------------------------------------------------------
-- One line differs from 128, which differed by one line from 123. Everything
-- else is byte-identical on purpose — a REPLACE that also tidies the body is
-- how live comment lines get silently eaten (055).
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
      -- 129: a day after the previous matchweek's last game (Ryan, 2026-09-01).
      (SELECT prev.ranks_snapshot_at + interval '24 hours'
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
  'The instant this pool''s duel for this matchweek opens: 24 HOURS after the '
  'previous matchweek''s last game (Ryan, 2026-09-01 — was 48h in 123, and '
  '128''s 28h01m was a throwaway to land one reveal at 10pm for review), or 24 '
  'hours before this one''s own lock — whichever is first. The second arm is '
  'migration 120''s floor, covering a postponement stalling settlement (094); '
  'it never beats the hold on the real calendar, whose tightest gap is 64h. '
  'Anchored on ranks_snapshot_at, NOT max(kickoff_at): a postponed fixture '
  'means the last game played is not the last game scheduled. Returns '
  '-infinity for the season''s first playable matchweek. NULL if the matchweek '
  'has no fixtures. Ordered by LOCK TIME, never matchweek number (101). '
  'Derived, never stored (110). Migrations 116 -> 119 -> 120 -> 123 -> 128 -> 129.';

-- =============================================================
-- VERIFY
-- =============================================================
--   SELECT * FROM league_first_sealed_matchweek('5eed0003-0000-4000-8000-000000000003');
--   -- mw 3 is already revealed, so expect mw 4. While mw 3 is unsettled the
--   -- hold is NULL and the floor answers: 2026-09-11 13:00 (= mw 4 lock − 24h).
--   -- Once mw 3 settles (~2026-09-07) it becomes settlement + 24h instead.
