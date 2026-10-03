-- 158 — a member can report a message and block a member
--
-- Step 1 of picture sharing (SPORTPOOL_PROGRAMME.md → Picture sharing in chat), and the App
-- Store's guideline 1.2 for any app with user-generated content: a way to REPORT objectionable
-- content, a way to BLOCK abusive users, and a timely response. It covers all of Banter, not
-- just photos.
--
-- REPORTS
--  - Filed only through report_pool_message(), which takes the SNAPSHOT itself from the row.
--    A client cannot invent the evidence, and the evidence survives the message being deleted
--    (delete_pool_message, 148, scrubs the row; the report keeps what was said).
--  - Only a member of the message's pool may report it, and not their own.
--  - One report per member per message: a second tap updates the reason rather than piling up.
--  - Only super admins read or resolve them (the Reports tab). Nothing else can see who
--    reported whom.
--
-- BLOCKS
--  - Account-wide, not per pool: blocking someone hides them wherever you share a pool.
--  - A member reads and writes only their OWN rows. The person blocked is never told and can
--    never find out — no policy lets them read a row that names them.
--  - Push routes run on the admin client and filter recipients who blocked the sender.
--  - The unread counts skip blocked senders, or a badge would count messages you can't see.
--    Both functions re-dumped from production (last written by 148) — the only change is the
--    NOT EXISTS line.

-- 1. Blocks ------------------------------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.users(user_id) on delete cascade,
  blocked_id uuid not null references public.users(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

comment on table public.user_blocks is
  'A member hiding another member, account-wide. Only the blocker can see the row. See 158.';

create index if not exists user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "members read their own blocks" on public.user_blocks;
create policy "members read their own blocks" on public.user_blocks
  for select to authenticated
  using (blocker_id = (select u.user_id from public.users u where u.auth_user_id = (select auth.uid())));

drop policy if exists "members add their own blocks" on public.user_blocks;
create policy "members add their own blocks" on public.user_blocks
  for insert to authenticated
  with check (blocker_id = (select u.user_id from public.users u where u.auth_user_id = (select auth.uid())));

drop policy if exists "members remove their own blocks" on public.user_blocks;
create policy "members remove their own blocks" on public.user_blocks
  for delete to authenticated
  using (blocker_id = (select u.user_id from public.users u where u.auth_user_id = (select auth.uid())));

-- No UPDATE policy: a block is added or removed, never edited.
revoke all on public.user_blocks from anon;
revoke update on public.user_blocks from authenticated;

-- 2. Reports -----------------------------------------------------------------------------------
create table if not exists public.pool_message_reports (
  report_id         uuid primary key default gen_random_uuid(),
  -- SET NULL, not CASCADE: a report outlives its message (the snapshot is the evidence).
  message_id        uuid references public.pool_messages(message_id) on delete set null,
  pool_id           uuid not null references public.pools(pool_id) on delete cascade,
  reporter_id       uuid not null references public.users(user_id) on delete cascade,
  reported_user_id  uuid references public.users(user_id) on delete set null,
  reason            text not null
    check (reason in ('spam', 'offensive', 'harassment', 'inappropriate_image', 'other')),
  details           text check (char_length(details) <= 500),
  content_snapshot  text not null,
  type_snapshot     text not null,
  metadata_snapshot jsonb not null default '{}'::jsonb,
  status            text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolved_by       uuid references public.users(user_id) on delete set null,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (message_id, reporter_id)
);

comment on table public.pool_message_reports is
  'A member reporting a banter message. Filed only via report_pool_message() (which snapshots '
  'the message itself); read and resolved only by super admins. See 158.';

create index if not exists pool_message_reports_open_idx
  on public.pool_message_reports (created_at desc) where status = 'open';

alter table public.pool_message_reports enable row level security;

drop policy if exists "super admins read reports" on public.pool_message_reports;
create policy "super admins read reports" on public.pool_message_reports
  for select to authenticated
  using ((select public.is_super_admin()));

drop policy if exists "super admins resolve reports" on public.pool_message_reports;
create policy "super admins resolve reports" on public.pool_message_reports
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

-- No INSERT or DELETE policy: filing goes through the function below, and a report is never
-- deleted — it is dismissed.
revoke all on public.pool_message_reports from anon;
revoke insert, delete on public.pool_message_reports from authenticated;

create or replace function public.report_pool_message(
  p_message_id uuid,
  p_reason     text,
  p_details    text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid;
  v_message public.pool_messages;
  v_id      uuid;
begin
  select u.user_id into v_caller from public.users u where u.auth_user_id = (select auth.uid());
  if v_caller is null then
    raise exception 'report_pool_message: not signed in' using errcode = '42501';
  end if;

  select * into v_message from public.pool_messages where message_id = p_message_id;
  if not found then
    raise exception 'report_pool_message: no such message' using errcode = 'P0002';
  end if;

  if v_message.user_id = v_caller then
    raise exception 'report_pool_message: you cannot report your own message' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.pool_members pm
    where pm.pool_id = v_message.pool_id and pm.user_id = v_caller
  ) then
    raise exception 'report_pool_message: not a member of this pool' using errcode = '42501';
  end if;

  insert into public.pool_message_reports as r (
    message_id, pool_id, reporter_id, reported_user_id, reason, details,
    content_snapshot, type_snapshot, metadata_snapshot
  ) values (
    v_message.message_id, v_message.pool_id, v_caller, v_message.user_id, p_reason,
    nullif(left(btrim(coalesce(p_details, '')), 500), ''),
    v_message.content, v_message.message_type, coalesce(v_message.metadata, '{}'::jsonb)
  )
  on conflict (message_id, reporter_id) do update
    set reason = excluded.reason,
        details = excluded.details,
        -- A re-report of a dismissed message re-opens it.
        status = 'open',
        resolved_by = null,
        resolved_at = null,
        created_at = now()
  returning r.report_id into v_id;

  return v_id;
end;
$$;

comment on function public.report_pool_message(uuid, text, text) is
  'Files (or re-files) a report on a banter message. Members of the pool only, never on your '
  'own message. The snapshot is taken from the row, not the caller. See 158.';

revoke execute on function public.report_pool_message(uuid, text, text) from public, anon;
grant execute on function public.report_pool_message(uuid, text, text) to authenticated;

-- 3. Unread counts skip blocked senders ---------------------------------------------------------
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
    AND NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.blocker_id = p_user_id AND b.blocked_id = pm.user_id)
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
      AND NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.blocker_id = p_user_id AND b.blocked_id = pm.user_id)
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
