-- ============================================================================
-- 029 — Shadow P2, Migration A: input-version schema (ADDITIVE + INERT)
-- ============================================================================
-- Plan: drafts/2026-07-27_shadow_P2_input_version_watermark.md
-- Provenance: "P2 per-entry input-version watermark (one reconciler, no blind
-- spots)" — named in commit 724b4ee when shadow_dirty_pools was reverted as
-- "symptom-automation, not a fix".
--
-- WHY
-- ---
-- Shadow's derived tables can only be refreshed when a member EDITS A
-- PREDICTION (`shadow_pools_needing_materialize` tests only
-- `predictions.updated_at > p_since`). So a fix to derivation LOGIC never
-- reaches existing data. Measured 2026-07-27: the July podium fix landed in
-- `resolveEntryPodiumPick` but `shadow_resolved_podium` still held pre-fix
-- cascade values — 19 of 32 entries in one progressive pool recorded as having
-- picked France as champion when they had picked Spain. The last prediction
-- change in the whole database was 2026-07-19, so the selector had returned
-- ZERO pools for over a week and always would have.
--
-- P1 already solved this for ONE case. `shadow_entries_needing_bracket_resolve`
-- selects on `st.engine_version < cur_ver.v` — bump the version, everything
-- re-derives. P2 removes the two limits on that mechanism:
--   (1) it is filtered to `prediction_mode = 'full_tournament'` (1,508 entries),
--       leaving 1,883 submitted PROGRESSIVE entries with no state row at all;
--   (2) `shadow_entry_bracket_state` is the only shadow table with freshness
--       columns — `shadow_resolved_podium/_standings/_qualified/_pairs` have none.
--
-- WHAT THIS MIGRATION DOES (schema only — no behaviour changes)
-- ------------------------------------------------------------
--   1. `shadow_entry_bracket_state.inputs_version` — tracks the 3rd and 4th
--      inputs P1 ignores: ACTUAL MATCH RESULTS and MATCH_CONDUCT. Both are
--      tournament-scoped, so they collapse into one integer rather than 3,401
--      duplicated timestamps.
--   2. `shadow_tournament_input_version` — the per-tournament counter that
--      column is compared against. A TABLE, not a `sync_settings` scalar,
--      deliberately: a global scalar would bake in the single-tournament
--      assumption this whole programme exists to remove.
--
-- INERTNESS IS DELIBERATE AND LOAD-BEARING
-- ----------------------------------------
-- Both versions start at 0, and the entry default is 0, so `inputs_version <
-- tournament version` is FALSE for every existing row. Nothing is stale, nothing
-- re-derives, no selector reads these yet (that is Migration B). Triggering the
-- estate-wide sweep is a later, explicit act — bumping the tournament row to 1 —
-- not an accidental side effect of a schema change.
--
-- NOT RENAMING `shadow_entry_bracket_state`, though it now governs more than
-- brackets: `shadow_entries_needing_bracket_resolve` and
-- `reconcileVersionedBrackets` query it live, so a rename here would break P1.
-- The widened meaning is carried by the COMMENT below instead.
--
-- Reversible:
--   ALTER TABLE public.shadow_entry_bracket_state DROP COLUMN inputs_version;
--   DROP TABLE public.shadow_tournament_input_version;
-- Idempotent: IF NOT EXISTS throughout.
-- ============================================================================

-- 1. Per-entry input version -------------------------------------------------
ALTER TABLE public.shadow_entry_bracket_state
  ADD COLUMN IF NOT EXISTS inputs_version integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.shadow_entry_bracket_state.inputs_version IS
  'Tournament-scoped input generation this entry was last derived against '
  '(actual match results + match_conduct). Compared to '
  'shadow_tournament_input_version.version. Added by P2 migration 029 because '
  'predictions_watermark + engine_version alone miss results/conduct changes.';

COMMENT ON TABLE public.shadow_entry_bracket_state IS
  'Per-entry freshness state for ALL shadow per-entry derived output — not just '
  'brackets: shadow_resolved_standings/_qualified/_pairs/_brackets/_podium and '
  'shadow_entry_bracket are regenerated together, so one row per entry governs '
  'the whole set. Name retained for compatibility with '
  'shadow_entries_needing_bracket_resolve. See P2 migration 029.';

-- 2. Per-tournament input generation ----------------------------------------
CREATE TABLE IF NOT EXISTS public.shadow_tournament_input_version (
  tournament_id uuid PRIMARY KEY,
  version       integer     NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  reason        text
);

COMMENT ON TABLE public.shadow_tournament_input_version IS
  'Generation counter for tournament-scoped shadow inputs (actual match '
  'results, match_conduct). Bump it and every entry in that tournament becomes '
  'stale-by-inputs, so the P2 reconciler re-derives it. Per-tournament by '
  'design: a global scalar would reintroduce the single-tournament assumption. '
  'Starts at 0 to match the entry default, so migration 029 is inert.';

COMMENT ON COLUMN public.shadow_tournament_input_version.reason IS
  'Free text for why the version was bumped (e.g. "podium derivation fix '
  '2026-07-27"). Ops breadcrumb — a bump re-derives the estate and should say why.';

-- Seed a row per known tournament at version 0 (inert).
INSERT INTO public.shadow_tournament_input_version (tournament_id, version, reason)
SELECT DISTINCT m.tournament_id, 0, 'seeded inert by migration 029'
FROM public.matches m
ON CONFLICT (tournament_id) DO NOTHING;
