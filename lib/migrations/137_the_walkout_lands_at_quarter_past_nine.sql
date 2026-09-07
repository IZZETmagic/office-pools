-- =============================================================
-- 137 — THE WALKOUT LANDS AT QUARTER PAST NINE  (⏳ TEMPORARY — REVERT ME)
-- =============================================================
-- ⚠ BEFORE YOU RUN THIS — one live function is REPLACED
-- =============================================================
--   SELECT md5(prosrc) FROM pg_proc
--    WHERE oid = 'public.league_duel_reveals_at(uuid,integer)'::regprocedure;
--   -- must be 00b594ad92f56a0c0986cfad71e42760 (1665 bytes) = migration 129
--   -- VERIFIED LIVE 2026-09-06 23:58 UTC before applying.
-- =============================================================
--
-- Ryan, 2026-09-06: *"shorten the hold so I can watch it tonight at 9 pm."*
--
-- ## ⚠⚠ THIS IS A REVIEW WINDOW, NOT A RULE — EXACTLY AS 128 WAS
--
-- 129 is the considered answer to "how long should the hold be": 24 hours after
-- the previous matchweek's last game, chosen by Ryan on 2026-09-01 after being
-- shown the distribution across all 37 real matchweek pairs. **Nothing here
-- reconsiders that.** This is one number picked to make one flip happen at one
-- moment so the React Native walkout — built today, never yet seen on a real
-- pool — can be watched live.
--
-- **Do not read 6h46m as a decision.** 138 restores 24h.
--
-- ## Why 6 hours 46 minutes 58.853394 seconds, which is obviously not a number
--
-- The reveal instant is DERIVED (110/123) — there is no stored switch to set,
-- and that is the right design, so this does not add one. The only lever is the
-- hold, and the arithmetic is fixed at both ends:
--
--   matchweek 3 settled   2026-09-06 17:28:01.146606 UTC  (ranks_snapshot_at)
--   target                2026-09-06 21:15      Bermuda   (ADT, UTC−3)
--                       = 2026-09-07 00:15      UTC
--   difference            6h 46m 58.853394s
--
-- ⚠ 9:00pm WAS ASKED FOR AND 9:15pm IS WHAT THIS SETS. At the moment of
-- writing it was 20:58 Bermuda — two minutes to nine. 128's header records the
-- failure that would have caused: *"27h or less had already elapsed by the time
-- this was written (the flip would fire on apply, with nothing to watch)."* A
-- reveal that has already happened by the time the migration lands is not a
-- reveal anybody can watch.
--
-- ## ⚠ THE HOLD ARM ONLY. THE FLOOR KEEPS ITS 24 HOURS.
--
-- There are TWO `interval '24 hours'` in 129 and they are unrelated. The first
-- is the hold (123→128→129); the second is migration **120's floor** — "never
-- later than 24h before you have to pick" — which protects the reveal from a
-- postponement stalling settlement (094). Changing the floor would be changing
-- a rule nobody asked about.
--
-- Checked live before applying: for matchweek 4 the HOLD is binding
-- (2026-09-07 17:28) and the floor is 2026-09-11 13:00, so moving the hold
-- moves the answer. Had the floor been binding, this migration would have done
-- nothing at all and looked like it worked.
--
-- ## ⚠⚠ WHY 138 CANNOT BE APPLIED IMMEDIATELY AFTERWARDS
--
-- Restoring 24h moves matchweek 4's reveal from 00:15 tonight BACK to
-- 2026-09-07 17:28 — which is in the future — so between those two instants a
-- restore would **re-seal a duel that has already been revealed**. RLS (116)
-- would withdraw the row, the opponent would vanish from the band, and the
-- walkout marker (136) would already be stamped, so it would not even fire
-- again when the week re-opened.
--
-- 128 → 129 did not hit this only by luck: 129's 24h happened to be EARLIER
-- than 128's 28h01m, so nothing was withdrawn.
--
--     ⏳ APPLY 138 ONLY AFTER 2026-09-07 17:28:01 UTC (2:28pm Bermuda).
--
-- After that instant both values agree matchweek 4 is revealed, and the swap is
-- invisible.
--
-- ## Blast radius — the two seeded pools, and nothing else
--
-- `league_duel_reveals_at` gates the Showdown draw only. Verified live
-- 2026-09-06: exactly two pools carry `league_mode = 'showdown'` —
--   5eed0003-…-000000000003  Showdown Duels          (10 entries)
--   5eed0004-…-000000000004  Showdown: Exact Scores  (7 entries)
-- both seeded UX pools. No member-facing pool is in Showdown mode, so no real
-- member's reveal moves. Re-run that check before assuming it still holds.
--
-- ## ⚠ THE GATE THIS MUST NOT WALK INTO
--
-- 123's header is explicit: the reveal opens on a CLOCK, never on a visit or a
-- tap — *"the moment a reveal requires the member to BE somewhere at a time —
-- 'drops at 8pm' — it stops being a surprise and becomes a retention
-- mechanic."* This moves one clock once, for one reviewer, on two seeded pools.
-- It does not make "be there at nine" a thing the product does, and 138 removes
-- the possibility of it becoming one.
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
      -- ⏳ 137: a THROWAWAY value so matchweek 4 opens at 21:15 Bermuda on
      -- 2026-09-06 and the walkout can be reviewed live. 129's considered
      -- answer is 24 hours; 138 puts it back.
      (SELECT prev.ranks_snapshot_at + interval '6 hours 46 minutes 58.853394 seconds'
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
  '⏳ TEMPORARY (137, 2026-09-06): the hold is a THROWAWAY 6h46m58.853394s so '
  'matchweek 4 opens at 21:15 Bermuda tonight and the React Native walkout can '
  'be watched live. THE REAL RULE IS 24 HOURS (129) — apply 138 to restore it, '
  'and NOT before 2026-09-07 17:28:01 UTC or an already-revealed duel is '
  're-sealed. Everything else is 129: 24h before this matchweek''s own lock as '
  'the floor (120), anchored on ranks_snapshot_at not max(kickoff_at), ordered '
  'by LOCK TIME never matchweek number (101), -infinity for the season''s first '
  'playable matchweek, NULL if it has no fixtures. Derived, never stored (110). '
  'Migrations 116 -> 119 -> 120 -> 123 -> 128 -> 129 -> 137.';

-- =============================================================
-- VERIFY
-- =============================================================
--   SELECT league_duel_reveals_at('5eed0003-0000-4000-8000-000000000003', 4)
--            AS reveals_at,
--          league_duel_reveals_at('5eed0003-0000-4000-8000-000000000003', 4) > now()
--            AS still_to_come;
--   -- expect: 2026-09-07 00:15:00+00, and true if run before then.
--
--   -- Nothing already revealed was withdrawn:
--   SELECT matchweek_number,
--          league_duel_reveals_at('5eed0003-0000-4000-8000-000000000003', matchweek_number) <= now()
--            AS revealed
--     FROM league_matchweeks
--    WHERE season_id = (SELECT league_season_id FROM pools
--                        WHERE pool_id = '5eed0003-0000-4000-8000-000000000003')
--      AND matchweek_number <= 4
--    ORDER BY 1;
--   -- expect: 1,2,3 true (unchanged) and 4 false until 00:15.
