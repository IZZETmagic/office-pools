-- Migration 056: soft deletion — an entry is detached, never destroyed.
--
-- Plan: drafts/2026-08-24_league_pools_full_plan.md §0.7, decision 15.
-- Ryan, 2026-08-24: "we want a soft deletion ... if they're added back in,
-- they're linked back up to their predictions."
--
-- ============================================================
-- THE PROBLEM
-- ============================================================
-- Four doors currently destroy a member's entire history, irreversibly:
--
--   1. app/api/pools/[pool_id]/leave                  DELETE pool_members
--   2. app/api/pools/[pool_id]/stop-participating     DELETE pool_entries
--   3. .../entries/[entry_id]/delete                  DELETE one entry
--   4. .../entries  (DELETE)                          DELETE a spare entry
--
-- Every one of them cascades. `pool_entries` is the parent of 12+ children
-- (predictions, league_predictions, league_entry_totals, league_match_scores,
-- match_scores, bonus_scores, badge_unlocks, entry_xp_state, the four
-- bracket_picker_* tables, ...) all declared ON DELETE CASCADE, so a single
-- click erases a whole season with no undo. This produced real World Cup
-- complaints about accidental removals that could not be reversed.
--
-- ⚠ Door 4 is the sharpest edge for a LEAGUE pool. It guards itself with
-- "Cannot delete a submitted entry", reading pool_entries.has_submitted_
-- predictions -- a column the league write path deliberately NEVER SETS,
-- because those two columns are the only doors by which a league entry reaches
-- the World Cup scoring selectors. So for a league entry that guard is always
-- false: door 4 would cheerfully delete an entry holding 38 matchweeks of
-- picks and believe it was discarding an empty spare.
--
-- ============================================================
-- WHY THIS SHAPE AND NOT A `left_at` FLAG ON pool_members
-- ============================================================
-- The conventional soft delete -- keep the membership row, add left_at -- was
-- rejected. 136 sites read pool_members and 23 migrations carry RLS policies
-- keyed on membership; every one of them would have to start filtering
-- left_at IS NULL, and a single miss leaves a departed member with live access
-- to a pool. That is a security regression, and it is the same silent-wrongness
-- shape as the 2026-08-22 DROP COLUMN outage.
--
-- The load-bearing observation instead: **pool_entries has no pool_id**. Every
-- read reaches an entry by joining THROUGH pool_members -- including the league
-- engine itself (055: JOIN pool_entries pe ... JOIN pool_members pm ON
-- pm.member_id = pe.member_id JOIN pools po ON po.pool_id = pm.pool_id, an
-- INNER join). So an entry whose member_id is NULL is ALREADY invisible to
-- every existing query and every scoring engine, with no change to either.
--
-- Therefore: leave/kick still DELETEs the pool_members row exactly as today --
-- access is genuinely revoked, all 136 reads and 23 policies keep working
-- untouched -- and the FK below lets the entry survive it, detached.
--
-- ============================================================
-- WHAT THIS MIGRATION DOES
-- ============================================================
--   1. pool_entries.pool_id + .user_id  -- so a DETACHED entry still knows
--      which pool and which person it belonged to. Without these a NULL
--      member_id is an orphan nobody can find, which would make restoring
--      impossible. Backfilled, and kept correct on INSERT by a trigger so no
--      existing entry-creation code has to change.
--   2. pool_entries.retired_at / .retired_reason / .retired_by
--   3. member_id becomes NULLable and its FK becomes ON DELETE SET NULL
--   4. a partial index for finding a retired entry to restore
--
-- ============================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================
--   * pool_id and user_id stay NULLABLE. They are backfilled and
--     trigger-maintained, but NOT NULL is a separate migration once production
--     has run with them for a while -- per the entry_xp_state lesson, the
--     cheap version ships first and the constraint follows evidence.
--   * No read site is changed here. Retired entries fall out of the existing
--     joins on their own (see above). The four routes change in application
--     code, and per the entry_xp_state lesson THIS MIGRATION SHIPS FIRST,
--     before any code names these columns.
--   * Nothing about the World Cup scoring path is touched. This is shared
--     plumbing, so it protects all 623 World Cup pools too -- which is the
--     reason Ryan wants it and an accepted, deliberate exception to the
--     league/World-Cup scope boundary.

BEGIN;

