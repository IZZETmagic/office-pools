-- =============================================================
-- 111 — A POOL NAMES ONE COMPETITION, AND BOTH IDS MUST AGREE
-- =============================================================
-- The prerequisite for a SECOND league. Plan:
-- drafts/2026-08-28_la_liga_plan.md §P1.
--
-- ## What is wrong today
--
-- A league pool carries BOTH `pools.tournament_id` and `pools.league_season_id`
-- (migration 054b, the vertical slice), so that the ~50 World Cup sites reading
-- `tournament_id` keep working unchanged. Nothing enforces that the two agree.
-- 054b's own column comment says so, and ends:
--
--   > Do not add a second league competition before the XOR ships.
--
-- With one league that is true but cheap: every `league_seasons` row and every
-- league `tournaments` row is the Premier League, so a disagreement is not
-- expressible. With two, a pool can name La Liga's season and the Premier
-- League's tournament, and NOTHING would say so — the league arm would score it
-- against Spain while every `tournament_id` path scoped it to England. Silently,
-- because `.eq('tournament_id', <wrong id>)` returns zero rows at HTTP 200.
--
-- ## Why this is not the XOR
--
-- The XOR (`pools_exactly_one_competition` + both `DROP NOT NULL`s) fixes this
-- by making `tournament_id` NULL for a league pool. That is the right end state
-- and it costs a 50-site `CompetitionRef` sweep, because 34 of those sites would
-- become `.eq('tournament_id', null)` -> zero rows at HTTP 200, which is the
-- same silent-wrongness class in a new place.
--
-- **The hazard is the two columns DISAGREEING, not their both being populated.**
-- So this asserts agreement instead, and the XOR becomes cleanup rather than a
-- blocker. SPORTPOOL_PROGRAMME.md already records this as the cheaper remedy.
--
-- ## The identity is the TRIPLE, not the name
--
-- `(external_provider, external_league_id, external_season)` — the same triple
-- `loadSyncTargets` dedupes on, and the same one the pool-create route already
-- resolves the placeholder by. Matching on anything else (name, slug, year)
-- would be a second definition of what a competition-instance is.
--
-- ## Three deliberate choices
--
--   1. **RAISE, never silent-skip.** Every other guard on this table refuses in
--      silence, because they guard a member's PICK against a deadline and a
--      thrown error at a locked deadline is just noise. This one guards against
--      corruption that nobody would ever notice — silence is the failure mode,
--      not the courtesy.
--   2. **A NULL `tournament_id` PASSES.** It cannot happen today (the column is
--      NOT NULL), but a league pool with no tournament id is exactly where the
--      XOR is heading. Refusing it here would make this migration the thing
--      blocking its own cleanup.
--   3. **`UPDATE OF tournament_id, league_season_id`**, not a bare `UPDATE`.
--      Migration 088's lesson: a BEFORE trigger scoped to all columns fires on
--      writes that have nothing to do with it. Scoped, an ordinary pool rename
--      does not pay for this at all.
--
-- SECURITY DEFINER because it must resolve two config rows regardless of the
-- caller's RLS; it returns nothing and reads no member data.
--
-- ============================================================
-- PREFLIGHT — run this FIRST. It must return zero rows.
-- ============================================================
--   SELECT p.pool_id, p.pool_code, t.external_league_id AS t_league,
--          s.external_league_id AS s_league, t.external_season AS t_season,
--          s.external_season AS s_season
--     FROM pools p
--     JOIN league_seasons s ON s.season_id     = p.league_season_id
--     LEFT JOIN tournaments t ON t.tournament_id = p.tournament_id
--    WHERE p.league_season_id IS NOT NULL
--      AND p.tournament_id IS NOT NULL
--      AND (COALESCE(t.external_provider,'api_football')
--             IS DISTINCT FROM COALESCE(s.external_provider,'api_football')
--        OR t.external_league_id IS DISTINCT FROM s.external_league_id
--        OR t.external_season     IS DISTINCT FROM s.external_season);
--
-- Checked from the application side on 2026-08-28, before writing this:
--   12 pools carry league_season_id; 12 carry prediction_mode='league_pickem';
--   0 have a NULL tournament_id; all 12 resolve to the SAME
--   (tournament b1299174-…, season 8cbb871e-…) pair. Zero violations.
--
-- Fully reversible: DROP TRIGGER, DROP FUNCTION. It writes nothing.
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_pool_competition_consistent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  s RECORD;
  t RECORD;
