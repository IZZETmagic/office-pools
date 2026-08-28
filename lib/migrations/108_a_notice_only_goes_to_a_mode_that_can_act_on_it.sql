-- =============================================================
-- 108 — A NOTICE ONLY GOES TO A MODE THAT CAN ACT ON IT
-- =============================================================
-- Found while answering a narrower question: "what crons does Predict the Table
-- need?" The answer is `league-notices` plus `league-outbox` — and scheduling
-- them today would have been the wrong thing to do, because the matchweek
-- producer does not know what mode a pool is.
--
-- ## What it does now
--
-- `league_queue_matchweek_notices` (migrations 073/074) queues two kinds,
-- `matchweek_opened` and `lock_reminder`, against every pool in the season:
--
--   JOIN pools po ON po.league_season_id = d.season_id AND po.archived_at IS NULL
--
-- No `league_mode` predicate. None of the three consumers adds one either — they
-- check `archived_at` and nothing else. When Decision 9's four modes were built
-- on top of migration 073, the producer was never revisited.
--
-- ## Who gets hurt
--
-- TABLE MODE. One ordering of twenty clubs, made once, before the season. It has
-- no weekly picks at all. As it stands it would receive, for thirty-eight weeks:
--
--   matchweek_opened  "Matchweek 5 is open — 10 games to predict"
--                     There are no games to predict in this mode.
--
--   lock_reminder     "You haven't picked yet."
--                     Worse, because of HOW the consumer decides who to chase:
--                     `notifyLockReminder` reads `league_predictions` for the
--                     pool's entries. A table entry has ZERO rows there by
--                     design — the ordering lives in `league_table_predictions`.
--                     So every member reads as not-yet-picked, every week, and
--                     the condition can never be satisfied by doing anything.
--
-- LAST MAN STANDING, identically and for the same reason. Its weekly decision is
-- real — pick one club to win — but it is stored in `league_lms_picks`, so
-- `league_predictions` is empty there too and every member is chased weekly.
--
-- This is a live example of the pattern already recorded twice in the programme:
-- when a mode is added, ask what it does with the machinery that predates it.
-- Both these kinds predate three of the four modes.
--
-- ## The fix, and why it is an ALLOWLIST
--
-- The predicate names the modes whose picks actually live in
-- `league_predictions`, which is the table the consumers read:
--
--   pickem      fixture picks        -> league_predictions   ✓
--   showdown    fixture picks        -> league_predictions   ✓
--   table       one ordering         -> league_table_predictions
--   lms         one club per week    -> league_lms_picks
--
-- Written as `IN ('pickem','showdown')` rather than `<> 'table'`. A denylist
-- means the NEXT mode inherits these notices silently and wrongly, which is
-- exactly how this bug arrived; an allowlist means it inherits nothing until
-- somebody decides it should. The failure mode of the allowlist is silence,
-- which is recoverable; the failure of the denylist is a wrong message to a real
-- person, which is not.
--
-- ⚠ WHAT THIS DOES NOT FIX — Last Man Standing is now silent, not correct.
-- It has a genuine weekly decision and, after this, no weekly reminder at all.
-- That is a deliberate trade: a missing notice is a gap, a wrong one is a
-- defect, and the gap can be closed without apologising to anybody. Closing it
-- properly means a `lms_pick_reminder` kind whose consumer reads
-- `league_lms_picks`, which is its own piece of work and NOT smuggled in here.
--
-- ⚠ Table mode's own reminder is unaffected. `league_queue_table_deadline_notices`
-- (migration 099) already filters `league_mode = 'table'`, and
-- `notifyTableDeadline` re-checks it at send time. That one was written after
-- the modes existed, which is why it got this right.
--
-- =============================================================
-- BEFORE YOU RUN THIS — the function is REPLACED
-- =============================================================
--   SELECT prosrc FROM pg_proc WHERE proname = 'league_queue_matchweek_notices';
--
-- Expect 073/074's, and nothing else: two CTE blocks, `opened` then `reminded`,
-- with no `league_mode` anywhere. Everything below is that function verbatim
-- plus one predicate in each of the two INSERT joins.
-- =============================================================

