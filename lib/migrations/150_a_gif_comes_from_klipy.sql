-- 150 — a GIF comes from KLIPY
--
-- Banter gets GIFs (decided 2026-09-28: free, not a Pool Pro perk; provider KLIPY — the Tenor
-- API shut down on 30 Jun 2026). A GIF is an ordinary `pool_messages` row:
--
--   message_type = 'gif'
--   content      = '🎞️ sent a GIF'   ← what old builds, pushes and reply quotes show
--   metadata     = { provider: 'klipy', slug, title, width, height,
--                    mp4_url, gif_url, still_url }
--
-- ⚠⚠ WHY THE TRIGGER. The INSERT policy on pool_messages only checks membership, so whatever a
-- client puts in `metadata` is stored and then rendered by every other member's browser and
-- phone. Without a check a member could post ANY image URL as a "GIF": a tracking pixel that
-- logs every pool member's IP, or content KLIPY's filter would never have returned. So every
-- media URL on a gif row must be https on KLIPY's media hosts — the three KLIPY documents in
-- its network requirements (static, static1, static2.klipy.com). Anything else is rejected.
--
-- The URL is stored exactly as KLIPY returned it: their terms forbid rewriting the query
-- string or re-hosting the file, and the client loads it straight from their CDN.
--
-- `delete_pool_message` (148) turns a deleted gif into a scrubbed 'text' row with `{}`
-- metadata, so this BEFORE INSERT trigger never sees it again.

-- 1. The type ------------------------------------------------------------------------------
alter table public.pool_messages drop constraint if exists pool_messages_message_type_check;
alter table public.pool_messages add constraint pool_messages_message_type_check
  check (message_type = any (array[
    'text', 'prediction_share', 'badge_flex', 'standings_drop', 'system_event', 'gif'
  ]));

-- 2. Only KLIPY's media ------------------------------------------------------------------------
create or replace function public.pool_messages_gif_is_klipy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_meta  jsonb := coalesce(new.metadata, '{}'::jsonb);
  v_key   text;
  v_url   text;
  v_media int := 0;
begin
  if new.message_type is distinct from 'gif' then
    return new;
  end if;

  if v_meta->>'provider' is distinct from 'klipy' then
    raise exception 'pool_messages: a gif must come from klipy' using errcode = '23514';
  end if;

  if coalesce(v_meta->>'slug', '') = '' then
    raise exception 'pool_messages: a gif needs its klipy slug' using errcode = '23514';
  end if;

  if jsonb_typeof(v_meta->'width') is distinct from 'number'
     or jsonb_typeof(v_meta->'height') is distinct from 'number'
     or (v_meta->>'width')::numeric <= 0
     or (v_meta->>'height')::numeric <= 0
  then
    raise exception 'pool_messages: a gif needs a positive width and height' using errcode = '23514';
  end if;

  foreach v_key in array array['mp4_url', 'gif_url', 'still_url'] loop
    v_url := v_meta->>v_key;
    continue when v_url is null;
    if v_url !~ '^https://static[12]?\.klipy\.com/' then
      raise exception 'pool_messages: % must be a klipy media url', v_key using errcode = '23514';
    end if;
    if v_key <> 'still_url' then
      v_media := v_media + 1;
    end if;
  end loop;

  if v_media = 0 then
    raise exception 'pool_messages: a gif needs an mp4_url or a gif_url' using errcode = '23514';
  end if;

  -- Nothing else rides along: only the keys above are ever rendered, so only they are kept.
  new.metadata := jsonb_strip_nulls(jsonb_build_object(
    'provider',  'klipy',
    'slug',      v_meta->>'slug',
    'title',     left(v_meta->>'title', 200),
    'width',     (v_meta->>'width')::numeric,
    'height',    (v_meta->>'height')::numeric,
    'mp4_url',   v_meta->>'mp4_url',
    'gif_url',   v_meta->>'gif_url',
    'still_url', v_meta->>'still_url'
  ));

  return new;
end;
$$;

comment on function public.pool_messages_gif_is_klipy() is
  'A gif message may only carry https media URLs on static/static1/static2.klipy.com, plus a '
  'slug and dimensions; any other metadata key is dropped. See 150.';

drop trigger if exists pool_messages_gif_is_klipy on public.pool_messages;
create trigger pool_messages_gif_is_klipy
  before insert on public.pool_messages
  for each row execute function public.pool_messages_gif_is_klipy();
