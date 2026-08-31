-- =============================================================
-- 122 — THE DUEL RECAP IS SHOWN ONCE
-- =============================================================
-- ⚠ ADDITIVE ONLY. One nullable column and one backfill; no function is
-- replaced, so there is no `md5(prosrc)` pre-check to run.
-- =============================================================
--
-- When your duel is decided, the next time you open the pool you get a
-- one-time recap of how it went. This is the marker that makes "one-time" true.
-- Plan: drafts/2026-08-31_showdown_duel_recap_plan.md
--
-- ## ⚠ A TIMESTAMP, NEVER A MATCHWEEK NUMBER
--
-- The obvious design is `last_recap_seen_matchweek int` with a `>= n` test, and
-- it is silently wrong. Rounds are PLAYED OUT OF NUMERICAL ORDER — migration
-- 101 measured a minimum gap of **minus 121 days** across three real seasons —
-- so a member who saw the recap for a late-numbered round played early would
-- have a high-water mark no later round could clear, and would never be shown
-- another recap for the rest of the season. Nothing would error.
--
-- Comparing `settled_at` cannot have that bug: settlement time is monotonic
-- whatever order the rounds are numbered in. It is the same reason the front
-- end orders the form guide and the rank arrows by `settled_at`.
--
-- It also self-limits. A member who is away three weeks has three settled
-- duels behind them and gets ONE sheet — the latest — because the test is
-- "anything newer than what I last saw", not a queue. That falls out of the
-- comparison rather than needing a rule.
--
-- ## Per ENTRY, not per member
--
-- A multi-entry pool recaps each entry independently, which is the only reading
-- that makes sense: the duels are per entry.
--
-- ## Why the column can be written from the client
--
-- Checked before choosing this over a server route:
--   · `pg_class.relacl` = `authenticated=arwdDxtm/postgres` — a TABLE-WIDE
--     grant, so this new column inherits UPDATE without a further GRANT.
--   · RLS policy `"Users can update own entries"` allows a member to write
--     their own row while the pool is not archived (`member_pool_writable`).
--
-- ⚠ That grant is wider than this feature needs, and a separate audit is open
-- on it. If it is ever narrowed to column-level grants, `last_recap_seen_at`
-- MUST be in the list or the recap silently stops marking itself seen and
-- reappears every visit.

ALTER TABLE public.pool_entries
  ADD COLUMN IF NOT EXISTS last_recap_seen_at timestamptz;

COMMENT ON COLUMN public.pool_entries.last_recap_seen_at IS
  'When this entry last dismissed a duel recap. There is an unseen recap when '
  'the entry''s most recently settled duel has settled_at > this (or this is '
  'NULL). A TIMESTAMP, never a matchweek number: rounds are played out of '
  'numerical order (101 measured a minimum gap of minus 121 days), so a '
  'high-water mark on the number would stop a member ever seeing another '
  'recap. Written by the client on DISMISS, never on open. Migration 122.';

-- -------------------------------------------------------------
-- The cold start
-- -------------------------------------------------------------
-- ⚠ WITHOUT THIS, THE FIRST PERSON TO OPEN AN ESTABLISHED POOL IS SHOWN A
-- RECAP FOR A MONTHS-OLD RESULT. `NULL` means "never seen", which is right for
-- a pool that has not played yet and wrong for one that has.
--
-- Stamping `now()` says "everything already settled is water under the bridge",
-- which is exactly the intent. The first duel to settle AFTER this migration is
-- newer than the stamp, so it recaps normally.
--
-- Scoped to showdown pools: no other mode has duels, and leaving the column
-- NULL elsewhere keeps it honest about never having been used there.
--
-- At the time of writing this is a no-op — 0 of 333 duel rows had ever settled
-- — but it must not depend on that being true whenever it actually runs.

UPDATE public.pool_entries pe
   SET last_recap_seen_at = now()
  FROM pool_members pm
  JOIN pools p ON p.pool_id = pm.pool_id
 WHERE pe.member_id = pm.member_id
   AND p.league_mode = 'showdown'
   AND pe.last_recap_seen_at IS NULL
   AND EXISTS (
     SELECT 1 FROM league_duels d
      WHERE d.pool_id = p.pool_id
        AND d.settled_at IS NOT NULL
        AND (d.entry_a = pe.entry_id OR d.entry_b = pe.entry_id)
   );
