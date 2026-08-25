-- =============================================================
-- 078 — LEAGUE TABLE PREDICTIONS — twenty clubs, one decision
-- =============================================================
-- Plan §3.3 and §3.4. The storage half of Table mode: where each entry thinks
-- each club finishes, and the deadline that closes it.
--
-- ## The DEFERRABLE unique constraint is load-bearing
--
-- Reordering is a SWAP. Moving a club from 7th to 4th shifts four rows, and for
-- the duration of that one statement two clubs genuinely do hold the same
-- position. An immediately-checked unique constraint rejects that intermediate
-- state and the reorder is impossible without a temp-position dance. DEFERRABLE
-- INITIALLY DEFERRED moves the check to COMMIT, where the invariant is what we
-- actually mean: no two clubs share a position *when the transaction ends*.
--
-- ## The lock is a silent skip, and that is the house pattern
--
-- `trg_enforce_prediction_before_kickoff` (World Cup) and
-- `enforce_league_prediction_before_lock` (migration 058) both RETURN NULL
-- rather than RAISE. Inherited deliberately, for the same reason: mobile writes
-- these tables directly, so the gate has to be in the database, and a late write
-- is a race a member can lose honestly — not an error to shout about. §3.4 says
-- the write path "reads back and reports", which is how a member finds out.
--
-- The wrong-club case DOES raise, because that is a programming error rather
-- than a lost race, and silently discarding it would leave a table prediction
-- with a hole in it that nothing would ever explain.
--
-- ## Why members can see each other's after the lock
--
-- Decision 11: a member who joins after the lock is read-only and scores 0, but
-- "they still see the live comparison and everyone else's predictions". The
-- same is true for everyone else — this is the argument the mode exists to
-- start. It mirrors the World Cup's shipped "see everyone's picks after lock",
-- and the `now() >= league_table_lock_at` guard is what keeps it from leaking a
-- prediction while the window is still open.
-- =============================================================

CREATE TABLE IF NOT EXISTS league_table_predictions (
  entry_id           uuid NOT NULL REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  club_id            uuid NOT NULL REFERENCES league_clubs(club_id)  ON DELETE CASCADE,
  predicted_position integer NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, club_id),
  -- 30, not 20: Bundesliga is 18 and some leagues are 24. The range is a
  -- sanity bound, not a league size.
  CONSTRAINT ltp_position_ck CHECK (predicted_position BETWEEN 1 AND 30)
);

ALTER TABLE league_table_predictions
  DROP CONSTRAINT IF EXISTS ltp_one_club_per_position;
ALTER TABLE league_table_predictions
  ADD CONSTRAINT ltp_one_club_per_position UNIQUE (entry_id, predicted_position)
  DEFERRABLE INITIALLY DEFERRED;

COMMENT ON TABLE league_table_predictions IS
  'One row per club per entry: where this entry thinks that club finishes. Plan section 3. The unique constraint is DEFERRABLE INITIALLY DEFERRED because a drag-reorder swaps two positions inside one transaction and an immediate check would reject the intermediate state.';

CREATE INDEX IF NOT EXISTS idx_ltp_club ON league_table_predictions(club_id);

-- ---------- RLS: mirrors league_predictions, plus the after-lock read ----------
ALTER TABLE league_table_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own table predictions" ON league_table_predictions;
CREATE POLICY "Users can view own table predictions"
  ON league_table_predictions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM pool_entries pe
      JOIN pool_members pm ON pe.member_id = pm.member_id
      JOIN users u ON pm.user_id = u.user_id
    WHERE pe.entry_id = league_table_predictions.entry_id
      AND u.auth_user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Members can view all table predictions after the lock" ON league_table_predictions;
CREATE POLICY "Members can view all table predictions after the lock"
  ON league_table_predictions FOR SELECT
  USING (EXISTS (
    SELECT 1
      FROM pool_entries pe
      JOIN pool_members owner_pm ON pe.member_id = owner_pm.member_id
      JOIN pools po ON po.pool_id = owner_pm.pool_id
      JOIN pool_members viewer_pm ON viewer_pm.pool_id = po.pool_id
      JOIN users u ON viewer_pm.user_id = u.user_id
    WHERE pe.entry_id = league_table_predictions.entry_id
      AND u.auth_user_id = (SELECT auth.uid())
      AND po.league_table_lock_at IS NOT NULL
      AND now() >= po.league_table_lock_at
  ));

