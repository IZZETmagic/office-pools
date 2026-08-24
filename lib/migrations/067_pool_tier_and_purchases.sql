-- Migration 067: platform revenue — pool tiers, and the purchase ledger.
--
-- Phase 3a Step 1. Plan: drafts/2026-08-24_paddle_sandbox_catalog.md.
-- Sandbox catalog created 2026-08-24 (Pool Plus $19 / Max $49 / Ultra $500).
--
-- ⚠ NOT YET APPLIED ANYWHERE. Written for review. See PRE-FLIGHT below.
--
-- Numbered 067 rather than 065: 061, 062 and 065 are gaps, and 066 already
-- exists. Filling a gap below the highest applied migration makes ordering a
-- lie. Take the next number above the max, always.
--
-- ============================================================
-- WHY entry_fee IS NOT REUSED
-- ============================================================
-- MONETIZATION.md Phase 3a originally said "reuses `entry_fee` schema as
-- platform service charge". That is reversed here, deliberately.
--
-- `pools.entry_fee` + `pool_members.entry_fee_paid` is the MEMBERS' pot: money
-- that moves between players, off-platform, which the admin tracks by hand in
-- the Fees tab. We never touch it, never hold it, never settle it.
--
-- RM-08 — the risk that Paddle rejects the account under its "fantasy sports /
-- prize-based forecasting" prohibitions — turns entirely on being able to say
-- "player money never touches us". Putting OUR revenue in the same columns as
-- the players' pot destroys that sentence. One schema, two meanings, and no way
-- to answer a domain reviewer cleanly.
--
-- So platform revenue gets its own table, and the separation is the argument.
--
-- ============================================================
-- WHY pools.tier NEEDS A TRIGGER AND NOT JUST A COLUMN
-- ============================================================
-- `pools` is CLIENT-WRITABLE. mobile/components/pool-detail/SettingsTab.tsx:207
-- does a direct `supabase.from('pools').update(...)` under the admin's own
-- `authenticated` role — there is an admin UPDATE policy on `pools` in the base
-- schema, and mobile relies on it.
--
-- A plain `tier` column on that table is therefore self-grantable. One
-- PostgREST call sets tier='ultra' and the $500 venue tier is free to anyone
-- who opens devtools. An API-route check does not help: mobile does not go
-- through the API routes.
--
-- This is the same shape as the post-deadline prediction edit bug, which had to
-- be fixed with `trg_enforce_prediction_before_kickoff` for exactly this
-- reason. RLS cannot express "this column is read-only to you but that one is
-- not", so the guard is a BEFORE UPDATE trigger that silently reverts.
--
-- SILENT REVERT, NOT RAISE. Raising would break a legitimate settings save the
-- moment any client sends `tier` in its payload. Reverting means the honest
-- save succeeds untouched and the escalation attempt simply does not happen.
-- Mobile's payload is an explicit 10-column whitelist that does not include
-- `tier`, so today nothing is affected either way.
--
-- FAIL-CLOSED. The trigger allows the write only for roles on an explicit
-- allow-list. An unrecognised role reverts. Adding a role is a deliberate act.
--
-- ⚠ NOTE — `max_participants` and `max_entries_per_user` are in that same
-- client-writable payload. They are the admin's OWN caps and stay writable; an
-- admin lowering their own limit is fine. But they are therefore NOT the
-- free-tier ceiling, and tier enforcement must never be built on them. That
-- ceiling is a separate constraint, and it is Step 4 — not this migration.
--
-- ============================================================
-- WHY THE UNIQUE CONSTRAINT IS THE MOST IMPORTANT LINE HERE
-- ============================================================
-- Paddle retries webhook delivery until it gets a 2xx, and delivers at least
-- once — not exactly once. Without a uniqueness guarantee, one retried
-- `transaction.completed` credits the pool twice and books the revenue twice.
--
-- `pool_purchases_paddle_txn_key` makes the second insert fail at the database
-- rather than relying on the handler remembering to check first. Idempotency
-- that lives in application code is idempotency you will lose during a refactor.
--
-- ============================================================
-- PRE-FLIGHT — run before applying
-- ============================================================
-- 1. Confirm the role names this database actually uses, or the trigger's
--    allow-list is wrong and the guard fails closed against the webhook:
--      SELECT rolname FROM pg_roles
--       WHERE rolname IN ('service_role','postgres','supabase_admin','authenticated','anon')
--       ORDER BY rolname;
--
-- 2. Confirm nothing already selects a `tier` column off pools (it is new, so
--    this must return nothing — and a stale name here is the 2026-08-22
--    DROP COLUMN outage in reverse):
--      npx tsx scripts/verify-select-columns.ts
--
-- 3. Confirm the admin UPDATE policy on pools exists and is what we think:
--      SELECT policyname, cmd, qual FROM pg_policies
--       WHERE schemaname='public' AND tablename='pools' AND cmd='UPDATE';
--
-- SAFE TO APPLY BEFORE THE CODE DEPLOY. Purely additive: one column with a
-- default, one new table, one trigger on a column nothing writes yet. No
-- existing policy is changed and no existing read is affected.

