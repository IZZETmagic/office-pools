-- =============================================================
-- 086 — LAST MAN STANDING: rounds, picks, and the matchweek lock
-- =============================================================
-- L-K. Pick one club a matchweek to WIN. Wrong, and you are out.
--
-- ## Repeating rounds, and why the mode would fail without them
--
-- Decision 9 is explicit: **not one elimination.** At ~7.6 members and a
-- realistic 65-70% weekly survival rate a single round is down to one player in
-- five or six matchweeks — of thirty-eight. A pool that is dead in September
-- fails the purpose clause outright. So a round ends when one player is left,
-- a new one opens the next matchweek with everybody back in, and the season
-- score is **rounds won**.
--
-- ## The rule that makes it a game
--
-- `lms_club_once_per_round` — a club may be picked ONCE per round. Without it
-- everyone picks the best team in the league every week and the mode is a
-- coin-flip with extra steps. It is also why rounds stay short: twenty clubs is
-- a hard ceiling on how long a round can run, and the good ones go early.
--
-- ## The lock is at MATCHWEEK level
--
-- Decision 9 flags this as a trap, and it is a real one — but it is the WORLD
-- CUP trigger it applies to. `trg_enforce_prediction_before_kickoff` locks at
-- each match's own kickoff, which for LMS would let a Sunday picker watch
-- Saturday's results and then choose a club that has already won. Migration 058
-- already made the league's own trigger lock on `league_matchweeks.lock_at`, and
-- `lock_at` IS the first kickoff — verified against production. This trigger
-- copies that shape rather than the World Cup one.
--
-- Silent skip (RETURN NULL), the house pattern: mobile writes directly, so the
-- gate has to be in the database, and a late write is a race a member can lose
-- honestly. The write path reads back and reports.
-- =============================================================

CREATE TABLE IF NOT EXISTS league_lms_rounds (
  round_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id         uuid NOT NULL REFERENCES pools(pool_id) ON DELETE CASCADE,
  round_number    integer NOT NULL,
  first_matchweek integer NOT NULL,
  last_matchweek  integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_id, round_number),
  CONSTRAINT lms_round_mw_ck CHECK (first_matchweek BETWEEN 1 AND 60)
);

COMMENT ON TABLE league_lms_rounds IS
  'One elimination round. last_matchweek NULL means it is still running. Rounds repeat all season — Decision 9: a single elimination is over in five or six matchweeks of thirty-eight, and a pool dead in September fails the purpose clause.';

-- Exactly one round can be open per pool. A second would let an entry hold two
-- lives at once, and the club-once-per-round rule would stop meaning anything.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_one_open_round
  ON league_lms_rounds(pool_id) WHERE last_matchweek IS NULL;

CREATE TABLE IF NOT EXISTS league_lms_survivors (
  round_id             uuid NOT NULL REFERENCES league_lms_rounds(round_id) ON DELETE CASCADE,
  entry_id             uuid NOT NULL REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  eliminated_matchweek integer,
  is_winner            boolean NOT NULL DEFAULT false,
  PRIMARY KEY (round_id, entry_id)
);

COMMENT ON COLUMN league_lms_survivors.eliminated_matchweek IS
  'NULL means still standing. Set to the matchweek whose result knocked them out — not the one they failed to pick in, so the record reads as a football event rather than an administrative one.';

CREATE TABLE IF NOT EXISTS league_lms_picks (
  round_id         uuid NOT NULL REFERENCES league_lms_rounds(round_id) ON DELETE CASCADE,
  entry_id         uuid NOT NULL REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  matchweek_number integer NOT NULL,
  club_id          uuid NOT NULL REFERENCES league_clubs(club_id) ON DELETE CASCADE,
  result           text,
  settled_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, entry_id, matchweek_number),
  CONSTRAINT lms_result_ck CHECK (result IS NULL OR result IN ('survived', 'eliminated')),
  -- THE rule. One club, once, per round.
  CONSTRAINT lms_club_once_per_round UNIQUE (round_id, entry_id, club_id)
);

COMMENT ON CONSTRAINT lms_club_once_per_round ON league_lms_picks IS
  'A club may be used once per round. Without this everyone picks the best team every week and the mode is a coin-flip with extra steps.';

CREATE INDEX IF NOT EXISTS idx_lms_picks_mw ON league_lms_picks(round_id, matchweek_number);

ALTER TABLE league_lms_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_lms_survivors ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_lms_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their pool's rounds" ON league_lms_rounds;
CREATE POLICY "Members can view their pool's rounds"
  ON league_lms_rounds FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM pool_members pm JOIN users u ON pm.user_id = u.user_id
    WHERE pm.pool_id = league_lms_rounds.pool_id AND u.auth_user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Members can view survivors" ON league_lms_survivors;
