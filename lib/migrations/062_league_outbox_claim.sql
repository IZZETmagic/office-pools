-- Migration 062: the outbox gets a drain.
--
-- Plan: drafts/2026-08-24_league_pools_full_plan.md §4 L-B — "a consumer
-- (Vercel cron, claim -> process -> mark)". 059 gave `league_score_events` a
-- producer; until now nothing took work off it.
--
-- ============================================================
-- WHY AN RPC AND NOT A POSTGREST UPDATE
-- ============================================================
-- Claiming has to be atomic against a second worker. `FOR UPDATE SKIP LOCKED`
-- is the whole mechanism and PostgREST cannot express it, so two overlapping
-- cron runs would otherwise claim the same rows and do the same work twice.
-- Every fan-out downstream is idempotent, so duplicated work is not corruption
-- — but it is wasted, and at kickoff wasted work is the thing this product has
-- historically paid for.
--
-- ============================================================
-- STALE CLAIMS
-- ============================================================
-- A run that dies mid-process leaves `claimed_at` set and `processed_at` NULL
-- forever, and that row would never be retried. Anything claimed longer than
-- `p_stale_after` ago is therefore claimable again. `attempts` counts every
-- claim, so a row that keeps failing is visible rather than silently looping.
--
-- Ordered by `created_at` so the queue drains oldest-first: a member's scoring
-- notification should not overtake the one before it.
--
-- Consumer: app/api/cron/league-outbox/route.ts

CREATE OR REPLACE FUNCTION public.league_claim_score_events(
  p_limit int DEFAULT 100,
  p_stale_after interval DEFAULT interval '5 minutes'
)
RETURNS TABLE (event_id bigint, pool_id uuid, fixture_id uuid, kind text, attempts int)
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
  RETURNING e.event_id, e.pool_id, e.fixture_id, e.kind, e.attempts;
END;
$fn$;

COMMENT ON FUNCTION public.league_claim_score_events(int, interval) IS
  'Outbox claim. FOR UPDATE SKIP LOCKED so overlapping cron runs cannot claim '
  'the same rows; re-claims anything stuck claimed longer than p_stale_after so '
  'a died-mid-process row is retried rather than stranded. Oldest first.';

REVOKE EXECUTE ON FUNCTION public.league_claim_score_events(int, interval) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_claim_score_events(int, interval) TO service_role;