BEGIN;

-- ============================================================ 1. pools.tier
ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free';

ALTER TABLE public.pools DROP CONSTRAINT IF EXISTS pools_tier_check;
ALTER TABLE public.pools
  ADD CONSTRAINT pools_tier_check
  CHECK (tier IN ('free', 'plus', 'max', 'ultra'));

COMMENT ON COLUMN public.pools.tier IS
  'What this pool has been paid for. ''free'' is the default and is not a purchase. '
  'DERIVED STATE, not the source of truth — pool_purchases is the ledger, this is the '
  'fast-read enforcement value, and the webhook writes both in one transaction. '
  'Not writable by authenticated clients: see trg_pools_tier_is_purchased.';

-- ============================================================ 2. The ledger
CREATE TABLE IF NOT EXISTS public.pool_purchases (
  purchase_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id               uuid NOT NULL REFERENCES pools(pool_id) ON DELETE RESTRICT,
  purchased_by          uuid          REFERENCES users(user_id) ON DELETE SET NULL,
  tier                  text NOT NULL,
  paddle_transaction_id text NOT NULL,
  paddle_customer_id    text,
  paddle_price_id       text NOT NULL,
  amount_cents          integer NOT NULL,
  currency_code         text NOT NULL DEFAULT 'USD',
  environment           text NOT NULL,
  status                text NOT NULL DEFAULT 'completed',
  purchased_at          timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pool_purchases_paddle_txn_key UNIQUE (paddle_transaction_id),
  CONSTRAINT pool_purchases_tier_ck        CHECK (tier IN ('plus', 'max', 'ultra')),
  CONSTRAINT pool_purchases_env_ck         CHECK (environment IN ('sandbox', 'live')),
  CONSTRAINT pool_purchases_status_ck      CHECK (status IN ('completed', 'refunded')),
  CONSTRAINT pool_purchases_amount_ck      CHECK (amount_cents > 0)
);

