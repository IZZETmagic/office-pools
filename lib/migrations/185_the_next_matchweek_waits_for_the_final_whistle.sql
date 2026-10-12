-- =============================================================
-- 185 — THE NEXT MATCHWEEK IS ANNOUNCED WHEN THIS ONE'S GAMES ARE OVER
-- =============================================================
-- Ryan, 2026-10-10, with a lock screen of seven "Matchweek 7 is open" and
-- "Matchweek 7: pick your club" notices: "These notifications shouldn't be sent
-- until the current match week ends."
--
-- ## What happened
--
-- A matchweek OPENS the moment the one before it locks — an hour before that
-- one's first kickoff (migrations 058/101). The
-- hourly league-notices job announced it on its next tick. Premier League
-- matchweek 6 locked at 10:30 UTC on Saturday 10 Oct; at 11:00 the job queued
-- `matchweek_opened` for six pools and `lms_pick_open` for 13 players — before a
-- ball had been kicked in matchweek 6. For the whole weekend the phone was
-- talking about next week while this week was being played.
--
-- ## What changes — the ANNOUNCEMENT, not the opening
--
-- The matchweek still opens for picks at the lock, exactly as before; anybody in
-- the app can pick early. Only the notice waits, until the matchweek being
-- played is over:
--
--   every one of its games that kicks off before the next deadline has finished,
--   been postponed or been cancelled.
--
-- Two allowances, each so that a fact we do not control cannot swallow the
-- notice:
--   · a game the feed never closes counts as over 3 hours after kickoff — a PL
--     game is ~1h55m whistle to whistle, so 3h leaves room for a late start;
--   · a game rearranged past the next deadline does not hold it.
--
-- Measured on the real 2026/27 PL fixture list: a normal weekend is announced on
-- Monday night after the last game, ~93 hours before the Saturday lock. The
-- tightest gap in the season is Christmas, ~45 hours.
--
-- ## The reminders keep their clock
--
-- `lock_reminder` (a day before, and the last call) and `lms_pick_reminder` are
-- about the DEADLINE, and in Last Man Standing a missed pick knocks you out. They
-- are not held. If the games being played ever ran into the next matchweek's
-- last 24 hours, the open notice is not sent at all and the day-before reminder
-- is the one message — never "you haven't picked" followed by "it's open".
-- Last Man Standing already works that way (lib/league/lmsNotices.ts, windowFor:
-- the most urgent notice that applies); this gives pick'em and Showdown the same.
--
-- ## One definition
--
-- `league_in_play_is_over(season)` is called by this producer and by the Last
-- Man Standing producer in TypeScript (queueLeagueReminders). "The matchweek
-- being played" is the LAST ONE TO LOCK, by lock time, not number — the same
-- matchweek inPlayMatchweekId() in lib/league/read.ts shows as in play.
--
-- ## The disclosure gate
--
--   "When a matchweek's games are over, we tell you the next one is open."
--   -> passes. The sentences under both switches say it (registry rows below).
--
-- =============================================================
-- BEFORE YOU RUN THIS — the producer is REPLACED
-- =============================================================
--   SELECT md5(prosrc), length(prosrc) FROM pg_proc
--    WHERE proname = 'league_queue_matchweek_notices';
--
-- Read 2026-10-10: 73c73feb1ae23781861db3b2ddf6b312 / 3196 — 108's logic with
-- its comments trimmed when it was applied. Two CTE blocks, `opened` then
-- `reminded`, each with `league_mode IN ('pickem','showdown')`. Everything below
-- is that function plus two predicates in the `opened` block's `due`.
-- =============================================================

