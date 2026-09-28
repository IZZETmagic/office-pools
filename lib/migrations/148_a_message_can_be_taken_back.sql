-- 148 — a message can be taken back
--
-- Until now nobody could delete a banter message: `pool_messages` has RLS on with only a
-- SELECT and an INSERT policy, so every UPDATE/DELETE was silently filtered to zero rows.
-- The FAQ has promised "pool admins can remove messages" all along. This is also the
-- prerequisite for pictures in chat (App Store guideline 1.2: user-generated content must be
-- removable).
--
-- WHO MAY DELETE: the sender, a pool admin (`pool_members.role = 'admin'` — the same test the
-- web and mobile UIs use for `isAdmin`), or a super admin.
--
-- ⭐ A SOFT DELETE THAT SCRUBS. The row stays so a reply to it keeps its place in the thread
-- (the reply FK is ON DELETE SET NULL, which would silently orphan the quote), but everything
-- the member wrote is gone: content, metadata, mentions and reactions.
--
-- ⭐ WHY `message_type` IS RESET TO 'text'. Builds already in people's hands render any
-- unknown type by showing `content`, but they render the KNOWN card types from `metadata`.
-- A scrubbed `badge_flex` with `{}` metadata would reach an old build as a broken card. As
-- 'text' it reaches every build ever shipped as the plain words "Message deleted".
--
-- ⚠⚠ WHY A FUNCTION AND NOT AN UPDATE POLICY. RLS restricts ROWS, not COLUMNS (see 145). An
-- UPDATE policy letting the sender touch their own row would also let them rewrite
-- `content`, `pool_id` or `created_at`. The function is the only write path, and it only
-- ever writes the scrub.
--
-- ⚠ `deleted_at` / `deleted_by` ARE FORCED NULL ON INSERT. Otherwise a member could insert a
-- pre-deleted row naming someone else in `deleted_by` and fake a "Removed by a pool admin".
--
-- REALTIME: an AFTER UPDATE trigger broadcasts `message_delete` on the pool's existing
-- private topic (see 022), so open chats tombstone the message live. It fires on the
-- transition, not inside the function, so any future write path is covered too.
--
-- The unread counts stop counting deleted messages. Both functions were re-dumped from
-- production before editing (migration files drift, see memory) — the only change is the
-- `pm.deleted_at IS NULL` line.

-- 1. Columns -------------------------------------------------------------------------------
alter table public.pool_messages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.users(user_id) on delete set null;

comment on column public.pool_messages.deleted_at is
  'Set by delete_pool_message(). A deleted message keeps its row (so replies keep their place) '
  'but its content, metadata, mentions and reactions are scrubbed. See 148.';
comment on column public.pool_messages.deleted_by is
  'Who deleted it. Equal to user_id = the sender took it back; anyone else = a pool admin or '
  'super admin removed it, and the UI says so.';

-- 2. Nobody inserts a message that is already deleted ------------------------------------------
create or replace function public.pool_messages_insert_not_deleted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.deleted_at := null;
  new.deleted_by := null;
  return new;
end;
$$;

drop trigger if exists pool_messages_insert_not_deleted on public.pool_messages;
create trigger pool_messages_insert_not_deleted
  before insert on public.pool_messages
  for each row execute function public.pool_messages_insert_not_deleted();

-- 3. The one write path ------------------------------------------------------------------------
create or replace function public.delete_pool_message(p_message_id uuid)
returns public.pool_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid;
  v_message public.pool_messages;
begin
  select u.user_id into v_caller
  from public.users u
  where u.auth_user_id = (select auth.uid());

  if v_caller is null then
    raise exception 'delete_pool_message: not signed in' using errcode = '42501';
  end if;

  select * into v_message
  from public.pool_messages
  where message_id = p_message_id
  for update;

  if not found then
    raise exception 'delete_pool_message: no such message' using errcode = 'P0002';
  end if;

  -- Idempotent: a double-tap or a retry returns the tombstone rather than erroring.
  if v_message.deleted_at is not null then
    return v_message;
  end if;

  if v_message.user_id <> v_caller
     and not public.is_pool_admin(v_message.pool_id)
     and not public.is_super_admin()
  then
    raise exception 'delete_pool_message: only the sender or a pool admin may delete this'
      using errcode = '42501';
  end if;

  delete from public.pool_message_reactions where message_id = p_message_id;

  update public.pool_messages
  set content      = 'Message deleted',
      message_type = 'text',
      metadata     = '{}'::jsonb,
      mentions     = '{}',
      deleted_at   = now(),
      deleted_by   = v_caller
  where message_id = p_message_id
  returning * into v_message;

  return v_message;
end;
$$;

comment on function public.delete_pool_message(uuid) is
  'Soft-deletes and scrubs a banter message. Sender, pool admin or super admin only. The only '
  'write path for deletion — there is deliberately no UPDATE policy. See 148.';

revoke execute on function public.delete_pool_message(uuid) from public, anon;
grant execute on function public.delete_pool_message(uuid) to authenticated;

-- 4. Tell open chats ---------------------------------------------------------------------------
create or replace function public.broadcast_pool_message_delete()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
begin
  perform realtime.send(
    jsonb_build_object('record', to_jsonb(new)),
    'message_delete',
    'pool:' || new.pool_id::text,
    true
  );
  return null;
end;
$$;

drop trigger if exists broadcast_pool_message_delete_trigger on public.pool_messages;
create trigger broadcast_pool_message_delete_trigger
  after update of deleted_at on public.pool_messages
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.broadcast_pool_message_delete();

-- 5. Unread counts skip deleted messages -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_unread_message_count(p_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::integer
  FROM public.pool_messages pm
  INNER JOIN public.pool_members member ON member.pool_id = pm.pool_id
  WHERE member.user_id = p_user_id
    AND pm.user_id <> p_user_id
    AND pm.deleted_at IS NULL
    AND (member.last_read_at IS NULL OR pm.created_at > member.last_read_at);
$function$;

CREATE OR REPLACE FUNCTION public.get_user_pending_summary(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  banter_total integer := 0;
  pending_total integer := 0;
  banter_by_pool jsonb := '{}'::jsonb;
  pending_by_pool_type jsonb := '{}'::jsonb;
  cells_by_pool_type jsonb := '{}'::jsonb;
BEGIN
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
      AND pm.deleted_at IS NULL
      AND (member.last_read_at IS NULL OR pm.created_at > member.last_read_at)
    GROUP BY member.pool_id
  ) banter_agg;

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
$function$;
