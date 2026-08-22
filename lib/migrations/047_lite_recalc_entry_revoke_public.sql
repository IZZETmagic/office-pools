-- Migration 047: close anonymous access to lite_recalc_entry
--
-- SECURITY FIX. Nothing to do with the league work — surfaced by it.
--
-- ============================================================
-- THE FINDING
-- ============================================================
-- Verified against production 2026-08-16:
--
--   proname            | lite_recalc_entry
--   prosecdef          | true                    <- runs as `postgres`
--   proacl             | =X/postgres             <- PUBLIC
--                      | anon=X/postgres         <- UNAUTHENTICATED
--                      | authenticated=X/postgres
--                      | service_role=X/postgres
--   references auth.uid()      | false
--   any authz check or RAISE   | false
--
-- So an UNAUTHENTICATED caller can invoke it over PostgREST RPC with an
-- arbitrary `p_pool_id` and cause privileged writes to
-- `pool_entries.scored_total_points`, `current_rank` and `last_rank_update`
-- for every entry in any pool. It runs as the function owner, so RLS on
-- `pool_entries` does not apply to what it writes.
--
-- It does not let a caller *choose* values — it recomputes from
-- `match_scores` / bonuses / `point_adjustment`. The exposure is unauthorised
-- privileged writes, rank churn, write amplification against the largest pools
-- (192 entries), and stamping `last_rank_update`, which the every-minute
-- analytics sweep keys off.
--
-- ============================================================
-- WHY THIS MIGRATION IS ONLY HALF THE FIX
-- ============================================================
-- The complete fix is two parts:
--
--   1. Remove PUBLIC and anon.                        <- THIS MIGRATION
--   2. Add an authorization check inside the body, so an authenticated user
--      cannot re-rank a pool they are not an admin of.   <- 048, DELIBERATELY NOT HERE
--
-- Part 2 is held back because it requires REPLACING the body of a live
-- SECURITY DEFINER function, and the guard would depend on `auth.uid()`
-- resolving correctly through PostgREST → SECURITY DEFINER on this project.
-- That has NOT been verified yet. This codebase has now shipped four separate
-- instances of "a guard reads something its context does not carry"; writing a
-- fifth blind, into a function two production surfaces call, is not a trade
-- worth making for the residual risk.
--
-- Part 1 removes the sharp edge — the unauthenticated internet — and cannot
-- break anything (see below). Part 2 lands once `auth.uid()` is verified in
-- this exact path.
--
-- ============================================================
-- WHY THIS CANNOT BREAK THE ADMIN ADJUST FLOW
-- ============================================================
-- Both call sites run as `authenticated`, which keeps its grant:
--
--   app/pools/[pool_id]/admin/MembersTab.tsx:412
--   mobile/components/pool-detail/AdjustPointsSheet.tsx:162
--
-- Both also UPDATE `pool_entries` directly with the user's own client BEFORE
-- calling this RPC, so the actual authorization for a point adjustment is
-- already enforced by RLS on `pool_entries` — not by this function.
--
-- And both tolerate an RPC failure: the web call ignores the result entirely,
-- and mobile logs a warning and continues ("the adjustment landed, just the
-- rank may be stale"). Mobile matters here because it can only be changed by
-- an OTA, not a web deploy.
--
-- Idempotent; safe to re-run.

-- Fail loudly rather than silently no-op if the signature ever changes.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'lite_recalc_entry'
      AND pg_get_function_identity_arguments(p.oid) = 'p_entry_id uuid, p_pool_id uuid'
  ) THEN
    RAISE EXCEPTION
      'Migration 047: public.lite_recalc_entry(uuid, uuid) not found with the expected signature — check pg_get_function_identity_arguments before revoking.';
  END IF;
END $guard$;

REVOKE EXECUTE ON FUNCTION public.lite_recalc_entry(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lite_recalc_entry(uuid, uuid) FROM anon;

-- `authenticated` and `service_role` keep EXECUTE — both call sites need it.
GRANT EXECUTE ON FUNCTION public.lite_recalc_entry(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lite_recalc_entry(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.lite_recalc_entry(uuid, uuid) IS
  'Recomputes scored_total_points and re-ranks one pool after an admin point adjustment. SECURITY DEFINER. EXECUTE revoked from PUBLIC and anon by migration 047 — it was callable unauthenticated. ⚠ STILL MISSING an in-body authorization check: any authenticated user can re-rank any pool by id. See migration 048, which is blocked on verifying auth.uid() through PostgREST -> SECURITY DEFINER on this project.';

-- ============================================================
-- Verification
-- ============================================================
-- Expect proacl to contain postgres, authenticated and service_role only —
-- no bare `=X/postgres` (PUBLIC) and no `anon=X`:
--
--   SELECT array_to_string(proacl, ' | ')
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'lite_recalc_entry';
--
-- ============================================================
-- Rollback
-- ============================================================
-- GRANT EXECUTE ON FUNCTION public.lite_recalc_entry(uuid, uuid) TO PUBLIC;
-- (Restoring anon specifically is not required — PUBLIC covers it.)
-- Only do this if an unauthenticated caller turns out to be legitimate, which
-- would itself be the bug.
