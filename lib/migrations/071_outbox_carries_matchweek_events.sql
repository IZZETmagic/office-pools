-- Migration 071: the outbox can carry a MATCHWEEK event, not only a fixture one.
--
-- ⚠ NOT IN THE PLAN, and it blocks all of L-F. Migration 059 widened
-- `league_score_events.kind` to accept `matchweek_opened`, `lock_reminder`,
-- `matchweek_completed` and `table_deadline` — decision 5, so the notifications
-- phase would be "write the producers and handlers" rather than "migrate the
-- outbox first". But `fixture_id` is NOT NULL, and none of those four events
-- belongs to a fixture. The column widened; the row shape did not.
--
-- ⚠ FILE NUMBERING: 067-070 on disk belong to the concurrent Paddle billing
-- work. The league migrations continue at 071. Supabase versions are
-- timestamps, so the file numbers are a reading convention only.
--
-- An event now points at EXACTLY ONE of a fixture or a matchweek, enforced by
-- CHECK rather than convention — the consumer switches on which is present.
--
-- ⚠ The dedup index needs splitting in two. `uq_lse_pending` is UNIQUE on
-- (pool_id, fixture_id, kind), and in a btree unique index NULLs do not conflict
-- with each other — so the moment `fixture_id` is nullable, every matchweek
-- event would be free to duplicate without limit.

ALTER TABLE league_score_events
  ADD COLUMN IF NOT EXISTS matchweek_id uuid REFERENCES league_matchweeks(matchweek_id) ON DELETE CASCADE;

ALTER TABLE league_score_events ALTER COLUMN fixture_id DROP NOT NULL;

ALTER TABLE league_score_events DROP CONSTRAINT IF EXISTS league_score_events_target_ck;
ALTER TABLE league_score_events ADD CONSTRAINT league_score_events_target_ck
  CHECK (
    (fixture_id IS NOT NULL AND matchweek_id IS NULL)
    OR
    (fixture_id IS NULL AND matchweek_id IS NOT NULL)
  );

DROP INDEX IF EXISTS uq_lse_pending;
CREATE UNIQUE INDEX IF NOT EXISTS uq_lse_pending_fixture
  ON league_score_events (pool_id, fixture_id, kind)
  WHERE processed_at IS NULL AND fixture_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lse_pending_matchweek
  ON league_score_events (pool_id, matchweek_id, kind)
  WHERE processed_at IS NULL AND matchweek_id IS NOT NULL;

COMMENT ON COLUMN league_score_events.matchweek_id IS
  'Set for matchweek-level events (matchweek_opened, lock_reminder, matchweek_completed, table_deadline). Mutually exclusive with fixture_id — see league_score_events_target_ck. The consumer switches on which one is present.';