BEGIN
  -- A bracket pool names no league season. Nothing to reconcile, and this is
  -- the branch 623 of the 635 live pools take — it must be the first thing here.
  IF NEW.league_season_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- See choice 2 in the header. Not reachable while tournament_id is NOT NULL.
  IF NEW.tournament_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Both reads are FK-guaranteed to find a row (`pools_tournament_id_fkey` and
  -- 054b's `league_season_id` FK), so there is no NOT FOUND branch below. If
  -- either FK is ever dropped, add one — a missing row would otherwise read as
  -- NULL and compare EQUAL under IS DISTINCT FROM against another NULL.
  SELECT external_provider, external_league_id, external_season,
         competition_name, season_label
    INTO s
    FROM league_seasons
   WHERE season_id = NEW.league_season_id;

  SELECT external_provider, external_league_id, external_season, name, format
    INTO t
    FROM tournaments
   WHERE tournament_id = NEW.tournament_id;

  IF COALESCE(t.external_provider, 'api_football')
       IS DISTINCT FROM COALESCE(s.external_provider, 'api_football')
     OR t.external_league_id IS DISTINCT FROM s.external_league_id
     OR t.external_season    IS DISTINCT FROM s.external_season
  THEN
    RAISE EXCEPTION
      'this pool names two different competitions: league season "% %" is (%, %, %) but tournament "%" is (%, %, %). A pool scored against one and scoped against the other reports a leaderboard for a competition nobody in it is playing.',
      s.competition_name, s.season_label,
      COALESCE(s.external_provider, 'api_football'), s.external_league_id, s.external_season,
      t.name,
      COALESCE(t.external_provider, 'api_football'), t.external_league_id, t.external_season;
  END IF;

  -- Same triple, wrong shape. `loadSyncTargets` already treats this collision as
  -- a CONFLICT and refuses to sync EITHER side, so a pool created on it would
  -- have no fixture updates at all — better to refuse the pool than to ship a
  -- frozen one.
  IF t.format IS DISTINCT FROM 'league' THEN
    RAISE EXCEPTION
      'tournament "%" carries the same competition triple as league season "% %" but its format is "%", not "league". Neither side will sync while that is true.',
      t.name, s.competition_name, s.season_label, COALESCE(t.format, 'null');
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_pool_competition_consistent() IS
  'Migration 111. A pool carrying both tournament_id and league_season_id must have them resolve to the same (external_provider, external_league_id, external_season) triple, and the tournament must have format=''league''. RAISES rather than silent-skipping: this guards corruption nobody would otherwise see. A NULL tournament_id passes on purpose — that is where the XOR is heading. This is the cheap remedy that unblocks a second league; the full XOR is now cleanup, not a blocker.';

DROP TRIGGER IF EXISTS trg_pools_competition_consistent ON public.pools;

CREATE TRIGGER trg_pools_competition_consistent
  BEFORE INSERT OR UPDATE OF tournament_id, league_season_id ON public.pools
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pool_competition_consistent();

-- The 054b comment ended "Do not add a second league competition before the XOR
-- ships." That is no longer the rule, and leaving it would send the next reader
-- to build the wrong thing.
COMMENT ON COLUMN public.pools.league_season_id IS
  'The league season this pool plays, for prediction_mode = league_pickem. NULLABLE and, in the vertical slice, carried ALONGSIDE a populated tournament_id rather than instead of it — see drafts/2026-08-22_league_vertical_slice.md §1. Migration 111 now enforces that the two agree on the competition triple, which is what made a SECOND league safe; the exactly-one XOR, the mode CHECK and the deadline CHECK remain deferred as cleanup.';

COMMIT;

-- ============================================================
-- APPLIED 2026-08-28 to production (ujthamlehjyubbzxbnes)
-- ============================================================
-- Preflight returned zero rows, including the format check. After applying:
--
--   trigger  BEFORE INSERT OR UPDATE OF tournament_id, league_season_id
--   function owned by postgres, SECURITY DEFINER, search_path=public
--   branch census over all 635 live pools:
--       623  branch 1 (bracket, exits immediately)
--        12  branch 3 (checked and consistent)
--         0  would raise
--   scripts/verify-competition-consistency.ts  ALL 7 CHECKS PASSED
--
-- Rollback, if ever needed — it writes no data, so this is complete:
--   DROP TRIGGER IF EXISTS trg_pools_competition_consistent ON public.pools;
--   DROP FUNCTION IF EXISTS public.enforce_pool_competition_consistent();
--
-- ============================================================
-- VERIFY AFTER APPLYING
-- ============================================================
--   -- 1. the trigger exists, and is scoped to the two columns
--   SELECT tgname, pg_get_triggerdef(oid)
--     FROM pg_trigger WHERE tgname = 'trg_pools_competition_consistent';
--
--   -- 2. every existing pool still updates (this must succeed, 623 rows)
--   BEGIN;
--     UPDATE pools SET tournament_id = tournament_id, league_season_id = league_season_id;
--   ROLLBACK;
--
--   -- 3. a deliberate mismatch is REFUSED
--   BEGIN;
--     UPDATE pools SET tournament_id = '00000000-0000-0000-0000-000000000001'
--      WHERE league_season_id IS NOT NULL;   -- expect: 'names two different competitions'
--   ROLLBACK;
--
-- Or, all three plus the scratch cases:
--   npx tsx scripts/verify-competition-consistency.ts
-- ============================================================