-- ------------------------------------------------------------------ 1. cols
ALTER TABLE pool_entries
  ADD COLUMN IF NOT EXISTS pool_id        uuid REFERENCES pools(pool_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id        uuid REFERENCES users(user_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS retired_at     timestamptz,
  ADD COLUMN IF NOT EXISTS retired_reason text,
  ADD COLUMN IF NOT EXISTS retired_by     uuid REFERENCES users(user_id) ON DELETE SET NULL;

-- 'left'    — the member chose to leave the pool
-- 'removed' — an admin or super-admin removed them / their entry
-- 'stopped' — the member stopped participating but stayed in the pool
-- 'spare'   — an unused extra entry discarded by its owner (door 4)
ALTER TABLE pool_entries DROP CONSTRAINT IF EXISTS pool_entries_retired_reason_ck;
ALTER TABLE pool_entries ADD CONSTRAINT pool_entries_retired_reason_ck
  CHECK (retired_reason IS NULL OR retired_reason IN ('left','removed','stopped','spare'));

-- The two must agree, or "is this entry competing?" has two contradictory
-- answers depending on which column you read.
ALTER TABLE pool_entries DROP CONSTRAINT IF EXISTS pool_entries_retired_pair_ck;
ALTER TABLE pool_entries ADD CONSTRAINT pool_entries_retired_pair_ck
  CHECK ((retired_at IS NULL) = (retired_reason IS NULL));

COMMENT ON COLUMN pool_entries.pool_id IS
  'Which pool this entry belongs to. Denormalised from pool_members ON PURPOSE: a retired entry has member_id = NULL and would otherwise be unfindable. Trigger-maintained on INSERT; do not set it by hand.';
COMMENT ON COLUMN pool_entries.user_id IS
  'Which person this entry belongs to. Same reason as pool_id. Survives detachment so a rejoining member can be reunited with their predictions.';
COMMENT ON COLUMN pool_entries.retired_at IS
  'Non-NULL means this entry no longer competes: excluded from leaderboards and not scored. Its predictions are RETAINED. Clearing this and restoring member_id restores the entry in full, including matchweeks that completed while it was retired.';

-- --------------------------------------------------------------- 2. backfill
UPDATE pool_entries pe
   SET pool_id = pm.pool_id,
       user_id = pm.user_id
  FROM pool_members pm
 WHERE pm.member_id = pe.member_id
   AND (pe.pool_id IS NULL OR pe.user_id IS NULL);

-- ---------------------------------------------------------------- 3. trigger
-- Fills the two denormalised columns from the membership on INSERT, so every
-- existing entry-creation site keeps working unchanged. BEFORE INSERT, and it
-- never overwrites a value the caller supplied.
CREATE OR REPLACE FUNCTION fill_pool_entry_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.member_id IS NOT NULL AND (NEW.pool_id IS NULL OR NEW.user_id IS NULL) THEN
    SELECT COALESCE(NEW.pool_id, pm.pool_id),
           COALESCE(NEW.user_id, pm.user_id)
      INTO NEW.pool_id, NEW.user_id
      FROM pool_members pm
     WHERE pm.member_id = NEW.member_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_pool_entry_identity ON pool_entries;
CREATE TRIGGER trg_fill_pool_entry_identity
  BEFORE INSERT ON pool_entries
  FOR EACH ROW EXECUTE FUNCTION fill_pool_entry_identity();

-- --------------------------------------------------------- 4. break the cascade
-- The whole point. Deleting a membership now DETACHES the entry instead of
-- destroying it and its twelve cascade children.
ALTER TABLE pool_entries ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE pool_entries DROP CONSTRAINT IF EXISTS pool_entries_member_id_fkey;
ALTER TABLE pool_entries
  ADD CONSTRAINT pool_entries_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES pool_members(member_id) ON DELETE SET NULL;

COMMENT ON CONSTRAINT pool_entries_member_id_fkey ON pool_entries IS
  'ON DELETE SET NULL, not CASCADE. Leaving or being removed from a pool detaches the entry; it does not destroy a season of predictions. Restoring re-points member_id at the new membership row.';

-- ------------------------------------------------------------------ 5. index
-- The restore lookup: "does this person have a retired entry in this pool?"
CREATE INDEX IF NOT EXISTS pool_entries_retired_lookup_idx
  ON pool_entries (pool_id, user_id)
  WHERE retired_at IS NOT NULL;

-- Detached entries are rare and always interesting — cheap to find them all.
CREATE INDEX IF NOT EXISTS pool_entries_detached_idx
  ON pool_entries (pool_id)
  WHERE member_id IS NULL;

COMMIT;

-- ============================================================
-- VERIFY
-- ============================================================
-- Expect: backfilled = 0 (every entry with a membership knows its pool/user),
-- delete_rule = 'SET NULL', and member_id nullable.
--
--   SELECT count(*) AS unbackfilled
--     FROM pool_entries pe JOIN pool_members pm ON pm.member_id = pe.member_id
--    WHERE pe.pool_id IS NULL OR pe.user_id IS NULL;
--
--   SELECT rc.delete_rule
--     FROM information_schema.referential_constraints rc
--    WHERE rc.constraint_name = 'pool_entries_member_id_fkey';
--
--   SELECT is_nullable FROM information_schema.columns
--    WHERE table_name = 'pool_entries' AND column_name = 'member_id';
--
-- Or run:  npx tsx scripts/verify-soft-delete.ts