CREATE POLICY "Members can view survivors"
  ON league_lms_survivors FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM league_lms_rounds r
      JOIN pool_members pm ON pm.pool_id = r.pool_id
      JOIN users u ON pm.user_id = u.user_id
    WHERE r.round_id = league_lms_survivors.round_id AND u.auth_user_id = (SELECT auth.uid())
  ));

-- ⚠ Own picks only while the matchweek is OPEN. Who is still standing is public
-- all along — that is the drama — but WHICH club somebody has chosen is a live
-- pick, and showing it early would let the pool copy the best player.
DROP POLICY IF EXISTS "Users can view own picks" ON league_lms_picks;
CREATE POLICY "Users can view own picks"
  ON league_lms_picks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM pool_entries pe
      JOIN pool_members pm ON pe.member_id = pm.member_id
      JOIN users u ON pm.user_id = u.user_id
    WHERE pe.entry_id = league_lms_picks.entry_id AND u.auth_user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "Members can view locked picks" ON league_lms_picks;
CREATE POLICY "Members can view locked picks"
  ON league_lms_picks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM league_lms_rounds r
      JOIN pools po ON po.pool_id = r.pool_id
      JOIN pool_members pm ON pm.pool_id = r.pool_id
      JOIN users u ON pm.user_id = u.user_id
      JOIN league_matchweeks mw ON mw.season_id = po.league_season_id
                               AND mw.matchweek_number = league_lms_picks.matchweek_number
    WHERE r.round_id = league_lms_picks.round_id
      AND u.auth_user_id = (SELECT auth.uid())
      AND mw.lock_at IS NOT NULL AND now() >= mw.lock_at
  ));

DROP POLICY IF EXISTS "Users can write own picks" ON league_lms_picks;
CREATE POLICY "Users can write own picks"
  ON league_lms_picks FOR ALL
  USING (EXISTS (
    SELECT 1 FROM pool_entries pe
      JOIN pool_members pm ON pe.member_id = pm.member_id
      JOIN users u ON pm.user_id = u.user_id
      JOIN pools po ON po.pool_id = pm.pool_id
    WHERE pe.entry_id = league_lms_picks.entry_id
      AND u.auth_user_id = (SELECT auth.uid())
      AND po.archived_at IS NULL
      AND pe.retired_at IS NULL
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM pool_entries pe
      JOIN pool_members pm ON pe.member_id = pm.member_id
      JOIN users u ON pm.user_id = u.user_id
      JOIN pools po ON po.pool_id = pm.pool_id
    WHERE pe.entry_id = league_lms_picks.entry_id
      AND u.auth_user_id = (SELECT auth.uid())
      AND po.archived_at IS NULL
      AND pe.retired_at IS NULL
  ));

CREATE OR REPLACE FUNCTION public.enforce_lms_pick_before_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_season   uuid;
  v_lock     timestamptz;
  v_open     integer;
  v_out      integer;
  v_club_ok  boolean;
BEGIN
  SELECT po.league_season_id
    INTO v_season
    FROM league_lms_rounds r
    JOIN pools po ON po.pool_id = r.pool_id
   WHERE r.round_id = NEW.round_id;

  IF v_season IS NULL THEN
    RETURN NULL;
  END IF;

  -- Matchweek level, NOT fixture level. This is the difference between a
  -- Saturday picker and a Sunday picker who has already seen Saturday.
  SELECT mw.lock_at INTO v_lock
    FROM league_matchweeks mw
   WHERE mw.season_id = v_season AND mw.matchweek_number = NEW.matchweek_number;

  IF v_lock IS NOT NULL AND v_lock <= now() THEN
    RETURN NULL;
  END IF;

  -- Only the open matchweek accepts a pick, matching migration 058. Working
  -- ahead would let somebody bank twenty clubs before a ball is kicked.
  SELECT m.matchweek_number INTO v_open
    FROM league_matchweeks m
   WHERE m.season_id = v_season
     AND (m.lock_at IS NULL OR m.lock_at > now())
   ORDER BY m.matchweek_number
   LIMIT 1;

  IF v_open IS NULL OR NEW.matchweek_number <> v_open THEN
    RETURN NULL;
  END IF;

  -- Somebody already knocked out cannot keep picking. Silent, like the rest:
  -- the write path reads back and explains.
  SELECT s.eliminated_matchweek INTO v_out
    FROM league_lms_survivors s
   WHERE s.round_id = NEW.round_id AND s.entry_id = NEW.entry_id;
  IF v_out IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM league_clubs lc WHERE lc.club_id = NEW.club_id AND lc.season_id = v_season
  ) INTO v_club_ok;
  IF NOT v_club_ok THEN
    RAISE EXCEPTION 'club % is not in this pool''s season (%)', NEW.club_id, v_season;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_enforce_lms_pick_before_lock ON league_lms_picks;
CREATE TRIGGER trg_enforce_lms_pick_before_lock
  BEFORE INSERT OR UPDATE ON league_lms_picks
  FOR EACH ROW EXECUTE FUNCTION enforce_lms_pick_before_lock();
