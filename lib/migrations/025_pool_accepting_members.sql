-- 025_pool_accepting_members.sql
-- Applied to prod 2026-07-25 (Supabase migration: pool_accepting_members).
-- Deploy 1 of 3. See drafts/2026-07-25_pool_status_display_audit.md.
--
-- Post-apply state: 623 pools, all accepting_members = true; status unchanged
-- at 610 open / 13 completed; 0 rows had status = 'closed', so the backfill
-- below was a verified no-op in prod.
--
-- ⚠ The application code that WRITES this column is not deployed yet
-- (branch pool-status-accepting-members). Prod code is unaffected: the column
-- is additive with a default, so existing select('*') reads just gain a field.
--
-- `pools.status` currently conflates two orthogonal concepts, as its own admin
-- copy admits:
--   open      "Accepting new members"   -> join-ability
--   closed    "No new members"          -> join-ability
--   completed "Tournament finished"     -> lifecycle
--
-- Because they share one column they are forced mutually exclusive, which also
-- produced a latent bug: every dashboard filters `status IN ('open','active')`
-- (app/dashboard/page.tsx, mobile/lib/useHomeData.ts, app/pools/page.tsx), so
-- marking a pool `closed` silently removed it from members' dashboards AND from
-- their totalPoints/bestRank aggregates. Prod has 0 `closed` rows, so the bug
-- has never fired — but the button is live in web admin, mobile admin, and
-- super admin.
--
-- This migration extracts join-ability into its own boolean. `status` is left
-- free-form here on purpose: the CHECK constraint that forbids 'closed' lands
-- in 025b, AFTER the application code stops writing it, so old and new code can
-- coexist during the rollout.
--
-- Additive + idempotent. Safe to land on its own.

-- 1. Join-ability as its own axis. DEFAULT true means every existing pool is
--    already correct; only the `closed` rows below need touching.
ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS accepting_members boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pools.accepting_members IS
  'Whether the pool accepts new members. Independent of status (lifecycle). '
  'Was formerly encoded as status = ''closed''.';

-- 2. Carry the old meaning across. Order matters: record join-ability BEFORE
--    rewriting the status it was encoded in. Both statements are naturally
--    idempotent (after the first run no ''closed'' rows remain).
--    Prod: 0 rows. Non-zero in other environments is expected and fine.
UPDATE public.pools SET accepting_members = false WHERE status = 'closed';
UPDATE public.pools SET status = 'open'          WHERE status = 'closed';

-- Rollback:
--   UPDATE public.pools SET status = 'closed' WHERE NOT accepting_members;
--   ALTER TABLE public.pools DROP COLUMN IF EXISTS accepting_members;
