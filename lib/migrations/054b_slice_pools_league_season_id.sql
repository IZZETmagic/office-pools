-- Migration 054b (vertical slice): pools.league_season_id, additive only.
--
-- Plan: drafts/2026-08-22_league_vertical_slice.md §3 S1.
--
-- ============================================================
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ============================================================
-- The v3.1 design pairs this column with three CHECKs and two DROP NOT NULLs,
-- making `tournament_id` NULL for a league pool. That single choice is what
-- creates the phase's largest cost: 50 sites read `pools.tournament_id` and 34
-- of them are raw selects the compiler cannot catch, each becoming
-- `.eq('tournament_id', null)` -> zero rows at HTTP 200 -- the silent-wrongness
-- class this codebase keeps hitting.
--
-- In the slice a league pool keeps a POPULATED `tournament_id` and carries
-- `league_season_id` alongside it. Every existing World Cup path keeps working
-- unchanged because the value is a real FK to a real row.
--
-- This is not speculative. Production has run exactly this shape for a week:
-- pool PTQPZ797 carries tournament_id b1299174-... AND
-- prediction_mode = 'league_pickem', and has caused no failure. That tournament
-- has 0 `matches` and 0 `teams`, so every World-Cup-scoped query correctly
-- returns empty for it.
--
-- NOT IN THIS MIGRATION, each recorded in the plan's §5 with its return phase:
--   * pools_exactly_one_competition   (the XOR)
--   * pools_league_mode_ck
--   * pools_league_no_pool_deadline_ck
--   * ALTER COLUMN tournament_id       DROP NOT NULL
--   * ALTER COLUMN prediction_deadline DROP NOT NULL
--
-- Cost: two sources of competition truth coexist until the full L4 lands the
-- XOR. With one league that is one row's blast radius; at two leagues it is a
-- real hazard and the XOR must land first.
--
-- ============================================================
-- CONTAINMENT — why this needs no accompanying guards
-- ============================================================
-- 054a already guarded `lite_recalc_entry` (keyed on prediction_mode, so it is
-- unaffected by this column either way).
--
-- The World Cup scoring selectors reach an entry only through
-- `pool_entries.has_submitted_predictions`, `.point_adjustment`, or by starting
-- FROM `predictions`. League picks live in `league_predictions`, so the
-- FROM-predictions selectors see zero rows structurally. Verified by probe on a
-- real league-shaped pool row: shadow_eligible_entries = 0,
-- shadow_pools_needing_materialize = 0.
--
-- THE LOAD-BEARING CONSTRAINT: the league write path must never set
-- `has_submitted_predictions` or `point_adjustment` on a league entry. Those two
-- columns are the only doors left. Asserted as a test in the slice's S2.

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='league_seasons') THEN
    RAISE EXCEPTION 'Migration 054b: league_seasons does not exist — the FK would be unresolvable.';
  END IF;
END $guard$;

ALTER TABLE public.pools
  ADD COLUMN IF NOT EXISTS league_season_id uuid REFERENCES public.league_seasons(season_id);

CREATE INDEX IF NOT EXISTS idx_pools_league_season
  ON public.pools(league_season_id)
  WHERE league_season_id IS NOT NULL;

COMMENT ON COLUMN public.pools.league_season_id IS
  'The league season this pool plays, for prediction_mode = league_pickem. NULLABLE and, in the vertical slice, carried ALONGSIDE a populated tournament_id rather than instead of it — see drafts/2026-08-22_league_vertical_slice.md §1. The exactly-one XOR, the mode CHECK and the deadline CHECK are deliberately deferred to the full L4; until they land, nothing enforces that this column and tournament_id agree. Do not add a second league competition before the XOR ships.';

-- ANALYZE so the planner does not estimate the new column from a stale sample.
-- A new column with no statistics can flip a join plan on the shared scoring
-- path, which would be a World Cup regression, not a league one.
ANALYZE public.pools;

-- ============================================================
-- Verification — performed against production, results recorded
-- ============================================================
--   column present ......................... 1
--   idx_pools_league_season present ........ 1
--   pools total ............................ 624 (unchanged)
--   pools with league_season_id ............ 0
--   CHECK constraints added ................ 0
--   tournament_id still NOT NULL ........... yes
--
-- And a full league-shaped INSERT in a rolled-back transaction:
--   placeholder tournament resolved from the season ...... b1299174-...
--   deadline = the season's last kickoff, still future ... 2027-05-30
--   both ids populated, prediction_mode forced .......... league_pickem
--   pool_round_states created ........................... 0
--   shadow_eligible_entries ............................. 0
--   shadow_pools_needing_materialize .................... 0
