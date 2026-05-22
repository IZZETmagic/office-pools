-- Migration 019: user_pending_actions table + RPCs
--
-- Generic "pending action" table for low-volume action-required notifications:
-- badge unlocks, level ups, deadline warnings. Each row tracks one notification
-- that the user needs to "do something" about (open a tab, tap a specific
-- item). The row stays incomplete until the user takes the action; UI red dots
-- throughout the app are driven by these incomplete rows (joined with the
-- existing banter unread watermark model from migration 018).
--
-- Why a separate table from pool_messages: banter messages are high-volume
-- (every message), so the watermark model (pool_members.last_read_at) is more
-- efficient. Other notification types are low-volume — direct row tracking is
-- fine and enables per-item drill-down (tap a specific newly-unlocked badge
-- to mark just that one read).

CREATE TABLE IF NOT EXISTS public.user_pending_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  action_type  text NOT NULL CHECK (action_type IN ('badge_unlock', 'level_up', 'deadline_warning')),
  pool_id      uuid REFERENCES public.pools(pool_id) ON DELETE CASCADE,
  reference_id text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Partial unique constraint on incomplete rows: prevents duplicate pushes from
-- creating duplicate dots. If the server retries a push for the same badge
-- the second insert is a no-op via ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS user_pending_actions_uniq_incomplete
  ON public.user_pending_actions (user_id, action_type, pool_id, COALESCE(reference_id, ''))
  WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS user_pending_actions_user_incomplete
  ON public.user_pending_actions (user_id) WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS user_pending_actions_user_pool_incomplete
  ON public.user_pending_actions (user_id, pool_id) WHERE completed_at IS NULL;

-- RLS: users can read their own rows (also needed so realtime subscriptions
-- only fire for the row owner). No client-side writes — server uses
-- service_role to insert, client uses mark_*_complete RPCs to update.
ALTER TABLE public.user_pending_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_pending_actions_select_own ON public.user_pending_actions
  FOR SELECT USING (
    user_id IN (SELECT user_id FROM public.users WHERE auth_user_id = auth.uid())
  );

-- Enable realtime for instant red-dot updates while the app is foregrounded.
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_pending_actions;

-- ---- RPCs ----

-- Total incomplete actions for the user. Cheap count; used in get_user_badge_count
-- and as a quick fallback when summary RPC isn't needed.
CREATE OR REPLACE FUNCTION public.get_user_total_pending(p_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.user_pending_actions
  WHERE user_id = p_user_id AND completed_at IS NULL;
$$;

-- Combined badge count used by APNs (lib/push/apns.ts) for the iOS app icon.
-- Equals unread banter messages + total pending actions. This is the single
-- number iOS should display on the app icon at any moment.
CREATE OR REPLACE FUNCTION public.get_user_badge_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.get_user_unread_message_count(p_user_id) + public.get_user_total_pending(p_user_id);
$$;

-- Aggregate summary for the mobile UI dot system. Returns a single JSON blob
-- with everything needed to drive every red-dot indicator (bottom tab, pool
-- card, pool detail tab, in-tab cell) in one round-trip:
--   {
--     banter_unread_total: int,
--     pending_total: int,
--     banter_by_pool: { pool_id_str: unread_count },
--     pending_by_pool_type: { pool_id_str: { action_type: count } }
--   }
-- pool_id_str is the UUID as a string. Action types use the column's enum
-- values (badge_unlock, level_up, deadline_warning).
CREATE OR REPLACE FUNCTION public.get_user_pending_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  banter_total integer := 0;
  pending_total integer := 0;
  banter_by_pool jsonb := '{}'::jsonb;
  pending_by_pool_type jsonb := '{}'::jsonb;
BEGIN
  -- Banter total + per-pool breakdown in one pass.
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

  -- Pending total + per-pool-per-type breakdown.
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
      WHERE user_id = p_user_id AND completed_at IS NULL
      GROUP BY pool_id, action_type
    ) ppt
    GROUP BY pool_id
  ) pbp;

  RETURN jsonb_build_object(
    'banter_unread_total', banter_total,
    'pending_total', pending_total,
    'banter_by_pool', banter_by_pool,
    'pending_by_pool_type', pending_by_pool_type
  );
END;
$$;

-- Mark all incomplete actions of one type within one pool as complete. Used
-- by tab-open auto-clear (e.g., user opens Form tab in pool X → clear all
-- badge_unlock + level_up rows for that pool). Returns count of rows cleared.
CREATE OR REPLACE FUNCTION public.mark_pool_actions_complete(
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
  -- Auth check: caller must be the user or service_role.
  IF auth.role() <> 'service_role' THEN
    SELECT auth_user_id INTO v_auth_user_id FROM public.users WHERE user_id = p_user_id;
    IF v_auth_user_id IS NULL OR v_auth_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Permission denied: caller is not the user';
    END IF;
  END IF;

  UPDATE public.user_pending_actions
  SET completed_at = NOW()
  WHERE user_id = p_user_id
    AND pool_id = p_pool_id
    AND action_type = p_action_type
    AND completed_at IS NULL;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated;
END;
$$;

-- Mark a single specific action complete by id. Used when the user taps a
-- specific item (e.g., a newly-unlocked badge cell in Form tab). Returns
-- true if a row was actually updated (was incomplete and belonged to user).
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
  SET completed_at = NOW()
  WHERE id = p_action_id
    AND user_id = p_user_id
    AND completed_at IS NULL;
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;

-- ---- Grants ----

GRANT EXECUTE ON FUNCTION public.get_user_total_pending(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_badge_count(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_pending_summary(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pool_actions_complete(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_action_complete(uuid, uuid) TO authenticated;
