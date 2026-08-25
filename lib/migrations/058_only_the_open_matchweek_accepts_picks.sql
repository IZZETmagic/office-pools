-- Migration 058: only the OPEN matchweek accepts picks.
--
-- ⚠⚠ NOT APPLIED. Written, reviewed-ready, deliberately left for Ryan to call.
-- See "WHY THIS IS NOT APPLIED" at the bottom.
--
-- Plan: drafts/2026-08-24_league_pools_full_plan.md §0.6. Product intent, the
-- artifact *A Season in a League Pool* §5: "It locks at the first kickoff,
-- automatically — enforced deep in the database, not in the screen, so it holds
-- no matter what someone is using."
--
-- ============================================================
-- THE HALF THAT IS MISSING
-- ============================================================
-- The matchweek rhythm now derives correctly on the read side: exactly one
-- matchweek is open, and it moves on its own the instant the previous one locks
-- (lib/league/read.ts -> openMatchweekId). Verified live: PTQPZ797 went from
-- "1 completed · 0 locked · 37 open" to "1 completed · 36 locked · 1 open".
--
-- But that is the SCREEN. The database still accepts a pick for any matchweek
-- that has not locked yet. `enforce_league_prediction_before_lock` checks two
-- things — is the fixture finished, and has its matchweek locked — and neither
-- of them knows anything about a matchweek being open. So today:
--
--   the UI will not OFFER matchweek 30 in August  ✅
--   the API will happily STORE a pick for it      ❌
--
-- Decision 16 is "a member cannot work ahead". A rule that only the screen
-- enforces is not that rule, and this is exactly the split the artifact called
-- out: it has to hold "no matter what someone is using".
--
-- ============================================================
-- THE RULE, AND WHY IT IS DUPLICATED RATHER THAN SHARED
-- ============================================================
-- The predicate below is a deliberate mirror of `openMatchweekId` in
-- lib/league/read.ts: the earliest matchweek in the season that is neither
-- finished (no fixtures, or all fixtures completed) nor locked.
--
-- Duplicating a rule is a cost. The alternative — the API asking the database
-- which matchweek is open, then trusting itself — is worse, because it is the
-- screen enforcing it again with extra steps. The two copies MUST agree; if you
-- change one, change the other, and `scripts/verify-league-pool-member-view.ts`
-- compares the derived state against the live rows on every run.
--
-- ============================================================
-- SILENT SKIP — INHERITED, AND WORTH A SECOND OPINION
-- ============================================================
-- The existing trigger answers a too-late pick with RETURN NULL: the row is
-- dropped, no error is raised, and the caller is told it succeeded. This
-- migration keeps that behaviour for the new rule so the two halves cannot
-- behave differently.
--
-- It is not obviously right. A member whose page was open before a lock passed
-- can press Save, see success, and have nothing stored. That harm exists today
-- for the lock rule; this widens it to the open rule. RAISE EXCEPTION would be
-- honest but breaks callers that do not expect a 400 — and the World Cup made
-- the same call (`trg_enforce_prediction_before_kickoff`).
-- Flagging it rather than quietly changing it.

CREATE OR REPLACE FUNCTION public.enforce_league_prediction_before_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_lock   timestamptz;
  v_done   boolean;
  v_season uuid;
  v_mw     uuid;
  v_open   uuid;
BEGIN
  SELECT mw.lock_at, f.is_completed, f.season_id, f.matchweek_id
    INTO v_lock, v_done, v_season, v_mw
    FROM league_fixtures f
    JOIN league_matchweeks mw ON mw.matchweek_id = f.matchweek_id
   WHERE f.fixture_id = NEW.fixture_id;

  -- Unchanged from the original: a finished fixture, or a locked matchweek,
  -- takes no more picks.
  IF v_done IS TRUE THEN RETURN NULL; END IF;
  IF v_lock IS NOT NULL AND v_lock <= now() THEN RETURN NULL; END IF;

  -- NEW — decision 16. Mirrors openMatchweekId() in lib/league/read.ts.
  --
  -- A locked-but-unfinished matchweek is SKIPPED rather than being treated as
  -- the open one: postponements mean a matchweek can sit locked with fixtures
  -- still to play for weeks, and that must not hold the season shut.
  SELECT m.matchweek_id
    INTO v_open
    FROM league_matchweeks m
   WHERE m.season_id = v_season
     AND NOT (m.fixture_count = 0 OR m.completed_fixture_count >= m.fixture_count)
     AND (m.lock_at IS NULL OR m.lock_at > now())
   ORDER BY m.matchweek_number
   LIMIT 1;

  IF v_open IS NULL OR v_mw <> v_open THEN RETURN NULL; END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_league_prediction_before_lock() IS
  'Decision 16. A league prediction is accepted only for the OPEN matchweek — '
  'the earliest one neither finished nor locked. Mirrors openMatchweekId() in '
  'lib/league/read.ts; the two must agree. Silently skips (RETURN NULL) rather '
  'than raising, matching the pre-existing lock behaviour.';

-- ============================================================
-- WHY THIS IS NOT APPLIED
-- ============================================================
-- It changes what the database will WRITE for a live pool, and that was not in
-- the agreed scope of the matchweek-rhythm phase — that phase was the read-side
-- derivation, which is done and verified. "Plan before executing" applies most
-- to exactly this kind of change, so the decision is Ryan's.
--
-- The risk of applying it is genuinely low right now: `league_predictions` holds
-- ZERO rows database-wide, so there is nobody mid-season to disrupt, and this is
-- the cheapest moment it will ever be. The risk of NOT applying it is that the
-- rule is cosmetic until somebody picks through a stale page or hits the API.
--
-- ============================================================
-- BEFORE APPLYING
-- ============================================================
--   1. Apply via the Supabase MCP.
--   2. npx tsx scripts/verify-league-pool-member-view.ts   (still 1 open)
--   3. Prove BOTH directions on scratch data — a pick for the open matchweek is
--      stored, a pick for a later one is not. A test that only proves the
--      rejection would also pass if the trigger rejected everything, which is
--      the failure mode that matters: it would silently stop all picking on the
--      one live pool.