DROP POLICY IF EXISTS "Pool admins can view all table predictions" ON league_table_predictions;
CREATE POLICY "Pool admins can view all table predictions"
  ON league_table_predictions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM pool_entries pe
      JOIN pool_members pm ON pe.member_id = pm.member_id
    WHERE pe.entry_id = league_table_predictions.entry_id
      AND is_pool_admin(pm.pool_id)
  ));

-- Write policies carry `pe.retired_at IS NULL` — migration 056/057's soft
-- deletion. Someone who stopped participating keeps their prediction on record
-- but cannot change it.
DROP POLICY IF EXISTS "Users can insert own table predictions" ON league_table_predictions;
CREATE POLICY "Users can insert own table predictions"
  ON league_table_predictions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM pool_entries pe
      JOIN pool_members pm ON pe.member_id = pm.member_id
      JOIN users u ON pm.user_id = u.user_id
      JOIN pools po ON po.pool_id = pm.pool_id
    WHERE pe.entry_id = league_table_predictions.entry_id
      AND u.auth_user_id = (SELECT auth.uid())
      AND po.archived_at IS NULL
      AND pe.retired_at IS NULL
  ));

DROP POLICY IF EXISTS "Users can update own table predictions" ON league_table_predictions;
CREATE POLICY "Users can update own table predictions"
  ON league_table_predictions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM pool_entries pe
      JOIN pool_members pm ON pe.member_id = pm.member_id
      JOIN users u ON pm.user_id = u.user_id
      JOIN pools po ON po.pool_id = pm.pool_id
    WHERE pe.entry_id = league_table_predictions.entry_id
      AND u.auth_user_id = (SELECT auth.uid())
      AND po.archived_at IS NULL
      AND pe.retired_at IS NULL
  ));

-- DELETE exists because a reorder may need to clear a stale row; the lock
-- trigger does not fire on DELETE, so the write path must not offer deletion
-- after the lock. Verified by scripts/verify-table-mode.ts.
DROP POLICY IF EXISTS "Users can delete own table predictions" ON league_table_predictions;
CREATE POLICY "Users can delete own table predictions"
  ON league_table_predictions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM pool_entries pe
      JOIN pool_members pm ON pe.member_id = pm.member_id
      JOIN users u ON pm.user_id = u.user_id
      JOIN pools po ON po.pool_id = pm.pool_id
    WHERE pe.entry_id = league_table_predictions.entry_id
      AND u.auth_user_id = (SELECT auth.uid())
      AND po.archived_at IS NULL
      AND pe.retired_at IS NULL
  ));

-- ---------- the lock ----------
CREATE OR REPLACE FUNCTION public.enforce_league_table_before_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pool_id   uuid;
  v_season_id uuid;
  v_lock_at   timestamptz;
  v_club_ok   boolean;
BEGIN
  SELECT po.pool_id, po.league_season_id, po.league_table_lock_at
    INTO v_pool_id, v_season_id, v_lock_at
    FROM pool_entries pe
    JOIN pool_members pm ON pe.member_id = pm.member_id
    JOIN pools po ON po.pool_id = pm.pool_id
   WHERE pe.entry_id = NEW.entry_id;

  IF v_pool_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM league_clubs lc
     WHERE lc.club_id = NEW.club_id AND lc.season_id = v_season_id
  ) INTO v_club_ok;

  IF NOT v_club_ok THEN
    RAISE EXCEPTION
      'club % is not in this pool''s season (%). A table prediction can only order the clubs actually playing in it.',
      NEW.club_id, v_season_id;
  END IF;

  IF v_lock_at IS NOT NULL AND now() >= v_lock_at THEN
    RETURN NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_enforce_league_table_before_lock ON league_table_predictions;
CREATE TRIGGER trg_enforce_league_table_before_lock
  BEFORE INSERT OR UPDATE ON league_table_predictions
  FOR EACH ROW EXECUTE FUNCTION enforce_league_table_before_lock();