CREATE OR REPLACE FUNCTION public.league_queue_matchweek_notices(
  p_season_id       uuid DEFAULT NULL,
  p_reminder_window interval DEFAULT interval '24 hours'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_opened   int := 0;
  v_reminded int := 0;
BEGIN
  -- OPENED. One row per pool playing the season whose open matchweek has not
  -- been announced. `open_notified_at` is the once-only guard and is stamped in
  -- the same statement, so a second run in the same minute queues nothing.
  WITH open_mw AS (
    SELECT s.season_id, league_open_matchweek(s.season_id) AS matchweek_id
      FROM league_seasons s
     WHERE p_season_id IS NULL OR s.season_id = p_season_id
  ),
  due AS (
    SELECT o.season_id, o.matchweek_id
      FROM open_mw o
      JOIN league_matchweeks m ON m.matchweek_id = o.matchweek_id
     WHERE o.matchweek_id IS NOT NULL
       AND m.open_notified_at IS NULL
  ),
  queued AS (
    INSERT INTO league_score_events (pool_id, matchweek_id, kind)
    SELECT po.pool_id, d.matchweek_id, 'matchweek_opened'
      FROM due d
      JOIN pools po ON po.league_season_id = d.season_id AND po.archived_at IS NULL
     -- NEW IN 108. See the header: "Matchweek 5 is open — 10 games to predict"
     -- is false in a mode with no fixture picks.
     WHERE po.league_mode IN ('pickem', 'showdown')
    ON CONFLICT DO NOTHING
    RETURNING 1
  ),
  stamped AS (
    -- ⚠ Stamped per MATCHWEEK, not per pool, and therefore unchanged: the
    -- matchweek was announced to everyone it should be announced to, and a
    -- season containing only Table pools still stamps and moves on rather than
    -- retrying the same matchweek every hour for ever.
    UPDATE league_matchweeks m SET open_notified_at = now(), updated_at = now()
      FROM due d WHERE m.matchweek_id = d.matchweek_id
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM queued) INTO v_opened;

  -- LOCK REMINDER. Same shape, gated on the lock being close. WHO receives it
  -- is decided by the consumer, because "has not picked yet" is a per-member
  -- fact and this row is per pool.
  WITH open_mw AS (
    SELECT s.season_id, league_open_matchweek(s.season_id) AS matchweek_id
      FROM league_seasons s
     WHERE p_season_id IS NULL OR s.season_id = p_season_id
  ),
  due AS (
    SELECT o.season_id, o.matchweek_id
      FROM open_mw o
      JOIN league_matchweeks m ON m.matchweek_id = o.matchweek_id
     WHERE o.matchweek_id IS NOT NULL
       AND m.lock_reminder_sent_at IS NULL
       AND m.lock_at IS NOT NULL
       AND m.lock_at <= now() + p_reminder_window
  ),
  queued AS (
    INSERT INTO league_score_events (pool_id, matchweek_id, kind)
    SELECT po.pool_id, d.matchweek_id, 'lock_reminder'
      FROM due d
      JOIN pools po ON po.league_season_id = d.season_id AND po.archived_at IS NULL
     -- NEW IN 108, and the more important of the two. `notifyLockReminder`
     -- decides who to chase by reading `league_predictions`; a table entry and
     -- an LMS entry both have zero rows there, so EVERY member reads as
     -- unpicked and no action they take can clear it.
     WHERE po.league_mode IN ('pickem', 'showdown')
    ON CONFLICT DO NOTHING
    RETURNING 1
  ),
  stamped AS (
    UPDATE league_matchweeks m SET lock_reminder_sent_at = now(), updated_at = now()
      FROM due d WHERE m.matchweek_id = d.matchweek_id
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM queued) INTO v_reminded;

  RETURN jsonb_build_object('opened', v_opened, 'reminded', v_reminded);
END;
$fn$;

COMMENT ON FUNCTION public.league_queue_matchweek_notices(uuid, interval) IS
  'Queues matchweek_opened and lock_reminder outbox events for pools in modes whose picks live in league_predictions — pickem and showdown ONLY (migration 108). An ALLOWLIST: a mode added later inherits no notices until someone decides it should, because the consumers read league_predictions and a table or LMS entry has no rows there. p_season_id NULL means every season (the cron). Once-only per matchweek via open_notified_at / lock_reminder_sent_at. Skips archived pools. WHO gets the reminder is the consumer''s job.';

-- ---------------------------------------------------- the consumers agree
--
-- Belt and braces, and not redundant: the producer decides who is QUEUED, but a
-- row can already be sitting in the outbox from before this migration, and the
-- consumers are also reachable by hand from the super-admin surface. A send-time
-- re-check is the same posture `notifyTableDeadline` already takes.
--
-- Enforced in TypeScript rather than here — lib/league/notify.ts — because the
-- consumers are TypeScript. This comment exists so the two halves are findable
-- from each other.
