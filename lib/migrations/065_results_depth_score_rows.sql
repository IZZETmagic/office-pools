-- Migration 065: a score row can record an OUTCOME pick, not only a scoreline.
--
-- ⚠ NOT IN THE PLAN. L-C specifies the XOR on `league_predictions` and stops
-- there, but `league_match_scores.predicted_home_score` / `.predicted_away_score`
-- are ALSO NOT NULL (migration 050). A Results pick has no scoreline, so the
-- engine could not write a score row for one at all.
--
-- The tempting fix is to store 0-0 and move on. That is precisely the trap
-- Decision 9 names: the breakdown screen reads these columns to tell a member
-- "you predicted X, it finished Y", so a sentinel would show a Results member a
-- scoreline they never entered. What they predicted was "a home win", and that
-- is what has to be stored.
--
-- `actual_home_score` / `actual_away_score` are untouched and stay NOT NULL — a
-- scored fixture always has a real result, whatever shape the prediction took.

ALTER TABLE league_match_scores
  ADD COLUMN IF NOT EXISTS predicted_outcome text;

ALTER TABLE league_match_scores DROP CONSTRAINT IF EXISTS league_match_scores_outcome_ck;
ALTER TABLE league_match_scores ADD CONSTRAINT league_match_scores_outcome_ck
  CHECK (predicted_outcome IS NULL OR predicted_outcome IN ('home', 'draw', 'away'));

ALTER TABLE league_match_scores ALTER COLUMN predicted_home_score DROP NOT NULL;
ALTER TABLE league_match_scores ALTER COLUMN predicted_away_score DROP NOT NULL;

-- Mirrors league_predictions_shape_ck: a score row records exactly the shape the
-- prediction had. If these two ever disagree, the breakdown screen is lying
-- about one of them.
ALTER TABLE league_match_scores DROP CONSTRAINT IF EXISTS league_match_scores_shape_ck;
ALTER TABLE league_match_scores ADD CONSTRAINT league_match_scores_shape_ck
  CHECK (
    (predicted_home_score IS NOT NULL AND predicted_away_score IS NOT NULL AND predicted_outcome IS NULL)
    OR
    (predicted_home_score IS NULL AND predicted_away_score IS NULL AND predicted_outcome IS NOT NULL)
  );

COMMENT ON COLUMN league_match_scores.predicted_outcome IS
  'Results depth: the home|draw|away the member actually tapped. Mutually exclusive with the predicted scoreline pair. Exists so the breakdown screen can show what was really predicted instead of a fabricated scoreline.';
