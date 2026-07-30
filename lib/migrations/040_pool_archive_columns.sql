-- 040: pool archive, part 1 of 2 — THE COLUMNS ONLY
--
-- ✅ Applied to prod 2026-07-30 (Supabase migration: pool_archive_columns).
-- Post-apply: 623 pools, all archived_at NULL, 0 archived. Both admin DELETE
-- policies deliberately still in place — those come out in 041, at deploy time.
--
-- Applied out of order, under duress: the pool list had already gone blank
-- because app/pools/page.tsx and app/dashboard/page.tsx were selecting
-- `archived_at` before it existed. That is the failure mode described below,
-- and it is why the two halves are split.
--
-- SAFE TO APPLY AT ANY TIME, AND MUST BE APPLIED BEFORE THE CODE DEPLOY.
-- Purely additive: two nullable columns. No policy changes, no behaviour
-- change, nothing reads them until 041 and the deploy land.
--
-- WHY THIS IS SPLIT FROM THE POLICY CHANGES (041)
-- The two halves have OPPOSITE ordering constraints, which is what caught us:
--
--   * The COLUMNS must exist BEFORE any deployed code names them. PostgREST
--     rejects a select naming an unknown column with a 400, and this codebase
--     discards those errors (`const { data } = await supabase...`), so the page
--     renders empty rather than failing loudly. That is exactly how the pool
--     list went blank on 2026-07-30, and the same shape as the 7-hour silent
--     `entry_xp_state` outage on 2026-07-28.
--
--   * The POLICY DROPS must land WITH OR AFTER the code deploy. Dropping the
--     `pools` DELETE policy while the old Delete Pool buttons are still live in
--     production means an admin's tap still destroys every member's data via the
--     `pool_members` cascade, and merely leaves the pool row behind as an empty
--     husk — with the UI reporting success throughout. See 041.
--
-- So: apply 040 now, deploy the code, then apply 041.
--
-- WHY archived_at AND NOT status='archived'
-- `pools.status` is the COMPETITION lifecycle (open / completed). Archive is
-- VISIBILITY. They are orthogonal — a pool can be completed and archived — and
-- collapsing them is what produced the bug where the "Archive" button wrote
-- status='completed' and destroyed the lifecycle value. Restore is
-- `archived_at = NULL`, which is as simple as an undo gets.
--
-- NOT DOING: a purge clock. Trash-with-expiry solves a storage-cost problem this
-- product does not have, and an expiry timer on other people's season history is
-- the wrong default. Archived is archived until someone restores it.
--
-- NO INDEX. `pools` is 623 rows; a partial index on archived_at would never be
-- chosen over a seq scan. Add one when the table is large enough to need it.

BEGIN;

ALTER TABLE pools ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(user_id);

COMMENT ON COLUMN pools.archived_at IS
  'When an admin archived this pool. NULL = active. Restore sets it back to NULL. '
  'Independent of status, which tracks the competition lifecycle.';
COMMENT ON COLUMN pools.archived_by IS
  'The user who archived it, so members can be told who and when. Kept on restore.';

COMMIT;

-- ROLLBACK -----------------------------------------------------------------
-- Only safe once no deployed code selects these columns.
-- BEGIN;
-- ALTER TABLE pools DROP COLUMN IF EXISTS archived_by;
-- ALTER TABLE pools DROP COLUMN IF EXISTS archived_at;
-- COMMIT;
