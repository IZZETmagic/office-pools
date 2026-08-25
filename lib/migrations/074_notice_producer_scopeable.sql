-- Migration 074: the notice producer can be scoped to one season.
--
-- ⚠ Written because it bit immediately. The 073 version scanned EVERY season
-- with no way to narrow it, so the first run of scripts/verify-league-notices.ts
-- — against a scratch season — also queued real `matchweek_opened` events for
-- both production pools and stamped `open_notified_at` on the real season's
-- matchweek 2.
--
-- Nothing was sent (no consumer handles those kinds yet and no cron is
-- scheduled) and it was fully reversed, but the shape of the mistake is the
-- point: a producer that can only run globally cannot be exercised safely, so
-- it either goes untested or it touches real members. Neither is acceptable for
-- something whose entire job is emailing people.
--
-- `p_season_id` NULL keeps the production behaviour — every season — so the
-- cron calls it with no arguments. Passing a season narrows it, which is what
-- the verification script does, and what an operator would want when re-running
-- notices for one competition without touching the others.
--
-- DROP then CREATE rather than REPLACE: adding a parameter creates a second
-- overload rather than replacing the first, and two functions of the same name
-- differing only in arity is exactly the ambiguity that produces a call landing
-- somewhere nobody intended.

DROP FUNCTION IF EXISTS public.league_queue_matchweek_notices(interval);

CREATE FUNCTION public.league_queue_matchweek_notices(
  p_season_id uuid DEFAULT NULL,
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
    ON CONFLICT DO NOTHING
    RETURNING 1
  ),
  stamped AS (
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
  'Queues matchweek_opened and lock_reminder outbox events. p_season_id NULL '
  'means every season (the cron); pass one to scope it, which is how it is '
  'tested without touching real members. Once-only per matchweek via '
  'open_notified_at / lock_reminder_sent_at, stamped in the same statement that '
  'queues. Skips archived pools. WHO gets the reminder is the consumer''s job.';

REVOKE EXECUTE ON FUNCTION public.league_queue_matchweek_notices(uuid, interval) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_queue_matchweek_notices(uuid, interval) TO service_role;
