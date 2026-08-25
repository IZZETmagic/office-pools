-- =============================================================
-- 088 — FIX: the LMS lock guards the PICK, not the engine's result
-- =============================================================
-- 086 attached the lock trigger as `BEFORE INSERT OR UPDATE`, i.e. to every
-- column. So when `league_lms_settle` wrote `result` and `settled_at` back onto
-- a pick, the trigger ran and — for an entry it had just eliminated — hit its
-- own "somebody already knocked out cannot keep picking" guard and RETURN NULLed
-- the engine's write.
--
-- The effect was quiet and specific: eliminations were recorded on
-- `league_lms_survivors` correctly, so the round played out right, but the PICK
-- row never learned what happened to it — every eliminated player's pick stayed
-- `result = NULL` forever. A member looking back at the week they went out would
-- have seen no verdict on the club they chose.
--
-- `UPDATE OF club_id, matchweek_number` says what was always meant: the lock is
-- about CHANGING YOUR PICK after the matchweek has started. The engine recording
-- an outcome is not a pick, and was never what the gate was for.
--
-- Found by the verification asserting that the pick itself records what
-- happened — an assertion that exists only because "the record should be able to
-- explain itself afterwards" is a product requirement, not a technical one.
-- =============================================================

DROP TRIGGER IF EXISTS trg_enforce_lms_pick_before_lock ON league_lms_picks;
CREATE TRIGGER trg_enforce_lms_pick_before_lock
  BEFORE INSERT OR UPDATE OF club_id, matchweek_number ON league_lms_picks
  FOR EACH ROW EXECUTE FUNCTION enforce_lms_pick_before_lock();
