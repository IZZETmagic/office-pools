-- Migration: Atomic create-pool-entry function
-- Run this in the Supabase SQL editor.
--
-- Fixes H1 race in app/api/pools/[pool_id]/entries/route.ts where
-- `SELECT count → INSERT` is non-atomic and two concurrent POSTs can
-- both pass `existingCount < max_entries_per_user` before either inserts,
-- bypassing the per-user entry cap.
--
-- Strategy: SELECT FOR UPDATE on pool_members to serialize concurrent
-- entry creations for the same member, inside a single plpgsql call.

CREATE OR REPLACE FUNCTION create_pool_entry(
  p_member_id UUID,
  p_pool_id UUID,
  p_entry_name TEXT DEFAULT NULL
)
RETURNS pool_entries
LANGUAGE plpgsql
AS $$
DECLARE
  v_max INT;
  v_deadline TIMESTAMPTZ;
  v_count INT;
  v_next_number INT;
  v_final_name TEXT;
  v_new_entry pool_entries%ROWTYPE;
BEGIN
  -- Lock the member row to serialize concurrent inserts for this member
  PERFORM 1 FROM pool_members WHERE member_id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002';
  END IF;

  -- Pull the pool limits
  SELECT max_entries_per_user, prediction_deadline
    INTO v_max, v_deadline
    FROM pools
    WHERE pool_id = p_pool_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pool not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_deadline IS NOT NULL AND v_deadline < NOW() THEN
    RAISE EXCEPTION 'Prediction deadline has passed' USING ERRCODE = 'P0001';
  END IF;

  -- Count existing entries for this member (lock held, no race)
  SELECT COUNT(*) INTO v_count FROM pool_entries WHERE member_id = p_member_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Maximum of % entries allowed per user', v_max USING ERRCODE = 'P0001';
  END IF;

  v_next_number := v_count + 1;
  v_final_name := COALESCE(NULLIF(p_entry_name, ''), 'Entry ' || v_next_number);

  INSERT INTO pool_entries (member_id, entry_name, entry_number)
  VALUES (p_member_id, v_final_name, v_next_number)
  RETURNING * INTO v_new_entry;

  RETURN v_new_entry;
END;
$$;

-- Down-migration (save for rollback):
-- DROP FUNCTION IF EXISTS create_pool_entry(UUID, UUID, TEXT);
