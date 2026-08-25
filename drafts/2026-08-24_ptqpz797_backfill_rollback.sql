-- Rollback for the PTQPZ797 league_season_id backfill, applied 2026-08-24.
-- Plan: drafts/2026-08-24_league_pools_full_plan.md, phase L-A step 1.
--
-- ============================================================
-- WHAT WAS CHANGED, AND WHY IT WAS TWO COLUMNS AND NOT ONE
-- ============================================================
-- PTQPZ797 ("Premier League 2026/2027 Pool", 3 real members, created
-- 2026-08-16) predates migration 054b, so it carried league_season_id = NULL.
-- Every league branch in the codebase is gated on that column
-- (app/pools/[pool_id]/page.tsx:139, app/api/pools/[pool_id]/predictions/
-- route.ts:161 and :260, and league_score_fixture's own
-- `AND po.league_season_id = v_season`), so the pool rendered the World Cup
-- path against a placeholder tournament holding 0 matches and 0 teams.
--
-- The backfill alone would have opened a SECOND hole, so both went together:
--
--   prediction_deadline was 2026-08-21 18:00 — already past. `league_pickem`
--   is not 'progressive', so computeReveal (lib/predictions/revealGate.ts:72)
--   falls to the single pool-wide deadline gate and returns
--   { revealed: true, scope: 'all' } — every member's ENTIRE entry visible to
--   every other member, for the whole season. That is inert only while
--   league_predictions is empty, which it was, and would have gone live the
--   moment the backfill made picking work.
--
--   app/api/pools/create/route.ts:120-139 already solves this for pools it
--   creates: a league pool's deadline is set to the season's LAST kickoff, so
--   isDeadlinePassed stays false all season and the real locks are per
--   matchweek. The backfill applies the same value, 2027-05-30 15:00+00 —
--   byte-identical to what the route gave the correctly-created pool 9XJ8Q5KT.
--
-- ============================================================
-- GUARDS ON THE FORWARD WRITE
-- ============================================================
--   * matched on the (external_provider, external_league_id, external_season)
--     triple, so it could only ever set a season agreeing with the
--     tournament_id already on the row  -> verified true before applying
--   * `AND league_season_id IS NULL`, so a re-run is a no-op
--   * `AND prediction_mode = 'league_pickem'`, so it cannot reach a World Cup pool
--
-- ============================================================
-- VERIFIED AFTER APPLYING
-- ============================================================
--   league pools with a NULL season          0  (was 1)
--   clubs / matchweeks / fixtures now visible 20 / 38 / 380  (was 0 / 0 / 0)
--   league_score_fixture filter matches      true
--   reveal gate closed (deadline in future)  true
--   pool_entries WC doors touched            0   (the load-bearing constraint)
--   matchweeks still open to pick            37  (MW1 has locked)
--   stray rows in `predictions` for its entries  0 — nothing to clean up
--
-- ============================================================
-- NOT CHANGED — deliberately, both need Ryan's call
-- ============================================================
--   * pools.archived_at = 2026-08-22 02:59:08+00 is STILL SET. The pool is
--     archived, so it is hidden from every list and its admin tabs are hidden.
--     Note migration 044 predates the league tables: league_predictions has NO
--     archive gate in its RLS, so archiving does not actually block a league
--     pick — but the pool is still hidden from the people who would make one.
--     Un-archiving is a product decision, not a repair.
--   * 38 stale pool_round_states rows remain. Inert (a league pool derives round
--     state from league_matchweeks and reads none of them) but they will confuse
--     future audits. Deleting rows was not part of the instruction.

BEGIN;

UPDATE pools
   SET league_season_id    = NULL,
       prediction_deadline = '2026-08-21 18:00:00+00'::timestamptz,
       updated_at          = now()
 WHERE pool_code = 'PTQPZ797';

-- Expect: league_season_id NULL, prediction_deadline back to 2026-08-21 18:00+00.
SELECT pool_code, league_season_id, prediction_deadline
  FROM pools WHERE pool_code = 'PTQPZ797';

COMMIT;

-- ⚠ Rolling this back restores the broken state INCLUDING the reveal hole
-- described above. Only do it if the backfill itself proves wrong.
