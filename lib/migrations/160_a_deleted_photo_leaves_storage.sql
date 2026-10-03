-- 160 — a deleted photo leaves storage
--
-- Step 5 of picture sharing. Deleting a photo message (delete_pool_message, 148) scrubs the ROW,
-- but the FILE stayed in `banter-media` — and anyone holding a signed URL could still open it
-- for up to an hour. Removing the file is the only thing that kills a signed URL (verified
-- 2026-10-03: the URL returns 400 once its file is gone).
--
-- ⚠⚠ SQL CANNOT DELETE THE FILE. Supabase treats storage tables as read-only from SQL, and
-- `storage.protect_delete` now raises on any direct DELETE from storage.objects. So deletion is
-- a QUEUE drained by the server through the Storage API:
--
--   1. This migration: every way a photo row stops existing ENQUEUES its path
--        - delete_pool_message → AFTER UPDATE, old.message_type = 'photo', deleted_at set
--        - a hard DELETE of the row → AFTER DELETE (pool deleted, account deleted: FK cascades)
--   2. /api/banter/media/sweep (service role) removes queued files via the Storage API and clears
--      the queue. The app calls it straight after a delete, so the photo goes at once.
--   3. A cron (161, scheduled only once the route is deployed) drains anything a client call
--      missed, and enqueues ORPHANS: uploads older than a day that no message points at — a send
--      that failed after its upload, where the client's own cleanup also failed.
--
-- The queue is server-only: RLS on, no policies, no grants to anon/authenticated.

create table if not exists public.banter_media_deletions (
  path        text primary key,
  queued_at   timestamptz not null default now(),
  attempts    integer not null default 0,
  last_error  text
);

comment on table public.banter_media_deletions is
  'banter-media files waiting to be removed through the Storage API (SQL cannot delete storage '
  'objects). Filled by triggers on pool_messages; drained by /api/banter/media/sweep. See 160.';

alter table public.banter_media_deletions enable row level security;
revoke all on public.banter_media_deletions from anon, authenticated;

create or replace function public.enqueue_banter_photo_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text := old.metadata->>'path';
begin
  if old.message_type = 'photo' and v_path is not null and v_path <> '' then
    insert into public.banter_media_deletions (path) values (v_path)
    on conflict (path) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists enqueue_banter_photo_on_soft_delete on public.pool_messages;
create trigger enqueue_banter_photo_on_soft_delete
  after update of deleted_at on public.pool_messages
  for each row
  when (old.message_type = 'photo' and old.deleted_at is null and new.deleted_at is not null)
  execute function public.enqueue_banter_photo_deletion();

drop trigger if exists enqueue_banter_photo_on_delete on public.pool_messages;
create trigger enqueue_banter_photo_on_delete
  after delete on public.pool_messages
  for each row
  when (old.message_type = 'photo')
  execute function public.enqueue_banter_photo_deletion();

-- Orphans: banter-media files older than a day that no live photo message points at. Reading
-- storage.objects is allowed; only writing it from SQL is not. Service role only.
create or replace function public.enqueue_banter_media_orphans()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.banter_media_deletions (path)
  select o.name
  from storage.objects o
  where o.bucket_id = 'banter-media'
    and o.created_at < now() - interval '1 day'
    and not exists (
      select 1 from public.pool_messages m
      where m.message_type = 'photo'
        and m.deleted_at is null
        and m.metadata->>'path' = o.name
    )
  on conflict (path) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.enqueue_banter_media_orphans() is
  'Queues banter-media uploads older than a day that no live photo message references. Run by '
  'the sweep cron. See 160.';

revoke execute on function public.enqueue_banter_media_orphans() from public, anon, authenticated;
revoke execute on function public.enqueue_banter_photo_deletion() from public, anon, authenticated;
