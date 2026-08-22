-- Migration 050c (L2): the witness column for league result pushes.
--
-- RECORD-KEEPING CATCH-UP. This was applied to production on 2026-08-22 during
-- L2 but never written into the repo; found while auditing the migration list
-- against `supabase_migrations` before the L3 deploy. The SQL below is the live
-- state, reconstructed from the catalog — the column and both comments exist in
-- production exactly as written here, so this file is idempotent and safe.
--
-- ============================================================
-- WHY THE COLUMN EXISTS: a stamp cannot be its own witness
-- ============================================================
-- `result_pushes_sent_at` is the CLAIM: written BEFORE any send, by one writer,
-- so a second worker cannot pick the same fixture up. That makes it a good lock
-- and a useless record of what happened — it reads identically whether the
-- fan-out addressed 200 members, addressed nobody, or died on its first await.
--
-- `result_push_recipients` is the WITNESS, written AFTER the fan-out returns:
--
--     NULL  -> claimed, but the run died before reporting
--     0     -> it ran and legitimately found nobody to notify
--     > 0   -> it addressed N payloads
--
-- Without the second column, "the push worked" and "the push crashed" are the
-- same row, which is the failure mode this project keeps hitting: a sweep that
-- processed nothing looks identical to a sweep with nothing to do.
--
-- Nothing writes either column yet. The league push fan-out is L8; this is the
-- shape it must write into.

ALTER TABLE public.league_fixtures
  ADD COLUMN IF NOT EXISTS result_push_recipients integer;

COMMENT ON COLUMN public.league_fixtures.result_pushes_sent_at IS
  'The CLAIM. Written before any send, one writer only. Never cleared by league_release_score_events — the outbox event and the push claim are different facts.';

COMMENT ON COLUMN public.league_fixtures.result_push_recipients IS
  'The WITNESS, written after the fan-out returns. NULL = claimed but the run died; 0 = ran and found nobody; >0 = addressed N payloads. A stamp cannot be its own witness.';

-- ============================================================
-- Verification
-- ============================================================
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='league_fixtures'
--      AND column_name='result_push_recipients';        -- expect integer, nullable
