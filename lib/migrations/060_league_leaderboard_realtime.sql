-- Migration 060: the league leaderboard broadcasts itself.
--
-- Plan: drafts/2026-08-24_league_pools_full_plan.md §4 L-B.
-- Product guarantee: the leaderboard must NEVER lag — "the swing is the banter"
-- (memory/product-predictions-not-score-tracker.md). Live standings are a
-- product promise, not a nice-to-have.
--
-- ============================================================
-- WHAT WAS WRONG
-- ============================================================
-- `broadcast_pool_leaderboard` existed and was attached to `shadow_entry_totals`
-- ONLY. Migration 050's comment says `league_entry_totals`' column names were
-- chosen so the trigger "is inherited unchanged" — and then the trigger was
-- never created on it. So a league leaderboard moved only when a member
-- refreshed the page, which is exactly the guarantee above, broken.
--
-- Nothing about the function changes. It reads pool_id, entry_id, match_points,
-- bonus_points, total_points, final_rank and previous_final_rank from the
-- transition table — seven columns `league_entry_totals` already has, with the
-- same names. That was the whole point of naming them that way.
--
-- ============================================================
-- WHY STATEMENT-LEVEL, NOT PER ROW
-- ============================================================
-- `REFERENCING NEW TABLE AS new_rows ... FOR EACH STATEMENT` fires ONCE for the
-- whole write and sends ONE message carrying the whole pool's standings, the
-- same shape the World Cup uses. A per-row trigger on a ten-fixture matchweek
-- would send a message per entry per fixture and the client would have to
-- reassemble an order it cannot see — and this is a SIMULTANEITY problem, not a
-- volume one (memory/project_scalable_architecture.md): everybody watches the
-- same match at the same moment, so message count per write is the thing that
-- matters.
--
-- The function already honours the `leaderboard_broadcast_enabled` kill switch
-- in `sync_settings`, so this inherits an off-switch that operations already
-- knows about.
--
-- ⚠ `realtime.send` is Broadcast-from-database, NOT postgres_changes — so
-- `league_entry_totals` does NOT need adding to a publication, and this does not
-- reintroduce the CDC timeouts that forced the banter migration (022).

DROP TRIGGER IF EXISTS broadcast_league_leaderboard_ins ON league_entry_totals;
CREATE TRIGGER broadcast_league_leaderboard_ins
  AFTER INSERT ON league_entry_totals
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION broadcast_pool_leaderboard();

DROP TRIGGER IF EXISTS broadcast_league_leaderboard_upd ON league_entry_totals;
CREATE TRIGGER broadcast_league_leaderboard_upd
  AFTER UPDATE ON league_entry_totals
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION broadcast_pool_leaderboard();

-- ============================================================
-- VERIFY
-- ============================================================
--   select tgname from pg_trigger where tgrelid = 'league_entry_totals'::regclass
--     and not tgisinternal;   -- expect the two above
--
-- Behavioural proof needs two browser tabs on the same pool, one scoring and one
-- watching. `scripts/verify-league-leaderboard.ts` proves the trigger FIRES
-- (rows land, no error, the send is attempted); it cannot prove a browser
-- received it. That half is still a human check.