CREATE INDEX IF NOT EXISTS idx_pool_purchases_pool ON public.pool_purchases(pool_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_pool_purchases_live ON public.pool_purchases(purchased_at DESC)
  WHERE environment = 'live' AND status = 'completed';

DROP TRIGGER IF EXISTS update_pool_purchases_updated_at ON public.pool_purchases;
CREATE TRIGGER update_pool_purchases_updated_at
  BEFORE UPDATE ON public.pool_purchases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.pool_purchases IS
  'Ledger of platform charges — money the admin paid US. Deliberately separate from '
  'pools.entry_fee, which is the members'' own off-platform pot that we never touch; '
  'that separation is the RM-08 argument and must not be collapsed.';

COMMENT ON CONSTRAINT pool_purchases_paddle_txn_key ON public.pool_purchases IS
  'Webhook idempotency, enforced by the database. Paddle delivers at-least-once and '
  'retries until 2xx; without this a retried transaction.completed credits the pool '
  'and books the revenue twice.';

COMMENT ON COLUMN public.pool_purchases.environment IS
  'sandbox | live. Both flow through this table during development against the same '
  'Supabase project, so without this there is no way to tell a test purchase from real '
  'revenue. No default: the webhook must state which it is, so a bug fails loud rather '
  'than quietly booking sandbox money as income.';

COMMENT ON COLUMN public.pool_purchases.paddle_price_id IS
  'The price actually charged. Sandbox and live price IDs differ, and prices change over '
  'time — recording the ID is what makes a purchase reconcilable against Paddle later. '
  'Do NOT map price_id back to a tier in code: read custom_data.tier from the webhook.';

COMMENT ON COLUMN public.pool_purchases.amount_cents IS
  'What Paddle actually charged, in the lowest denomination. Recorded from the webhook '
  'payload, never assumed from our own price table — the two can disagree, and Paddle wins.';

COMMENT ON COLUMN public.pool_purchases.pool_id IS
  'ON DELETE RESTRICT, not CASCADE: a financial record must survive whatever happens to '
  'the pool. Pools are archived rather than deleted (040/041) so this blocks nothing today, '
  'and acts as a backstop if a delete path ever returns.';

-- ============================================================ 3. Tier guard
-- See "WHY pools.tier NEEDS A TRIGGER" above. Note the absence of SECURITY
-- DEFINER: this must run as the CALLING role so `current_user` is the
-- PostgREST-assigned role ('authenticated' / 'anon'). SECURITY DEFINER would
-- report the function owner instead and the guard would never fire.
CREATE OR REPLACE FUNCTION public.enforce_pool_tier_is_purchased()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tier IS DISTINCT FROM OLD.tier
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin')
  THEN
    NEW.tier := OLD.tier;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_pool_tier_is_purchased() IS
  'A paid tier is granted by the Paddle webhook (service_role) or by support (postgres), '
  'never by the client. Silently reverts any other role''s attempt to change pools.tier '
  'so an honest settings save still succeeds. Fail-closed: an unrecognised role reverts.';

DROP TRIGGER IF EXISTS trg_pools_tier_is_purchased ON public.pools;
CREATE TRIGGER trg_pools_tier_is_purchased
  BEFORE UPDATE OF tier ON public.pools
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pool_tier_is_purchased();

-- ============================================================ 4. RLS
ALTER TABLE public.pool_purchases ENABLE ROW LEVEL SECURITY;

-- Read: an admin can see what their own pool was charged. Members cannot —
-- what the admin paid the platform is not the pool's business.
DROP POLICY IF EXISTS "Pool admins can view their pool purchases" ON public.pool_purchases;
CREATE POLICY "Pool admins can view their pool purchases" ON public.pool_purchases
  FOR SELECT TO authenticated
  USING (is_pool_admin(pool_id));

-- Write: NO POLICY, DELIBERATELY. There is no INSERT, UPDATE or DELETE policy
-- on this table for any client role. The only writer is the Paddle webhook via
-- service_role, which bypasses RLS. A client that could insert here could grant
-- itself a tier and fabricate a revenue record in the same statement.
--
-- If you ever find yourself adding a client write policy here, the design is
-- wrong — route it through the webhook.

COMMIT;

-- ROLLBACK -----------------------------------------------------------------
-- Only safe once no deployed code selects pools.tier or reads pool_purchases.
-- Run `npx tsx scripts/verify-select-columns.ts` first.
-- BEGIN;
-- DROP TRIGGER  IF EXISTS trg_pools_tier_is_purchased ON public.pools;
-- DROP FUNCTION IF EXISTS public.enforce_pool_tier_is_purchased();
-- DROP POLICY   IF EXISTS "Pool admins can view their pool purchases" ON public.pool_purchases;
-- DROP TABLE    IF EXISTS public.pool_purchases;   -- destroys the revenue ledger. Export first.
-- ALTER TABLE   public.pools DROP CONSTRAINT IF EXISTS pools_tier_check;
-- ALTER TABLE   public.pools DROP COLUMN IF EXISTS tier;
-- COMMIT;
