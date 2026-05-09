-- Migration: subscription_periods
-- Tracks per-period billing arrangements for external SaaS subscriptions
-- (API-Football, Resend, etc.). Each row = one continuous plan/cost window.
-- The displayed total per provider is the sum across rows.
-- Safe to run multiple times.

-- ============================================================
-- 1. subscription_periods
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_periods (
  period_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider           TEXT NOT NULL,
  plan_name          TEXT NOT NULL,
  monthly_cost_cents INTEGER NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'USD',
  start_date         DATE NOT NULL,
  ended_at           DATE,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE subscription_periods
    ADD CONSTRAINT subscription_periods_cost_nonneg_check
    CHECK (monthly_cost_cents >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE subscription_periods
    ADD CONSTRAINT subscription_periods_currency_format_check
    CHECK (currency ~ '^[A-Z]{3}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE subscription_periods
    ADD CONSTRAINT subscription_periods_dates_order_check
    CHECK (ended_at IS NULL OR ended_at >= start_date);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_subscription_periods_provider_started
  ON subscription_periods(provider, start_date DESC);

-- ============================================================
-- 3. RLS — super admins only
-- ============================================================
ALTER TABLE subscription_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_periods_super_admin_all ON subscription_periods;
CREATE POLICY subscription_periods_super_admin_all ON subscription_periods
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND is_super_admin = TRUE
    )
  );

-- ============================================================
-- 4. Seed initial rows (only if empty)
-- ============================================================
-- Start dates inferred from git history — first commit touching each integration.
-- Adjust plan_name + monthly_cost_cents in the Subscriptions tab UI.
INSERT INTO subscription_periods (provider, plan_name, monthly_cost_cents, currency, start_date, notes)
SELECT 'api-football', 'Free', 0, 'USD', DATE '2026-05-09', 'Fixtures + live scores (api-football.com)'
WHERE NOT EXISTS (SELECT 1 FROM subscription_periods WHERE provider = 'api-football');

INSERT INTO subscription_periods (provider, plan_name, monthly_cost_cents, currency, start_date, notes)
SELECT 'resend', 'Free', 0, 'USD', DATE '2026-02-27', 'Transactional + broadcast email (resend.com)'
WHERE NOT EXISTS (SELECT 1 FROM subscription_periods WHERE provider = 'resend');

-- ============================================================
-- Down-migration (rollback)
-- ============================================================
-- DROP POLICY IF EXISTS subscription_periods_super_admin_all ON subscription_periods;
-- DROP INDEX IF EXISTS idx_subscription_periods_provider_started;
-- DROP TABLE IF EXISTS subscription_periods;
