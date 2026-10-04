-- =============================================================
-- 165 — A POOL KEEPS THE START IT WAS GIVEN
-- =============================================================
-- Follow-up to 164, found the same day while writing its scratch tests.
--
-- 164 decided which matchweeks a Showdown pool duels in by comparing the
-- pool's `created_at` with each week's CURRENT `first_kickoff_at`:
--
--     plays = number >= start AND first_kickoff_at - 24h > created_at
--
-- That is a property of the pool computed from a property of the FIXTURE LIST,
-- and the fixture list moves. Move the first fixture of a pool's start week
-- earlier — a TV pick, a postponement re-homed (106), or the placeholder dates
-- that have bitten this codebase twice (`verify-league-stranded-fixtures`) —
-- far enough that its draw now falls before the pool was created, and:
--
--   · the week silently stops being one of the pool's duel weeks
--   · `league_duel_reveals_at` answers NULL, so it never opens and is never
--     stamped
--   · BUT ITS PROVISIONAL ROWS ARE STILL THERE — nothing regenerates on a
--     kickoff change — and `league_score_duels` settles every row in a
--     matchweek regardless of whether anybody could see it. Duel points from a
--     duel no member was ever shown.
--
-- ## The fix: the stored start is the answer, not an input to a derivation
--
-- The create route (164) already stores, for every new Showdown pool, the first
-- matchweek whose draw was still ahead at creation — resolved by
-- `league_showdown_first_matchweek_for` with now(). That is the moment the
-- question has an answer. After it, the pool's start is a FACT (143 makes it
-- immutable for exactly this reason: "it is the matchweek members were told the
-- pool begins") and nothing about the fixture list should re-litigate it.
--
--   plays          = number >= the pool's start
--   first duel week = the first week, in lock order, at or past the start that
--                     has fixtures
--
-- If the start week's kickoff later moves earlier, the week stays a duel week
-- and simply opens earlier — milder by far than vanishing with its rows still
-- scoreable.
--
-- `created_at` survives ONLY as the fallback for a Showdown pool with no
-- stored start, which after the backfill below means a pool created by some
-- path other than the create route.
--
-- ## Backfill
--
-- The two Showdown pools created before 143 (`Showdown Duels`,
-- `Showdown: Exact Scores`, both 2026-08-25) carry NULL. They get the week
-- 164's rule already computes for them (matchweek 2, verified 2026-10-04), so
-- nothing about either changes — it is written down instead of re-derived.
-- 143's trigger only guards a non-NULL OLD value, so stamping a NULL is allowed,
-- and that is the case its own header says it was built to permit.
--
-- ⚠ BEFORE YOU RUN THIS — two live functions are REPLACED (164's bodies):
--   SELECT proname, md5(prosrc) FROM pg_proc
--    WHERE proname IN ('league_showdown_plays_matchweek', 'league_showdown_first_matchweek');
--   --   league_showdown_plays_matchweek  5636e105f5d0edf7e0678d60dd3c263f
--   --   league_showdown_first_matchweek  fb5f96487c3f2ea700759e23f9f339b3
-- =============================================================

-- The backfill runs under 164's functions, so it writes exactly what they
-- currently answer.
UPDATE public.pools p
   SET league_start_matchweek = public.league_showdown_first_matchweek(p.pool_id)
 WHERE p.league_mode = 'showdown'
   AND p.league_start_matchweek IS NULL
   AND public.league_showdown_first_matchweek(p.pool_id) IS NOT NULL;

-- The floor this pool plays from: its stored start, or — for a pool that has
-- none — the first week whose draw was still ahead when it was created.
CREATE OR REPLACE FUNCTION public.league_showdown_plays_matchweek(
  p_pool_id          uuid,
  p_matchweek_number integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE((
    SELECT p_matchweek_number >= COALESCE(
             p.league_start_matchweek,
             public.league_showdown_first_matchweek_for(
               p.league_season_id, NULL, p.created_at))
      FROM pools p
     WHERE p.pool_id = p_pool_id
       AND p.league_mode = 'showdown'), false);
$fn$;

COMMENT ON FUNCTION public.league_showdown_plays_matchweek(uuid, integer) IS
  'Does this Showdown pool duel in this matchweek? At or past its stored start '
  '(pools.league_start_matchweek, resolved at creation and immutable — 143/164). '
  'Never re-derived from the fixture list, which moves. Only a pool with no '
  'stored start falls back to the first week whose draw was ahead of its '
  'created_at. False for every other mode. Migrations 164 → 165.';

CREATE OR REPLACE FUNCTION public.league_showdown_first_matchweek(p_pool_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    -- A stored start is a fact: the first week at or past it that has fixtures,
    -- whenever its draw now falls.
    WHEN p.league_start_matchweek IS NOT NULL THEN
      public.league_showdown_first_matchweek_for(
        p.league_season_id, p.league_start_matchweek, '-infinity'::timestamptz)
    ELSE
      public.league_showdown_first_matchweek_for(
        p.league_season_id, NULL, p.created_at)
  END
    FROM pools p
   WHERE p.pool_id = p_pool_id
     AND p.league_mode = 'showdown';
$fn$;

COMMENT ON FUNCTION public.league_showdown_first_matchweek(uuid) IS
  'The matchweek this Showdown pool''s first duel is in: the first week, in lock '
  'order, at or past its stored start that has fixtures. Its draw is 24h before '
  'that week''s first kickoff (164). NULL for any other mode. Migrations 164 → 165.';

-- =============================================================
-- VERIFY
-- =============================================================
--   select pool_name, league_start_matchweek,
--          league_showdown_first_matchweek(pool_id) as first_duel
--     from pools where league_mode = 'showdown' order by created_at;
--   -- expect: Showdown Duels 2|2 · Showdown: Exact Scores 2|2 · Prem 2026/27 Showdown 6|6
--
--   -- and 164's visible set is untouched (45 rows on 2026-10-04):
--   select count(*) from league_duels d
--    where league_duel_is_revealed(d.pool_id, d.matchweek_number);
