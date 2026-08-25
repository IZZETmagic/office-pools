-- Migration 064: Results depth — the schema half.
--
-- Plan: drafts/2026-08-24_league_pools_full_plan.md §4 L-C, decision 6.
-- Product intent, *A Season in a League Pool* §2: "Tap home, draw or away. 380
-- taps a season." versus "Type the exact goals. 760 numbers a season."
--
-- ⚠ SCHEMA FIRST, and nothing in `app/` or `lib/` names these columns until this
-- is applied. That ordering is the entry_xp_state lesson: seven hours of silent
-- 400s came from code shipping ahead of its column.
--
-- ============================================================
-- WHY THIS IS THE HIGHEST-VALUE ITEM IN THE PLAN
-- ============================================================
-- Decision 9's own warning: Scores is the WRONG DEFAULT for a 38-matchweek
-- season. Results was meant to be the pre-selected recommendation and was never
-- built, so every league pool that exists is implicitly Scores — 760 numeric
-- decisions between August and May. Results is 380 taps. That is the difference
-- between a pool people are still playing in March and one that quietly dies in
-- October, which is the whole purpose clause.
--
-- ============================================================
-- 1. A PREDICTION IS NOW ONE SHAPE OR THE OTHER
-- ============================================================
-- `predicted_outcome` holds 'home' | 'draw' | 'away'.
--
-- ⚠⚠ DO NOT ENCODE H/D/A AS 1-0 / 0-0 / 0-1. Decision 9 names this trap
-- explicitly and it is worth restating where somebody would be tempted: a
-- sentinel scoreline scores as a genuine `exact` when the match happens to
-- finish 1-0, paying 100 points for a prediction the member never made, and the
-- Results member would then see "you predicted 1-0" on a screen where they only
-- ever tapped a badge. Two different things must be stored as two different
-- things.
--
-- The XOR is a CHECK rather than a convention because both shapes reach this
-- table from more than one client — web today, mobile later — and a convention
-- that only the web enforces is not a rule.
--
-- ⚠ `predicted_home_score` / `predicted_away_score` are NOT NULL today
-- (migration 050), so the XOR is UNSATISFIABLE until both drop it. They are
-- dropped in this same migration; splitting them would leave the table in a
-- state where no Results row can be written and no error explains why.
--
-- The existing `>= 0 AND <= 20` range checks need no change: a CHECK fails only
-- on FALSE, and `NULL >= 0` is NULL, so they already tolerate an absent score.
--
-- ============================================================
-- 2. DEPTH IS A PROPERTY OF THE POOL, LOCKED AT CREATION
-- ============================================================
-- `pools.league_depth` is NULL for the 623 World Cup pools and must stay that
-- way, so there is deliberately NO column default — a default of 'results'
-- would stamp every new bracket pool with a league concept.
--
-- Decision 6: `'results'` is the default FOR NEW LEAGUE POOLS, set by the
-- creation path, not by the column. The two existing league pools are
-- backfilled to `'scores'` in this migration so nothing they have already done
-- changes behaviour.
--
-- **Locked at creation** by trigger, because mixed depths inside one pool make
-- weekly scores incomparable and break Showdown's whole premise — you cannot
-- duel someone whose week was scored on a different ladder. Setting it for the
-- first time is allowed; changing it afterwards is refused.
--
-- ⚠ This trigger RAISES rather than silently skipping, which is the OPPOSITE of
-- `enforce_league_prediction_before_lock`. Deliberate: that one guards a
-- high-volume member action where a hard error would break clients mid-season.
-- This guards a rare admin config change, and silently ignoring one is how you
-- get "I changed it and it didn't stick".

-- ------------------------------------------------------- 1. the outcome pick
ALTER TABLE league_predictions
  ADD COLUMN IF NOT EXISTS predicted_outcome text;

ALTER TABLE league_predictions DROP CONSTRAINT IF EXISTS league_predictions_outcome_ck;
ALTER TABLE league_predictions ADD CONSTRAINT league_predictions_outcome_ck
  CHECK (predicted_outcome IS NULL OR predicted_outcome IN ('home', 'draw', 'away'));

-- Must come BEFORE the XOR, or the XOR can never be satisfied by a Results row.
ALTER TABLE league_predictions ALTER COLUMN predicted_home_score DROP NOT NULL;
ALTER TABLE league_predictions ALTER COLUMN predicted_away_score DROP NOT NULL;

ALTER TABLE league_predictions DROP CONSTRAINT IF EXISTS league_predictions_shape_ck;
ALTER TABLE league_predictions ADD CONSTRAINT league_predictions_shape_ck
  CHECK (
    (predicted_home_score IS NOT NULL AND predicted_away_score IS NOT NULL AND predicted_outcome IS NULL)
    OR
    (predicted_home_score IS NULL AND predicted_away_score IS NULL AND predicted_outcome IS NOT NULL)
  );

COMMENT ON COLUMN league_predictions.predicted_outcome IS
  'Results depth: home | draw | away. MUTUALLY EXCLUSIVE with the scoreline pair — see league_predictions_shape_ck. Never encode an outcome as a sentinel scoreline: 1-0 would score as a genuine exact.';

-- ------------------------------------------------------------- 2. pool depth
ALTER TABLE pools ADD COLUMN IF NOT EXISTS league_depth text;

ALTER TABLE pools DROP CONSTRAINT IF EXISTS pools_league_depth_ck;
ALTER TABLE pools ADD CONSTRAINT pools_league_depth_ck
  CHECK (league_depth IS NULL OR league_depth IN ('results', 'scores'));

COMMENT ON COLUMN pools.league_depth IS
  'results | scores, for league pools only; NULL for the World Cup. Set at creation and immutable thereafter (trg_league_depth_immutable) — mixed depths make weekly scores incomparable and break Showdown. No column default ON PURPOSE: a default would stamp every new bracket pool.';

-- Existing league pools keep exactly what they have been doing.
UPDATE pools
   SET league_depth = 'scores'
 WHERE league_season_id IS NOT NULL
   AND league_depth IS NULL;

-- ---------------------------------------------------------- 3. lock it there
CREATE OR REPLACE FUNCTION public.enforce_league_depth_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  -- Setting it for the first time is fine; changing it is not. Every other
  -- column on `pools` updates freely — this fires only when league_depth itself
  -- moves, so archiving, renaming and settings changes are untouched.
  IF OLD.league_depth IS NOT NULL
     AND NEW.league_depth IS DISTINCT FROM OLD.league_depth THEN
    RAISE EXCEPTION
      'league_depth is fixed at pool creation (% -> %). Changing depth mid-season makes weekly scores incomparable and breaks Showdown pairings.',
      OLD.league_depth, NEW.league_depth
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_league_depth_immutable ON pools;
CREATE TRIGGER trg_league_depth_immutable
  BEFORE UPDATE ON pools
  FOR EACH ROW EXECUTE FUNCTION enforce_league_depth_immutable();

-- ============================================================
-- VERIFY
-- ============================================================
--   npx tsx scripts/verify-results-depth.ts
--
-- Expect: a scoreline row and an outcome row both store; a row with BOTH is
-- refused; a row with NEITHER is refused; the two existing pools read 'scores';
-- all 623 World Cup pools read NULL; and changing a set depth raises.
