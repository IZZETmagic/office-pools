-- =============================================================
-- 116 — THE DRAW OPENS ONE WEEK AT A TIME
-- =============================================================
-- Ryan, 2026-08-30: *"we are going to hide the draw from all users and reveal
-- them week by week so it is a surprise."*
--
-- This reverses the PUBLISHING half of the 24 Aug call. The round-robin itself
-- stands, and that distinction is the whole of the ethics here:
--
--   · Gate 5 (variance provenance) was satisfied by choosing a round-robin over
--     a weekly random draw — nobody faces the strong pickers more often than
--     anybody else. Hiding WHEN you learn the pairing changes no outcome, so
--     gate 5 is untouched.
--   · Gate 1 (disclosure) is satisfied by saying plainly what we did: the draw
--     was made at pool creation and opens one matchweek at a time. That
--     sentence survives being said out loud. "You have been randomly paired
--     this Monday" would not, because it is not true — see `leagueModeInfo.ts`.
--
-- ⚠ 083's header and `DuelsTab.tsx`'s header both argue at length that the
-- fixture list is published ON PURPOSE. Both are rewritten in this change. Left
-- alone they read as a specification, and the next person removes the hiding as
-- a bug.
--
-- =============================================================
-- ## Why this is a POLICY and not a front-end change
-- =============================================================
--
-- 083's policy is a plain SELECT over the whole fixture list for every member:
--
--     CREATE POLICY "Members can view their pool's duels"
--       ON league_duels FOR SELECT USING (EXISTS (... pool_members ...));
--
-- Removing the fixture list from the screen hides nothing — the entire season
-- is one request away, and the pool page already ships duel rows to the client.
-- A blindfold is not a lock.
--
-- ⚠ AND THE POLICY IS NOT ENOUGH EITHER. `lib/league/poolCards.ts` reads
-- `league_duels` with the SERVICE-ROLE client, which carries `bypassrls`, to
-- build the Showdown tile on the pools list and the dashboard. RLS cannot see
-- that path. It is filtered in TypeScript, in the same change.
--
--   authenticated client -> this policy
--   service-role client  -> an explicit filter, every time, forever
--
-- =============================================================
-- ## When a duel opens — R1, Ryan 2026-08-30
-- =============================================================
--
-- A duel opens when its matchweek OPENS FOR PICKS. Not Monday 09:00, and not
-- when the previous matchweek finishes, because both of those open a gap: under
-- the existing rhythm MW5's picks open the moment MW4 locks, so a member could
-- pick their whole sheet before ever meeting their opponent — which removes the
-- only thing the mode is for. R1 has no gap by construction.
--
-- It is DERIVED, never stored. Migration 110 deleted a stored `revealed_at` on
-- exactly this argument: it *"was never a fact about the pool. It was a record
-- of when we got round to writing it down."* There is no column here, no cron,
-- and no admin lever.
--
-- ⚠ MEASURED IN LOCK TIME, NEVER IN MATCHWEEK NUMBER. Migration 101: across
-- three real seasons the minimum gap between consecutive rounds' first kickoffs
-- is −121 days, because a whole round can be moved. `matchweek_number <= open`
-- would seal a matchweek that is being played and reveal one weeks away.
--
-- =============================================================
-- ## Why a SECURITY DEFINER helper rather than the function inline
-- =============================================================
--
-- The predicate needs `league_open_matchweek`, which migration 102 REVOKEd from
-- PUBLIC and anon. A policy that calls it directly would raise *permission
-- denied* for an anon reader rather than returning zero rows — and Postgres
-- does not promise to evaluate the membership EXISTS first, so the short-
-- circuit cannot be relied on. An error where empty rows belong is the
-- discarded-PostgREST-error trap pointing the other way.
--
-- So the reveal rule gets one name, `league_duel_is_revealed`, SECURITY DEFINER
-- and safe to expose. It CALLS `league_open_matchweek` rather than restating it
-- — migration 103's lesson, where the same rule existed four times and the
-- copies drifted the moment 101 changed one of them.

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
  -- A matchweek is open once its lock is no later than the lock of the
  -- matchweek currently taking picks. Everything at or before that line is
  -- open, being played, or finished; everything after it is still sealed.
  --
  -- COALESCE(..., now()) is load-bearing: when the season is over
  -- `league_open_matchweek` returns NULL, and `lock_at <= NULL` is NULL, which
  -- would hide EVERY duel of a finished season — settled results included.
  --
  -- `m.lock_at IS NOT NULL` seals a matchweek that has no fixtures yet. It also
  -- seals one the floor-of-5 has emptied (106); those duels can never settle
  -- either, so the two agree.
  SELECT EXISTS (
    SELECT 1
      FROM pools p
      JOIN league_matchweeks m
        ON m.season_id = p.league_season_id
       AND m.matchweek_number = p_matchweek_number
     WHERE p.pool_id = p_pool_id
       AND m.lock_at IS NOT NULL
       AND m.lock_at <= COALESCE(
             (SELECT o.lock_at
                FROM league_matchweeks o
               WHERE o.matchweek_id = league_open_matchweek(p.league_season_id)),
             now())
  );
$fn$;

COMMENT ON FUNCTION public.league_duel_is_revealed(uuid, integer) IS
  'Has this pool''s duel for this matchweek opened yet? True once the matchweek '
  'locks no later than the one currently taking picks — so open, in play and '
  'finished matchweeks are visible and future ones are not. Compared in LOCK '
  'TIME, never matchweek number: three real seasons contain rounds played out of '
  'numerical order (migration 101, minimum gap -121 days). Derived, never stored '
  '(migration 110). SECURITY DEFINER because league_open_matchweek is revoked '
  'from anon and a policy cannot rely on AND short-circuiting. Migration 116.';

-- Safe to expose: it answers one boolean about a schedule the pool will see
-- anyway, and it leaks nothing about WHO is drawn against whom.
REVOKE EXECUTE ON FUNCTION public.league_duel_is_revealed(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.league_duel_is_revealed(uuid, integer)
  TO anon, authenticated, service_role;


-- ------------------------------------------------- the policy itself
--
-- Membership is unchanged from 083, including the `(SELECT auth.uid())` wrap
-- that keeps it an InitPlan rather than a per-row call.

DROP POLICY IF EXISTS "Members can view their pool's duels" ON league_duels;
DROP POLICY IF EXISTS "Members see duels up to the open matchweek" ON league_duels;

CREATE POLICY "Members see duels up to the open matchweek"
  ON league_duels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pool_members pm JOIN users u ON pm.user_id = u.user_id
       WHERE pm.pool_id = league_duels.pool_id
         AND u.auth_user_id = (SELECT auth.uid())
    )
    AND league_duel_is_revealed(league_duels.pool_id, league_duels.matchweek_number)
  );


-- ------------------------------------------------- the comment 083 left behind
--
-- 083 said: "Also the FIXTURE LIST — rows exist unsettled from pool creation,
-- so the schedule can be published in advance." The first half is still true
-- and the second is now false.

COMMENT ON TABLE league_duels IS
  'One head-to-head duel: two entries, one matchweek. Rows exist unsettled from '
  'pool creation because the draw is made once, up front — but they are SEALED '
  'until their matchweek opens for picks, and only the RLS policy plus the '
  'service-role filters in lib/league/poolCards.ts enforce that. entry_b NULL is '
  'a bye. Migration 116.';

COMMENT ON COLUMN league_duels.matchweek_number IS
  'Which matchweek this duel is played in. Also what gates its visibility: a row '
  'is readable once league_duel_is_revealed() says its matchweek has opened. '
  'Migration 116.';
