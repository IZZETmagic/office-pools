-- 159 — a photo stays in its pool
--
-- Step 2 of picture sharing. Photos live in the PRIVATE bucket `banter-media`, created through
-- the Storage API (scripts/create-banter-media-bucket.ts) — Supabase treats storage rows as
-- read-only from SQL, so this migration only adds the access rules and the message check.
--
-- PATH:  {pool_id}/{sender user_id}/{uuid}.jpg       (or .webp)
--
-- WHO CAN DO WHAT (RLS on storage.objects, this bucket only)
--  - UPLOAD: only into your OWN folder (segment 2 = your users.user_id), only inside a pool you
--    are a member of (segment 1). No UPDATE policy, so a file can never be overwritten.
--  - READ (which is also what signing a time-limited URL needs): members of that pool, and
--    super admins so a reported photo can be reviewed.
--  - DELETE via the client: only the uploader (owner_id), to clean up a send that failed after
--    the upload. Admin removal and message deletion delete files SERVER-side with the service
--    role (step 5), because a deleted file is the only way a photo really disappears — signed
--    URLs cannot be revoked before they expire.
--
-- A `photo` MESSAGE (BEFORE INSERT trigger): its metadata.path must be in the message's own
-- pool folder AND the sender's own sub-folder, must already exist in the bucket, and must come
-- with a positive width/height. Everything else in metadata is dropped. Without this, a member
-- could post a "photo" pointing at another member's upload — or at nothing.

-- 1. Message type -----------------------------------------------------------------------------
alter table public.pool_messages drop constraint if exists pool_messages_message_type_check;
alter table public.pool_messages add constraint pool_messages_message_type_check
  check (message_type = any (array[
    'text', 'prediction_share', 'badge_flex', 'standings_drop', 'system_event', 'gif', 'photo'
  ]));

-- 2. Storage access ----------------------------------------------------------------------------
-- Membership is compared as TEXT against the folder name: a malformed folder must evaluate to
-- false, never raise a uuid cast error inside a policy.
drop policy if exists "banter media: members upload to their own folder" on storage.objects;
create policy "banter media: members upload to their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'banter-media'
    and exists (
      select 1
      from public.pool_members pm
      join public.users u on u.user_id = pm.user_id
      where u.auth_user_id = (select auth.uid())
        and pm.pool_id::text = (storage.foldername(name))[1]
        and u.user_id::text = (storage.foldername(name))[2]
    )
  );

drop policy if exists "banter media: pool members read" on storage.objects;
create policy "banter media: pool members read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'banter-media'
    and (
      exists (
        select 1
        from public.pool_members pm
        join public.users u on u.user_id = pm.user_id
        where u.auth_user_id = (select auth.uid())
          and pm.pool_id::text = (storage.foldername(name))[1]
      )
      or (select public.is_super_admin())
    )
  );

drop policy if exists "banter media: uploader deletes" on storage.objects;
create policy "banter media: uploader deletes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'banter-media'
    and owner_id = (select auth.uid())::text
  );

-- 3. A photo message points at its own upload ------------------------------------------------------
create or replace function public.pool_messages_photo_is_own_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.metadata, '{}'::jsonb);
  v_path text  := v_meta->>'path';
begin
  if new.message_type is distinct from 'photo' then
    return new;
  end if;

  if v_path is null
     or v_path !~ ('^' || new.pool_id::text || '/' || new.user_id::text
                   || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$')
  then
    raise exception 'pool_messages: a photo must be in its own pool and sender folder'
      using errcode = '23514';
  end if;

  if jsonb_typeof(v_meta->'width') is distinct from 'number'
     or jsonb_typeof(v_meta->'height') is distinct from 'number'
     or (v_meta->>'width')::numeric <= 0
     or (v_meta->>'height')::numeric <= 0
  then
    raise exception 'pool_messages: a photo needs a positive width and height' using errcode = '23514';
  end if;

  -- Reading storage metadata is fine; it is WRITING it from SQL that Supabase forbids.
  if not exists (select 1 from storage.objects o where o.bucket_id = 'banter-media' and o.name = v_path) then
    raise exception 'pool_messages: that photo has not been uploaded' using errcode = '23514';
  end if;

  new.metadata := jsonb_build_object(
    'path',   v_path,
    'width',  (v_meta->>'width')::numeric,
    'height', (v_meta->>'height')::numeric
  );
  return new;
end;
$$;

comment on function public.pool_messages_photo_is_own_upload() is
  'A photo message must point at an existing banter-media file in its own pool folder and the '
  'sender''s own sub-folder; other metadata keys are dropped. See 159.';

drop trigger if exists pool_messages_photo_is_own_upload on public.pool_messages;
create trigger pool_messages_photo_is_own_upload
  before insert on public.pool_messages
  for each row execute function public.pool_messages_photo_is_own_upload();
