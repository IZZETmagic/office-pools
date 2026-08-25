-- Migration 072: the claim hands back which matchweek an event is about.
--
-- The return type gains a column, and PostgreSQL will not CREATE OR REPLACE a
-- function whose OUT columns change — so this drops and recreates. Safe: the
-- only caller is app/api/cron/league-outbox/route.ts, nothing is mid-flight
-- (the outbox is empty), and a claim is retried on the next tick anyway.
--
-- Body is otherwise migration 062's verbatim.

DROP FUNCTION IF EXISTS public.league_claim_score_events(int, interval);

CREATE FUNCTION public.league_claim_score_events(
  p_limit int DEFAULT 100,
  p_stale_after interval DEFAULT interval '5 minutes'
)
RETURNS TABLE (
  event_id bigint,
  pool_id uuid,
  fixture_id uuid,
  matchweek_id uuid,
  kind text,
  attempts int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT e.event_id
      FROM league_score_events e
     WHERE e.processed_at IS NULL
       AND (e.claimed_at IS NULL OR e.claimed_at < now() - p_stale_after)
     ORDER BY e.created_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE league_score_events e
     SET claimed_at = now(),
         attempts   = e.attempts + 1
    FROM claimable c
   WHERE e.event_id = c.event_id
  RETURNING e.event_id, e.pool_id, e.fixture_id, e.matchweek_id, e.kind, e.attempts;
END;
$fn$;

COMMENT ON FUNCTION public.league_claim_score_events(int, interval) IS
  'Outbox claim. FOR UPDATE SKIP LOCKED so overlapping cron runs cannot claim '
  'the same rows; re-claims anything stuck claimed longer than p_stale_after so '
  'a died-mid-process row is retried rather than stranded. Oldest first. '
  'Exactly one of fixture_id / matchweek_id is set — the consumer switches on it.';

REVOKE EXECUTE ON FUNCTION public.league_claim_score_events(int, interval) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_claim_score_events(int, interval) TO service_role;
