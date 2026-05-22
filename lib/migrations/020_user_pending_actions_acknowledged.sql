-- Migration 020: split user_pending_actions into two-state tracking
--
-- Migration 019 introduced a single `completed_at` column, but the user
-- experience requires two independent states:
--
--   1. acknowledged_at — set when the user navigates to the relevant tab
--      (e.g., opens Form tab in the pool). Clears the tab / pool card /
--      bottom-tab red dots and the OS app icon badge. Matches the banter
--      "open the sheet to clear" pattern.
--
--   2. completed_at — set when the user taps the specific in-tab cell
--      (e.g., taps a newly-unlocked badge to view its details). Clears
--      that one cell's red dot. The user explicitly asked for tap-only
--      semantics at the cell level so the dot persists after the tab
--      has been opened, until the cell itself is interacted with.
--
-- All previous functions that used `completed_at` semantics for the
-- hierarchical dots (badge_count, summary, mark_pool_*) are updated to
-- use `acknowledged_at` instead. `mark_action_complete` (cell tap) sets
-- both columns so a single tap simultaneously clears the cell dot AND
-- removes the row from the hierarchical aggregates.

ALTER TABLE public.user_pending_actions
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

-- Hierarchical-dot index: rows that still need to be shown in the
-- bottom tab / pool card / tab bar (user hasn't visited the relevant tab).
CREATE INDEX IF NOT EXISTS user_pending_actions_user_unacknowledged
  ON public.user_pending_actions (user_id) WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS user_pending_actions_user_pool_unacknowledged
  ON public.user_pending_actions (user_id, pool_id) WHERE acknowledged_at IS NULL;

-- ---- Updated RPCs ----

-- Now counts rows where the user hasn't yet visited the relevant tab.
-- This is what drives the OS app icon badge math and the hierarchical
-- in-app dots (bottom tab, pool card, pool detail tab).
CREATE OR REPLACE FUNCTION public.get_user_total_pending(p_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.user_pending_actions
  WHERE user_id = p_user_id AND acknowledged_at IS NULL;
$$;

-- get_user_badge_count stays the same algebraically — it just delegates
-- to get_user_total_pending whose semantics changed under it.

-- Updated summary: hierarchical counts use acknowledged_at; cell-level
-- arrays use completed_at so the per-badge dots persist until tap.
--
-- Shape:
--   {
--     banter_unread_total: int,
--     pending_total: int,                       -- rows where acknowledged_at IS NULL
--     banter_by_pool: { pool_id: int },
--     pending_by_pool_type: {                   -- hierarchical dots (acknowledged_at IS NULL)
--       pool_id: { action_type: int }
--     },
--     cells_by_pool_type: {                     -- per-cell dots (completed_at IS NULL)
--       pool_id: { action_type: [{ id, reference_id }] }
--     }
--   }
CREATE OR REPLACE FUNCTION public.get_user_pending_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  banter_total integer := 0;
  pending_total integer := 0;
  banter_by_pool jsonb := '{}'::jsonb;
  pending_by_pool_type jsonb := '{}'::jsonb;
  cells_by_pool_type jsonb := '{}'::jsonb;
BEGIN
  -- Banter unread (unchanged).
  SELECT
    COALESCE(SUM(unread_count), 0)::integer,
    COALESCE(jsonb_object_agg(pool_id::text, unread_count), '{}'::jsonb)
  INTO banter_total, banter_by_pool
  FROM (
    SELECT
      member.pool_id,
      COUNT(*)::integer AS unread_count
    FROM public.pool_messages pm
    INNER JOIN public.pool_members member ON member.pool_id = pm.pool_id
    WHERE member.user_id = p_user_id
      AND pm.user_id <> p_user_id
      AND (member.last_read_at IS NULL OR pm.created_at > member.last_read_at)
    GROUP BY member.pool_id
  ) banter_agg;

  -- Hierarchical pending (acknowledged_at IS NULL).
  SELECT
    COALESCE(SUM(pending_count), 0)::integer,
    COALESCE(jsonb_object_agg(pool_id_str, type_map), '{}'::jsonb)
  INTO pending_total, pending_by_pool_type
  FROM (
    SELECT
      COALESCE(pool_id::text, '__null__') AS pool_id_str,
      SUM(pending_count) AS pending_count,
      jsonb_object_agg(action_type, pending_count) AS type_map
    FROM (
      SELECT pool_id, action_type, COUNT(*)::integer AS pending_count
      FROM public.user_pending_actions
      WHERE user_id = p_user_id AND acknowledged_at IS NULL
      GROUP BY pool_id, action_type
    ) ppt
    GROUP BY pool_id
  ) pbp;

  -- Cell-level pending (completed_at IS NULL). Returns the actual
  -- pending action IDs + reference_ids so the mobile client can render
  -- per-cell dots AND call mark_action_complete with the right id.
  SELECT
    COALESCE(jsonb_object_agg(pool_id_str, type_map), '{}'::jsonb)
  INTO cells_by_pool_type
  FROM (
    SELECT
      COALESCE(pool_id::text, '__null__') AS pool_id_str,
      jsonb_object_agg(action_type, cells) AS type_map
    FROM (
      SELECT
        pool_id,
        action_type,
        jsonb_agg(jsonb_build_object('id', id, 'reference_id', reference_id)) AS cells
      FROM public.user_pending_actions
      WHERE user_id = p_user_id AND completed_at IS NULL
      GROUP BY pool_id, action_type
    ) ppt
    GROUP BY pool_id
  ) pbp;

  RETURN jsonb_build_object(
    'banter_unread_total', banter_total,
    'pending_total', pending_total,
    'banter_by_pool', banter_by_pool,
    'pending_by_pool_type', pending_by_pool_type,
    'cells_by_pool_type', cells_by_pool_type
  );
END;
$$;

-- Renamed semantically: now marks "the user has SEEN this category of
-- notification" (set acknowledged_at), not "the user took the specific
-- action" (which is what completed_at means and only mark_action_complete
-- sets). Old name retained for compat; both call the same underlying logic
-- so existing callers keep working until they migrate.
CREATE OR REPLACE FUNCTION public.mark_pool_actions_acknowledged(
  p_user_id uuid,
  p_pool_id uuid,
  p_action_type text
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rows_updated integer;
  v_auth_user_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    SELECT auth_user_id INTO v_auth_user_id FROM public.users WHERE user_id = p_user_id;
    IF v_auth_user_id IS NULL OR v_auth_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Permission denied: caller is not the user';
    END IF;
  END IF;

  UPDATE public.user_pending_actions
  SET acknowledged_at = NOW()
  WHERE user_id = p_user_id
    AND pool_id = p_pool_id
    AND action_type = p_action_type
    AND acknowledged_at IS NULL;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated;
END;
$$;

-- Backward-compat alias — the migration 019 name now also sets
-- acknowledged_at (since that's the field the hierarchical dots key off).
-- Note: does NOT set completed_at; opening a tab doesn't tap every cell.
CREATE OR REPLACE FUNCTION public.mark_pool_actions_complete(
  p_user_id uuid,
  p_pool_id uuid,
  p_action_type text
)
RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.mark_pool_actions_acknowledged(p_user_id, p_pool_id, p_action_type);
$$;

-- mark_action_complete (cell tap) now also sets acknowledged_at so a
-- direct tap on a cell — without first visiting the tab — clears the
-- hierarchical dots too.
CREATE OR REPLACE FUNCTION public.mark_action_complete(
  p_user_id uuid,
  p_action_id uuid
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rows_updated integer;
  v_auth_user_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    SELECT auth_user_id INTO v_auth_user_id FROM public.users WHERE user_id = p_user_id;
    IF v_auth_user_id IS NULL OR v_auth_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Permission denied: caller is not the user';
    END IF;
  END IF;

  UPDATE public.user_pending_actions
  SET completed_at = NOW(),
      acknowledged_at = COALESCE(acknowledged_at, NOW())
  WHERE id = p_action_id
    AND user_id = p_user_id
    AND completed_at IS NULL;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_pool_actions_acknowledged(uuid, uuid, text) TO authenticated;
