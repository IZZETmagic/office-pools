-- Migration 075: tier caps, enforced by the database.
--
-- Phase 3a Step 4. Depends on 067 (pools.tier). Apply 067 first.
--
-- ⚠ NOT YET APPLIED ANYWHERE. Written for review.
--
-- Numbered 075 because 074 is the current maximum. NOTE: 061, 062, 065 and
-- 071-074 all appeared while this work was in progress — something else is
-- writing migrations to this repo concurrently. Re-check the maximum
-- immediately before applying; do not trust this number if time has passed.
--
-- ============================================================
-- WHAT THIS ENFORCES
-- ============================================================
--   tier    members   entries per member
--   free         10                    1
--   plus         30                    3
--   max    unlimited            unlimited
--   ultra  unlimited            unlimited
--
-- From MONETIZATION.md → Pool Tiers. ⚠ The Plus member ceiling is still an OPEN
-- QUESTION there (30 vs 20 — "data shows the 21-30 band is empty, lean to
-- tighten to 20"). 30 is the published number, so 30 is what ships; changing it
-- later means editing pool_tier_member_cap() and nothing else.
--
-- ============================================================
-- 🔴 THE GRANDFATHER CLAUSE — READ THIS BEFORE APPLYING
-- ============================================================
-- Migration 067 gives every existing pool `tier = 'free'`, because that is the
-- column default and no one has paid yet. Enforcing a 10-member cap on that
-- would instantly break every pool that already has more than 10 members — and
-- per the 2026 World Cup regression, office pools CLUSTER at 10-18 members. It
-- would also hit pools whose admins already paid $19/$49 under the old manual
-- arrangement, which is worse than a bug.
--
-- So enforcement is opt-in per pool, via `pools.tier_enforced_from`:
--
--   NULL      -> never capped. Every pool that exists today.
--   timestamp -> capped. The default for every pool created from now on.
--
-- The column is added WITHOUT a default (so existing rows land on NULL), and
-- the default is set afterwards (so new rows get now()). Order matters; a
-- single ADD COLUMN ... DEFAULT now() would backfill every existing row and
-- cap the entire customer base.
--
-- Un-grandfathering a specific pool later is `UPDATE pools SET
-- tier_enforced_from = now() WHERE pool_id = …`, which is a deliberate,
-- per-pool, auditable act.
--
-- ============================================================
-- WHY TRIGGERS AND NOT CHECKS IN THE API
-- ============================================================
-- Joins currently go through /api/pools/join with the service-role client, and
-- mobile calls that same route. But an API check only covers the paths we know
-- about: RLS policies on pool_members live in the base schema (not in any
-- migration file here), a future direct client insert would bypass a route
-- guard entirely, and this is the same reasoning that forced
-- trg_enforce_prediction_before_kickoff to be a trigger.
--
-- A BEFORE INSERT trigger holds for every path, including the ones nobody has
-- written yet.
--
-- ⚠ SEPARATE PRE-EXISTING BUG, NOT FIXED HERE: `pools.max_participants` — the
-- admin's OWN member limit — is stored, displayed and editable but enforced
-- NOWHERE. An admin can set "max 20" and 50 people can still join. That is a
-- different limit from the tier ceiling below (theirs, not ours) and deserves
-- its own fix.
--
-- ============================================================
-- WHY create_pool_entry IS NOT MODIFIED
-- ============================================================
-- The obvious move is to add the tier ceiling inside create_pool_entry() (005),
-- which already enforces pools.max_entries_per_user race-safely. Deliberately
-- not doing that: CREATE OR REPLACE against a function whose live definition
-- may have drifted from its migration file silently overwrites the drift — the
-- 055 lesson, where the file was 682 bytes short of production.
--
-- A separate trigger touches nothing that already works, and covers inserts
-- that never go through the RPC at all.

BEGIN;

-- ============================================================ 1. Opt-in flag
ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS tier_enforced_from timestamptz;   -- no DEFAULT: see above

ALTER TABLE public.pools
  ALTER COLUMN tier_enforced_from SET DEFAULT now();          -- applies to new rows only

COMMENT ON COLUMN public.pools.tier_enforced_from IS
  'When tier caps started applying to this pool. NULL = grandfathered, never capped — '
  'every pool that existed before migration 075. New pools default to now(). '
  'Un-grandfathering one pool is a deliberate UPDATE; there is no bulk switch on purpose.';

-- ============================================================ 2. The caps
-- One definition each, referenced by both triggers. NULL means unlimited —
-- not a large number, so "unlimited" can never be silently exceeded by a pool
-- that grows past whatever sentinel we picked.
CREATE OR REPLACE FUNCTION public.pool_tier_member_cap(p_tier text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
           WHEN 'free' THEN 10
           WHEN 'plus' THEN 30
           ELSE NULL          -- max, ultra, and anything unrecognised
         END;
$$;

CREATE OR REPLACE FUNCTION public.pool_tier_entry_cap(p_tier text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
           WHEN 'free' THEN 1
           WHEN 'plus' THEN 3
           ELSE NULL
         END;
$$;

COMMENT ON FUNCTION public.pool_tier_member_cap(text) IS
  'Members allowed at a tier. NULL = unlimited. An UNRECOGNISED tier returns NULL, '
  'i.e. uncapped: a typo must never lock people out of a pool they paid for.';

-- ============================================================ 3. Member cap
CREATE OR REPLACE FUNCTION public.enforce_pool_member_tier_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tier     text;
  v_enforced timestamptz;
  v_cap      integer;
  v_count    integer;
BEGIN
  -- FOR UPDATE serializes concurrent joins to the SAME pool, so two people
  -- cannot both read "9 members" and both become the 10th. Same technique
  -- create_pool_entry() uses on pool_members. Locking the pools row (not the
  -- members) is what makes the count stable for the duration.
  SELECT tier, tier_enforced_from
    INTO v_tier, v_enforced
    FROM public.pools
   WHERE pool_id = NEW.pool_id
     FOR UPDATE;

  -- No pool row: let the foreign key produce the error, not us.
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Grandfathered.
  IF v_enforced IS NULL THEN RETURN NEW; END IF;

  v_cap := public.pool_tier_member_cap(v_tier);
  IF v_cap IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count
    FROM public.pool_members
   WHERE pool_id = NEW.pool_id;

  IF v_count >= v_cap THEN
    -- Custom SQLSTATE so the API can branch on the code instead of matching the
    -- message text. The message is user-facing: it is what the 11th person is
    -- shown, and MONETIZATION.md is explicit that they get a straight answer
    -- ("this pool is full, ask the admin to upgrade") and not a nag screen.
    RAISE EXCEPTION 'This pool is full. Ask the admin to upgrade it to add more members.'
      USING ERRCODE = 'SP010';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pool_member_tier_cap ON public.pool_members;
CREATE TRIGGER trg_pool_member_tier_cap
  BEFORE INSERT ON public.pool_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pool_member_tier_cap();

-- ============================================================ 4. Entry cap
CREATE OR REPLACE FUNCTION public.enforce_pool_entry_tier_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_pool_id  uuid;
  v_tier     text;
  v_enforced timestamptz;
  v_cap      integer;
  v_count    integer;
BEGIN
  -- A detached entry (member_id NULL, migration 056) belongs to nobody and
  -- cannot breach a per-member cap.
  IF NEW.member_id IS NULL THEN RETURN NEW; END IF;

  SELECT pm.pool_id INTO v_pool_id
    FROM public.pool_members pm
   WHERE pm.member_id = NEW.member_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT tier, tier_enforced_from
    INTO v_tier, v_enforced
    FROM public.pools
   WHERE pool_id = v_pool_id
     FOR UPDATE;

  IF NOT FOUND OR v_enforced IS NULL THEN RETURN NEW; END IF;

  v_cap := public.pool_tier_entry_cap(v_tier);
  IF v_cap IS NULL THEN RETURN NEW; END IF;

  -- Retired entries do not count: someone who stopped participating should not
  -- have that slot burned forever.
  --
  -- ⚠ This deliberately DIFFERS from create_pool_entry() (005), whose own count
  -- has no retired_at filter and so does burn the slot. That is a pre-existing
  -- inconsistency in the admin's own max_entries_per_user check, not something
  -- this migration introduces or fixes — the stricter of the two still wins, so
  -- this trigger can only ever be the more generous one.
  SELECT COUNT(*) INTO v_count
    FROM public.pool_entries
   WHERE member_id = NEW.member_id
     AND retired_at IS NULL;

  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'This pool allows % entry(s) per person. Ask the admin to upgrade it.', v_cap
      USING ERRCODE = 'SP011';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pool_entry_tier_cap ON public.pool_entries;
CREATE TRIGGER trg_pool_entry_tier_cap
  BEFORE INSERT ON public.pool_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pool_entry_tier_cap();

COMMIT;

-- ============================================================================
-- POST-APPLY CHECK — every existing pool must be grandfathered, or you have
-- just capped the customer base. This must return 0.
--
--   SELECT COUNT(*) FROM pools WHERE tier_enforced_from IS NOT NULL;
--
-- And this shows who WOULD have been broken without the clause, which is the
-- number worth looking at before believing any of the above:
--
--   SELECT p.tier, COUNT(*) AS pools, MAX(m.n) AS biggest
--     FROM pools p
--     JOIN (SELECT pool_id, COUNT(*) n FROM pool_members GROUP BY pool_id) m
--       ON m.pool_id = p.pool_id
--    WHERE m.n > pool_tier_member_cap(p.tier)
--    GROUP BY p.tier;
-- ============================================================================

-- ROLLBACK -----------------------------------------------------------------
-- BEGIN;
-- DROP TRIGGER  IF EXISTS trg_pool_entry_tier_cap  ON public.pool_entries;
-- DROP TRIGGER  IF EXISTS trg_pool_member_tier_cap ON public.pool_members;
-- DROP FUNCTION IF EXISTS public.enforce_pool_entry_tier_cap();
-- DROP FUNCTION IF EXISTS public.enforce_pool_member_tier_cap();
-- DROP FUNCTION IF EXISTS public.pool_tier_entry_cap(text);
-- DROP FUNCTION IF EXISTS public.pool_tier_member_cap(text);
-- ALTER TABLE public.pools DROP COLUMN IF EXISTS tier_enforced_from;
-- COMMIT;
