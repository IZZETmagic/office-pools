-- =====================================================================
-- Post-deadline / post-kickoff prediction lock  (ROADMAP: "Post-deadline
-- prediction lock" `Bug`)
--
-- PROBLEM
--   The only write gate on public.predictions today is the RLS clause
--   `pe.predictions_locked = false`. There is NO per-match kickoff check,
--   so a prediction for an already-kicked-off / completed match can still
--   be inserted or updated. Footprint measured 2026-07-12:
--     2,599 prediction rows across 478 entries were written AFTER their
--     match's kickoff (latest 2026-07-11 19:35 UTC).
--   This is the recurring shadow/prod scoring-divergence source.
--
-- WHY A DB TRIGGER (not a route/RPC guard)
--   There are four write paths and they do NOT share one code chokepoint:
--     1. web  POST /api/pools/[id]/predictions -> save_predictions_batch()
--        (SECURITY INVOKER -> RLS/triggers apply)
--     2. web  full-set autosave resends EVERY entered pick each save
--        (components/predictions/PredictionsFlow.tsx:377) — so a guard that
--        RAISES would fail the whole batch once any match completes.
--     3. mobile lib/usePredictions.ts:253 writes predictions DIRECTLY via
--        supabase-js .upsert() — bypasses every API route entirely.
--     4. mobile progressive submit hits /predictions/round (submit only).
--   The single place all of these funnel through is the row write itself.
--   A BEFORE INSERT OR UPDATE trigger is the one durable chokepoint.
--
-- DESIGN: silently SKIP (return null), do not RAISE
--   Because path #2 resends completed matches every save, raising would
--   break saving. Returning null from a BEFORE row trigger skips just that
--   row and lets the rest of the batch persist. Net effect:
--     * existing picks on locked matches are preserved (untouched)
--     * new edits to locked matches are silently ignored (not persisted)
--     * edits to not-yet-started matches save exactly as before
--     * a batch mixing locked + open matches still saves the open ones
--
-- SAFETY / no-op check (run BEFORE applying):
--   select m.status, m.is_completed,
--     (coalesce(m.match_date,'infinity'::timestamptz) > now()
--       and m.is_completed = false) as trigger_allows_write,
--     count(*)
--   from matches m
--   where m.tournament_id = '00000000-0000-0000-0000-000000000001'
--   group by 1,2 order by 1,2;
--   -- 2026-07-12 result: completed(100) -> allow=false ; scheduled(4) -> allow=true
--   -- i.e. a complete no-op for every currently-editable match.
-- =====================================================================

create or replace function public.enforce_prediction_before_kickoff()
returns trigger
language plpgsql
as $$
declare
  v_match_date   timestamptz;
  v_is_completed boolean;
begin
  select match_date, is_completed
    into v_match_date, v_is_completed
  from public.matches
  where match_id = new.match_id;

  -- Once a match has kicked off (or is flagged completed) its predictions
  -- are frozen. Skip the write for this row instead of raising, so a
  -- full-set batch save still persists the still-open matches.
  -- Undated matches (v_match_date is null) are treated as not-yet-started.
  if v_is_completed is true
     or (v_match_date is not null and v_match_date <= now()) then
    return null;  -- skip: do not insert/update this row
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_prediction_before_kickoff on public.predictions;

create trigger trg_enforce_prediction_before_kickoff
  before insert or update on public.predictions
  for each row
  execute function public.enforce_prediction_before_kickoff();

-- =====================================================================
-- POST-APPLY VERIFICATION (expected results noted)
--   1. A scheduled/future match still accepts a write:
--        -- pick any future match_id + an existing test entry, upsert, expect the row present.
--   2. A completed match write is skipped:
--        -- upsert a bogus score for a completed match_id; expect the stored row UNCHANGED.
--   3. No batch failures in logs from save_predictions_batch.
--
-- ROLLBACK
--   drop trigger if exists trg_enforce_prediction_before_kickoff on public.predictions;
--   drop function if exists public.enforce_prediction_before_kickoff();
-- =====================================================================
