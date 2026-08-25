-- =============================================================
-- 077 — LEAGUE MODE becomes a first-class column, and Table gets its config
-- =============================================================
-- Plan §0.1 and §0.2. Ryan overturned Decision 9: Full Table is a standalone
-- MODE, not an add-on to Pick'em. That overturn is recorded in the plan with its
-- cause — the mode is aimed at people new to football who want one decision they
-- can come back and check, and the return-reason is the live table plus
-- notifications rather than a weekly input.
--
-- The plan says plainly that the previous assumption — a single `league_depth`
-- column plus a Full Table boolean — "is now wrong". So this migration does NOT
-- add `league_table_enabled` from §3.3. A boolean add-on and a mode cannot both
-- be true, and shipping the boolean would leave a column that contradicts the
-- decision it was superseded by.
--
-- ## Two levels, not one
--
--   level 1  league_mode   pickem | showdown | last_man_standing | table
--   level 2  league_depth  results | scores  — asked ONLY for pickem and showdown
--
-- Last Man Standing and Table have no depth axis at all: there is no "predict
-- the scoreline" version of ordering twenty clubs. That is enforced below rather
-- than left to the write path, because mobile writes directly.
--
-- ## Why both are immutable
--
-- `league_depth` already is (migration 064) — mixed depths make weekly scores
-- incomparable. Mode is stronger still: changing it mid-season would strand
-- every prediction already made in the old mode, and there is no honest way to
-- convert twenty club positions into 380 fixture picks or back.
-- =============================================================

-- ---------- level 1 ----------
ALTER TABLE pools ADD COLUMN IF NOT EXISTS league_mode text;

ALTER TABLE pools DROP CONSTRAINT IF EXISTS pools_league_mode_ck;
ALTER TABLE pools ADD CONSTRAINT pools_league_mode_ck
  CHECK (league_mode IS NULL
         OR league_mode IN ('pickem', 'showdown', 'last_man_standing', 'table'));

COMMENT ON COLUMN pools.league_mode IS
  'pickem | showdown | last_man_standing | table, for league pools only; NULL for the 623 World Cup pools. Set at creation and immutable thereafter (trg_league_mode_immutable). No column default ON PURPOSE: a default would stamp every new bracket pool, exactly as league_depth avoids.';

-- Both existing league pools are Pick'em — they have 38 matchweeks of fixture
-- picks and nothing else. Stamped explicitly rather than by default so the
-- backfill is visible in this file.
UPDATE pools
   SET league_mode = 'pickem'
 WHERE league_season_id IS NOT NULL
   AND league_mode IS NULL;

-- ---------- the two levels have to agree ----------
-- A Table pool with a depth would be answering a question it was never asked.
ALTER TABLE pools DROP CONSTRAINT IF EXISTS pools_league_mode_depth_ck;
ALTER TABLE pools ADD CONSTRAINT pools_league_mode_depth_ck
  CHECK (
    league_mode IS NULL
    OR (league_mode IN ('table', 'last_man_standing') AND league_depth IS NULL)
    OR (league_mode IN ('pickem', 'showdown')         AND league_depth IS NOT NULL)
  );

-- ---------- Table mode's own configuration ----------
-- Profile survives §0.2 unchanged: it was two profiles of an add-on, it is now
-- two profiles of a mode. `full_table` pays for all twenty positions;
-- `headline_only` pays only the champion / top-four / relegation bonuses, which
-- is what Decision 9 originally described.
ALTER TABLE pools ADD COLUMN IF NOT EXISTS league_table_profile text;

ALTER TABLE pools DROP CONSTRAINT IF EXISTS pools_league_table_profile_ck;
ALTER TABLE pools ADD CONSTRAINT pools_league_table_profile_ck
  CHECK (league_table_profile IS NULL
         OR league_table_profile IN ('full_table', 'headline_only'));

COMMENT ON COLUMN pools.league_table_profile IS
  'full_table | headline_only — what a Table pool pays for. NULL for every non-table pool.';

-- The deadline, §3.4. A POOL-level fact, set once at creation, so that everyone
-- in a pool faces the same deadline and their scores stay comparable. A pool
-- created in November cannot ask for a prediction whose deadline was August, so
-- this is "the first kickoff of the first matchweek that had not yet locked when
-- the pool was created" — a real, live prediction whenever the pool starts.
ALTER TABLE pools ADD COLUMN IF NOT EXISTS league_table_lock_at timestamptz;

COMMENT ON COLUMN pools.league_table_lock_at IS
  'When this pool''s table prediction closes: the first kickoff of the first matchweek that had not yet locked at pool creation. Pool-level so every member shares one deadline. Enforced by trg_enforce_league_table_before_lock, not by the UI — mobile writes directly.';

-- ---------- immutability ----------
CREATE OR REPLACE FUNCTION public.enforce_league_mode_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Guarded on OLD being non-NULL so that stamping a mode onto a pool that has
  -- none yet still works; only a CHANGE is refused. Same shape as
  -- enforce_league_depth_immutable, deliberately.
  IF OLD.league_mode IS NOT NULL
     AND NEW.league_mode IS DISTINCT FROM OLD.league_mode THEN
    RAISE EXCEPTION
      'league_mode is fixed at pool creation (% -> %). Changing mode mid-season strands every prediction already made — twenty club positions and 380 fixture picks do not convert into one another.',
      OLD.league_mode, NEW.league_mode;
  END IF;

  -- The deadline is a promise. Moving it forward would retroactively close a
  -- window members were told was open; moving it back would reopen one they were
  -- told had shut, letting a late entry predict a table already part-decided.
  IF OLD.league_table_lock_at IS NOT NULL
     AND NEW.league_table_lock_at IS DISTINCT FROM OLD.league_table_lock_at THEN
    RAISE EXCEPTION
      'league_table_lock_at is fixed at pool creation (% -> %). It is the deadline members were shown.',
      OLD.league_table_lock_at, NEW.league_table_lock_at;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_league_mode_immutable ON pools;
CREATE TRIGGER trg_league_mode_immutable
  BEFORE UPDATE ON pools
  FOR EACH ROW EXECUTE FUNCTION enforce_league_mode_immutable();
