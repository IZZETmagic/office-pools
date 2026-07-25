-- 025b_pool_status_check.sql
-- Applied to prod 2026-07-25 (Supabase migration: pool_status_check).
-- Deploy 3 of 3, run after the code went live on master 5d599f0.
-- See drafts/2026-07-25_pool_status_display_audit.md.
--
-- Pre-flight returned zero rows. Post-apply: 623 pools (610 open / 13
-- completed), 0 non-conforming. Guard verified live by attempting an
-- `UPDATE ... SET status='archived'` inside a self-rolling-back DO block —
-- the CHECK rejected it and no row was mutated.
--
-- The `join_deadline` drop below was deliberately NOT applied.
--
-- The contract half of the expand/contract. Once no code writes 'closed'
-- (or the never-written 'active' / 'upcoming' / phantom 'archived'), constrain
-- the column so a stray write fails loudly instead of silently minting another
-- phantom value.
--
-- The absence of this constraint is exactly how the mobile Pools filter came to
-- offer an "Archived" option that can never match a row: nothing rejected the
-- value, so nothing surfaced the mistake.
--
-- PRE-FLIGHT — this must return zero rows, or the ALTER will fail:
--   SELECT status, COUNT(*) FROM public.pools
--   WHERE status IS NULL OR status NOT IN ('open','completed')
--   GROUP BY status;

ALTER TABLE public.pools DROP CONSTRAINT IF EXISTS pools_status_check;
ALTER TABLE public.pools
  ADD CONSTRAINT pools_status_check
  CHECK (status IN ('open', 'completed'));

-- Optional cleanup, safe to run with the above: `join_deadline` is vestigial —
-- 0 references anywhere in app/, lib/, mobile/ or components/, and 0 of 623
-- rows populated. Left commented so dropping a column stays a deliberate act.
-- ALTER TABLE public.pools DROP COLUMN IF EXISTS join_deadline;

-- Rollback:
--   ALTER TABLE public.pools DROP CONSTRAINT IF EXISTS pools_status_check;
