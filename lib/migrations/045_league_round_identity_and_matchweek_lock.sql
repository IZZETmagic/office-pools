-- Migration 045: league round identity + matchweek-level prediction lock
--
-- Follows 024 (which adds `tournaments.format`, `matches.round_number` and the
-- `regular_season` stage). Apply 024 FIRST — every statement here depends on it.
--
-- Three things, all additive, none of which changes behaviour for the 623
-- existing World Cup pools:
--
--   1. `matches.round_label`   — the provider's raw round string.
--   2. An index on (tournament_id, round_number) — the matchweek lookup below
--      runs on every prediction write, so it must not seq-scan `matches`.
--   3. The prediction lock becomes matchweek-level for league fixtures.
--
-- Idempotent; safe to re-run.

-- ============================================================
-- 0. Refuse to run out of order
-- ============================================================
-- This is a hard guard, not a courtesy. §3 replaces the LIVE prediction-lock
-- trigger with a body that reads `matches.round_number` — a column 024 adds.
-- PL/pgSQL resolves column references at RUNTIME, not at CREATE time, so
-- applying this file before 024 would succeed silently and then raise
-- "column round_number does not exist" on EVERY prediction insert or update,
-- across both web and mobile, until someone noticed.
--
-- A migration whose misordering breaks all writes should not rely on the
-- operator reading a comment.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'round_number'
  ) THEN
    RAISE EXCEPTION
      'Migration 045 requires 024 (matches.round_number is missing). Apply 024_multi_competition_league_support.sql first — applying 045 alone would break every prediction write.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'format'
  ) THEN
    RAISE EXCEPTION
      'Migration 045 requires 024 (tournaments.format is missing). Apply 024_multi_competition_league_support.sql first.';
  END IF;
END $$;

-- ============================================================
-- 1. Round identity is (phase, ordinal), not a bare ordinal
-- ============================================================
-- 024 gives `round_number INTEGER`, described as "matchweek (1..38) parsed from
-- api-football 'Regular Season - N'". Checking the feed's real vocabulary across
-- ten European leagues on 2026-08-14 showed that is not sufficient:
--
--   * Bundesliga, Ligue 1, Primeira Liga  -> "Regular Season - 1..34" + "Final"
--   * Eredivisie                          -> + "Semi-finals", "Final"
--   * Championship (ENG)                  -> "Regular Season - 1..46" + play-offs
--   * Jupiler Pro League (BEL)            -> "Regular Season - 31" AND
--                                            "Championship Group - 31"
--   * Premiership (SCO)                   -> phase is "1st Phase", not
--                                            "Regular Season"; ordinals also collide
--
-- So a trailing integer is ambiguous across phases, and play-off rounds carry no
-- trailing integer at all (they parse to NULL). The ordinal alone cannot identify
-- a round. `stage` carries the phase and `round_number` the ordinal within it;
-- this column keeps the provider's own string so a collision is diagnosable after
-- the fact instead of being an unexplained duplicate matchweek.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS round_label TEXT;

COMMENT ON COLUMN matches.round_label IS
  'Raw round string from the fixtures provider (e.g. "Regular Season - 12", "Championship Group - 31", "Semi-finals"). Audit trail for round identity: `stage` is the phase, `round_number` the ordinal within it, and ordinals are NOT unique across phases in some leagues (BEL, SCO).';

-- ============================================================
-- 2. Matchweek lookup index
-- ============================================================
-- The lock in §3 resolves "first kickoff of this fixture's matchweek" on every
-- prediction INSERT/UPDATE. Without this index that is a seq scan of `matches`
-- per predicted row — on a 380-fixture season with a pool submitting ten picks
-- at a time, at kickoff, that is exactly the write amplification the tournament
-- IO work exists to avoid.
CREATE INDEX IF NOT EXISTS idx_matches_tournament_round
  ON matches (tournament_id, round_number)
  WHERE round_number IS NOT NULL;