CREATE OR REPLACE FUNCTION public.league_in_play_is_over(p_season_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  WITH in_play AS (
    -- The last matchweek to have locked, by lock time — as inPlayMatchweekId().
    SELECT m.matchweek_id
      FROM league_matchweeks m
     WHERE m.season_id = p_season_id
       AND m.lock_at <= now()
     ORDER BY m.lock_at DESC, m.matchweek_number DESC
     LIMIT 1
  ),
  next_lock AS (
    SELECT m.lock_at
      FROM league_matchweeks m
     WHERE m.matchweek_id = league_open_matchweek(p_season_id)
  )
  SELECT NOT EXISTS (
    SELECT 1
      FROM league_fixtures f
      JOIN in_play p ON p.matchweek_id = f.matchweek_id
     WHERE f.is_completed IS NOT TRUE
       AND f.status NOT IN ('postponed', 'cancelled')
       -- A result the feed never sends must not hold the notice for ever.
       AND f.kickoff_at > now() - interval '3 hours'
       -- A game moved past the next deadline is not this weekend's football.
       AND f.kickoff_at < COALESCE((SELECT lock_at FROM next_lock), 'infinity'::timestamptz)
  );
$fn$;

COMMENT ON FUNCTION public.league_in_play_is_over(uuid) IS
  'Migration 185. True when the matchweek being played (the last to lock, by lock time) has no game '
  'still to come before the next deadline: each is completed, postponed, cancelled, or kicked off more '
  'than 3 hours ago. The open-matchweek notices wait for it — league_queue_matchweek_notices and '
  'queueLeagueReminders (lib/league/lmsNotices.ts). True when nothing has locked yet.';

REVOKE EXECUTE ON FUNCTION public.league_in_play_is_over(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_in_play_is_over(uuid) TO service_role;

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
       -- NEW IN 185. Not while the matchweek before it is still being played.
       AND league_in_play_is_over(o.season_id)
       -- NEW IN 185. Not once the day-before reminder's window has begun: from
       -- then the reminder is the one message. Left unstamped — nothing was
       -- announced — and once the matchweek locks it is no longer the open one.
       AND (m.lock_at IS NULL OR m.lock_at > now() + p_reminder_window)
  ),
  queued AS (
    INSERT INTO league_score_events (pool_id, matchweek_id, kind)
    SELECT po.pool_id, d.matchweek_id, 'matchweek_opened'
      FROM due d
      JOIN pools po ON po.league_season_id = d.season_id AND po.archived_at IS NULL
     -- 108. "Matchweek 5 is open — 10 games to predict" is false in a mode with
     -- no fixture picks.
     WHERE po.league_mode IN ('pickem', 'showdown')
    ON CONFLICT DO NOTHING
    RETURNING 1
  ),
  stamped AS (
    -- ⚠ Stamped per MATCHWEEK, not per pool: a season containing only Table
    -- pools still stamps and moves on rather than retrying the same matchweek
    -- every hour for ever.
    UPDATE league_matchweeks m SET open_notified_at = now(), updated_at = now()
      FROM due d WHERE m.matchweek_id = d.matchweek_id
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM queued) INTO v_opened;

  -- LOCK REMINDER. Same shape, gated on the lock being close — and NOT on the
  -- matchweek being played (185): it is about the deadline. WHO receives it is
  -- decided by the consumer, because "has not picked yet" is a per-member fact
  -- and this row is per pool.
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
     -- 108. The consumer decides who to chase by reading league_predictions; a
     -- table entry and an LMS entry both have zero rows there, so EVERY member
     -- reads as unpicked and no action they take can clear it.
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
  'Queues matchweek_opened and lock_reminder outbox events for pools in modes whose picks live in league_predictions — pickem and showdown ONLY (migration 108). matchweek_opened waits until the matchweek being played is over (league_in_play_is_over) and is not sent inside the reminder window (migration 185); lock_reminder keeps its clock. p_season_id NULL means every season (the cron). Once-only per matchweek via open_notified_at / lock_reminder_sent_at. Skips archived pools. WHO gets the reminder is the consumer''s job.';

-- ---------------------------------------------------- what the switches say
--
-- The sentences under the Predictions switch, for the two notices whose timing
-- changed. Everything else on each row is 181's, unchanged.

insert into public.notification_types
  (type_key, category, modes, channels, is_transactional, expires, expiry_window, status, disclosure_sentence)
values
-- registry rows: begin
  ('matchweek_opened', 'PREDICTIONS', '{pickem,showdown}', '{email,push}', false, 'at_deadline', null, 'live', 'When a matchweek''s games are over, we''ll let you know the next one is open, so you can pick before it locks.'),
  ('lms_pick_open', 'PREDICTIONS', '{last_man_standing}', '{email,push}', false, 'at_deadline', null, 'live', 'While you''re still in, once a matchweek''s games are over we''ll let you know your next pick is open, with the clubs you''ve already used.')
-- registry rows: end
on conflict (type_key) do update set
  category = excluded.category,
  modes = excluded.modes,
  channels = excluded.channels,
  is_transactional = excluded.is_transactional,
  expires = excluded.expires,
  expiry_window = excluded.expiry_window,
  status = excluded.status,
  disclosure_sentence = excluded.disclosure_sentence;
