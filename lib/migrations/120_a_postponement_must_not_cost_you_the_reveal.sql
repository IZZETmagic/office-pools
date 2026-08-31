-- =============================================================
-- 120 — A POSTPONEMENT MUST NOT COST YOU THE REVEAL
-- =============================================================
-- ⚠ BEFORE YOU RUN THIS — one live function is REPLACED
-- =============================================================
--   SELECT md5(prosrc) FROM pg_proc
--    WHERE oid = 'public.league_duel_is_revealed'::regproc;
-- It should match migration 119's body, and nothing else.
-- =============================================================
--
-- 119 opens a duel when the matchweek before it has SETTLED. Found within the
-- hour, by Ryan asking whether international breaks had been accounted for —
-- they had, but the question surfaced the opposite failure.
--
-- ## The chain
--
-- Migration 094 settles a stalled matchweek when **the next matchweek locks**.
-- That is deliberate and correct: a postponed fixture sits in the denominator
-- forever, and without that arm one postponement freezes the season. But chain
-- it to 119 and:
--
--     MW2 has a postponed fixture
--       -> MW2 does not settle on completion
--       -> MW2 settles when MW3 LOCKS                      (094)
--       -> MW3's duel is revealed at that same instant     (119)
--       -> which is the moment MW3's picks CLOSE
--
-- The member picks the whole matchweek without knowing who they are playing,
-- and finds out once it is too late to matter. Nothing errors, the duel still
-- scores correctly against the played fixtures, and the only symptom is that
-- some weeks quietly feel different. It would fire a handful of times a season
-- — every postponement — and nobody would report it.
--
-- ## The floor
--
--     A duel opens when the previous matchweek settles,
--     OR 24 hours before you have to pick — whichever comes first.
--
-- ⚠ IN A NORMAL WEEK THE FLOOR NEVER FIRES, and that is the point: it must not
-- weaken "one duel at a time". Measured on the real Premier League 2026/27
-- fixture list, the gap from a matchweek's last kickoff to the next one's lock
-- is **66 hours at its tightest** (MW13→14 and MW18→19, the midweek rounds) and
-- 168 hours on average. Settlement lands within minutes of the last whistle, so
-- it beats a 24-hour floor by two days even in the worst week of the season.
--
-- The floor is reachable only when settlement is stalled — which is exactly the
-- postponement case, and exactly the hole. Ryan's call, 2026-08-30.
--
-- It also subsumes a case 119 left implicit: a matchweek that has already
-- locked satisfies `lock_at <= now() + 24h` unconditionally, so past matchweeks
-- stay readable no matter what happened to the chain behind them.
--
-- ## The disclosure sentence
--
--   "Your next opponent opens when the current duel is decided, or a day before
--    you pick — whichever comes first."
--
-- Both clauses true, and the second is the one a member would otherwise
-- discover as an inconsistency.

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
       AND (
         -- The rule: the matchweek before this one has settled.
         COALESCE(
           (SELECT prev.ranks_snapshot_at IS NOT NULL
              FROM league_matchweeks prev
             WHERE prev.season_id = m.season_id
               AND prev.lock_at IS NOT NULL
               AND (prev.lock_at, prev.matchweek_number)
                     < (m.lock_at, m.matchweek_number)
             ORDER BY prev.lock_at DESC, prev.matchweek_number DESC
             LIMIT 1),
           -- No predecessor: the season's first playable matchweek. Open it, or
           -- the pool has nothing to show and no way to ever show it.
           true)
         -- The floor. Unreachable in a normal week — settlement beats it by two
         -- days even in the tightest midweek round — and load-bearing when a
         -- postponement stalls settlement until this matchweek's own lock (094).
         OR m.lock_at <= now() + interval '24 hours'
       )
  );
$fn$;

COMMENT ON FUNCTION public.league_duel_is_revealed(uuid, integer) IS
  'Has this pool''s duel for this matchweek opened yet? True once the matchweek '
  'BEFORE it has settled (ranks_snapshot_at), OR within 24 hours of this '
  'matchweek''s own lock — whichever comes first. The settle arm gives one duel '
  'at a time; the 24-hour floor is unreachable in a normal week (settlement '
  'leads the next lock by 66h at the season''s tightest) and exists because '
  'migration 094 settles a POSTPONED matchweek only when the next one locks, '
  'which would otherwise reveal the opponent at the moment picks close. The '
  'season''s first playable matchweek has no predecessor and is open. Ordered by '
  'LOCK TIME, never matchweek number (101). Derived, never stored (110). '
  'Migrations 119 + 120.';