-- ============================================================
-- 3. Matchweek-level prediction lock
-- ============================================================
-- Today `enforce_prediction_before_kickoff` locks each fixture at its OWN
-- kickoff. In a bracket that is correct: a round's fixtures kick off close
-- together and the round has its own deadline on top.
--
-- In a league it is wrong in a way members would notice immediately. A
-- matchweek runs Saturday to Monday; per-fixture locking lets someone who picks
-- on Sunday do so having already watched Saturday's results. Picks must lock for
-- the whole matchweek at its FIRST kickoff.
--
-- This MUST be enforced in the database, not the client: mobile writes
-- predictions directly to PostgREST, so a UI-level deadline is not a gate.
--
-- Behaviour for non-league fixtures is unchanged, deliberately and provably:
-- the matchweek branch is only entered when `round_number IS NOT NULL AND
-- stage = 'regular_season'`, and no row in production satisfies either half
-- today. The silent-skip semantics (RETURN NULL, no exception) are preserved
-- from the original — a rejected late edit is dropped, not surfaced as an error,
-- because the write paths do not all check for one.
CREATE OR REPLACE FUNCTION public.enforce_prediction_before_kickoff()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
declare
  v_match_date    timestamptz;
  v_is_completed  boolean;
  v_stage         text;
  v_round_number  integer;
  v_tournament_id uuid;
  v_deadline      timestamptz;
begin
  select match_date, is_completed, stage, round_number, tournament_id
    into v_match_date, v_is_completed, v_stage, v_round_number, v_tournament_id
  from public.matches
  where match_id = new.match_id;

  -- A completed fixture is closed regardless of format.
  if v_is_completed is true then
    return null;
  end if;

  -- League fixture: the deadline is the matchweek's first kickoff, not this
  -- fixture's. COALESCE keeps the per-fixture date as the floor, so a matchweek
  -- whose other fixtures are somehow undated still locks at this one.
  if v_stage = 'regular_season' and v_round_number is not null then
    select min(m.match_date)
      into v_deadline
    from public.matches m
    where m.tournament_id = v_tournament_id
      and m.round_number  = v_round_number
      and m.stage         = 'regular_season'
      and m.match_date is not null;

    v_deadline := coalesce(v_deadline, v_match_date);
  else
    v_deadline := v_match_date;
  end if;

  -- Undated matches are treated as not-yet-started (safe default).
  if v_deadline is not null and v_deadline <= now() then
    return null;  -- skip this row; the edit is not persisted
  end if;

  return new;
end;
$function$;

-- ============================================================
-- 4. Allow the league pool format
-- ============================================================
-- Shipped here, ahead of any code that names it, per the entry_xp_state lesson:
-- a deploy that references a value the schema rejects fails the whole write, and
-- PostgREST reports it as a 400 that discarded-error call sites never surface.
--
-- Widening a CHECK to a superset cannot affect existing rows, and nothing can
-- create a pool in this mode until the create-pool wizards offer it.
--
-- Why a new value rather than reusing 'progressive': progressive rounds exist
-- because a knockout round's teams are unknown until the previous round
-- resolves. League matchweeks exist because a season has weeks. Same machinery,
-- different reason — and conflating them buries the league inside a mode whose
-- name will never fit it. (Ryan, 2026-08-14.)
ALTER TABLE pools DROP CONSTRAINT IF EXISTS pools_prediction_mode_check;
ALTER TABLE pools ADD  CONSTRAINT pools_prediction_mode_check
  CHECK (prediction_mode IN ('full_tournament','progressive','bracket_picker','league_pickem'));

-- ============================================================
-- Down-migration (rollback)
-- ============================================================
-- ALTER TABLE pools DROP CONSTRAINT IF EXISTS pools_prediction_mode_check;
-- ALTER TABLE pools ADD  CONSTRAINT pools_prediction_mode_check
--   CHECK (prediction_mode IN ('full_tournament','progressive','bracket_picker'));
--
-- CREATE OR REPLACE FUNCTION public.enforce_prediction_before_kickoff()
-- RETURNS trigger LANGUAGE plpgsql AS $function$
-- declare
--   v_match_date   timestamptz;
--   v_is_completed boolean;
-- begin
--   select match_date, is_completed into v_match_date, v_is_completed
--   from public.matches where match_id = new.match_id;
--   if v_is_completed is true
--      or (v_match_date is not null and v_match_date <= now()) then
--     return null;
--   end if;
--   return new;
-- end;
-- $function$;
--
-- DROP INDEX IF EXISTS idx_matches_tournament_round;
-- ALTER TABLE matches DROP COLUMN IF EXISTS round_label;
