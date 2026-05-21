-- Migration: get_user_unread_message_count(uuid) → integer
--
-- Used by the APNs push pipeline (lib/push/apns.ts) to set the iOS
-- app icon badge to a meaningful per-user count instead of the
-- previous hard-coded `badge: 1`. The old behavior set the badge to
-- exactly 1 on every push and never cleared it, so phones got stuck
-- showing "1" forever even after the user opened the app.
--
-- Counts banter messages where:
--   - the pool has the user as a member,
--   - the message was authored by someone OTHER than the user
--     (self-messages don't ping yourself), and
--   - the message is newer than the user's last_read_at for that
--     pool (or the user has never opened the banter, last_read_at is
--     NULL, in which case every other-authored message counts).
--
-- STABLE because the result depends on table contents but doesn't
-- change within a single transaction. SECURITY DEFINER so the server
-- role can call it even with row-level security on pool_messages /
-- pool_members; search_path pinned to public to prevent injection
-- via user-set schemas.

CREATE OR REPLACE FUNCTION public.get_user_unread_message_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.pool_messages pm
  INNER JOIN public.pool_members member ON member.pool_id = pm.pool_id
  WHERE member.user_id = p_user_id
    AND pm.user_id <> p_user_id
    AND (member.last_read_at IS NULL OR pm.created_at > member.last_read_at);
$$;

-- Allow service role and authenticated users to call this. The server
-- (admin client) uses service_role; client-side calls would use the
-- authenticated role, but the function only ever reads counts for the
-- caller-supplied uuid — no escalation possible.
GRANT EXECUTE ON FUNCTION public.get_user_unread_message_count(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_unread_message_count(uuid) TO authenticated;
