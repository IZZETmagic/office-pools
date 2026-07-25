-- 025b_pool_status_check.sql
-- NOT YET APPLIED — deploy 3 of 3. Run ONLY after the 025 code pass is live in
-- production. See drafts/2026-07-25_pool_status_display_audit.md.
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
