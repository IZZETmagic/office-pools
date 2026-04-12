-- Migration: Create atomic save function for bracket picks
-- Run this in the Supabase SQL editor.
--
-- Fixes the race condition in the bracket-picks POST (auto-save) endpoint.
-- Previously, three separate DELETE+INSERT pairs could interleave with
-- concurrent requests, causing ~33% error rate under rapid auto-save.
-- This function wraps all operations in a single transaction.

CREATE OR REPLACE FUNCTION save_bracket_picks(
  p_entry_id UUID,
  p_group_rankings JSONB DEFAULT '[]'::JSONB,
  p_third_place_rankings JSONB DEFAULT '[]'::JSONB,
  p_knockout_picks JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete existing data for this entry (all three tables)
  DELETE FROM bracket_picker_group_rankings WHERE entry_id = p_entry_id;
  DELETE FROM bracket_picker_third_place_rankings WHERE entry_id = p_entry_id;
  DELETE FROM bracket_picker_knockout_picks WHERE entry_id = p_entry_id;

  -- Insert group rankings
  IF jsonb_array_length(p_group_rankings) > 0 THEN
    INSERT INTO bracket_picker_group_rankings (entry_id, team_id, group_letter, predicted_position)
    SELECT
      p_entry_id,
      (elem->>'team_id')::UUID,
      elem->>'group_letter',
      (elem->>'predicted_position')::INT
    FROM jsonb_array_elements(p_group_rankings) AS elem;
  END IF;

  -- Insert third-place rankings
  IF jsonb_array_length(p_third_place_rankings) > 0 THEN
    INSERT INTO bracket_picker_third_place_rankings (entry_id, team_id, group_letter, rank)
    SELECT
      p_entry_id,
      (elem->>'team_id')::UUID,
      elem->>'group_letter',
      (elem->>'rank')::INT
    FROM jsonb_array_elements(p_third_place_rankings) AS elem;
  END IF;

  -- Insert knockout picks
  IF jsonb_array_length(p_knockout_picks) > 0 THEN
    INSERT INTO bracket_picker_knockout_picks (entry_id, match_id, match_number, winner_team_id, predicted_penalty)
    SELECT
      p_entry_id,
      (elem->>'match_id')::UUID,
      (elem->>'match_number')::INT,
      (elem->>'winner_team_id')::UUID,
      COALESCE((elem->>'predicted_penalty')::BOOLEAN, FALSE)
    FROM jsonb_array_elements(p_knockout_picks) AS elem;
  END IF;
END;
$$;
