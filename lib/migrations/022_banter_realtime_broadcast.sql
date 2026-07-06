-- Migration: banter realtime via Broadcast-from-database
-- Replaces the `postgres_changes` (Postgres CDC + RLS) subscription that the
-- mobile banter chat used with Supabase "Broadcast from the database".
--
-- Why: the realtime service's PostgresCdcRls `create_subscription` was timing
-- out under load ("IncreaseSubscriptionConnectionPool: Too many database
-- timeouts" in the realtime logs), so clients' postgres_changes subscriptions
-- never established — new messages only appeared after re-entering the pool
-- (which re-fetches over REST). Broadcast doesn't create a per-subscriber CDC
-- subscription, so it sidesteps that bottleneck and scales far better.
--
-- Design:
--   * AFTER INSERT trigger on pool_messages, and AFTER INSERT/DELETE on
--     pool_message_reactions, call `realtime.send(...)` to a PRIVATE per-pool
--     topic `pool:{pool_id}`. `realtime.send` captures its own errors, so a
--     failed broadcast can never roll back / block the triggering write.
--   * Payload is `{ "record": <row as jsonb> }` (explicit shape so the client
--     decode is deterministic). Events: message_insert / reaction_insert /
--     reaction_delete.
--   * Authorization: one SELECT policy on realtime.messages gates receipt of a
--     `pool:{id}` topic to members of that pool (mirrors the pool_messages read
--     policy). RLS is already enabled on realtime.messages with no prior
--     policies, so this is purely additive; public channels are unaffected.
--
-- Reversible: drop the two triggers, two functions, and the policy.
-- Idempotent: safe to re-run.

-- 1. pool_messages INSERT -> broadcast to pool:{pool_id} -----------------------
create or replace function public.broadcast_pool_message()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
begin
  perform realtime.send(
    jsonb_build_object('record', to_jsonb(new)), -- payload
    'message_insert',                            -- event
    'pool:' || new.pool_id::text,                -- topic
    true                                         -- private
  );
  return null;
end;
$$;

drop trigger if exists broadcast_pool_message_trigger on public.pool_messages;
create trigger broadcast_pool_message_trigger
after insert on public.pool_messages
for each row execute function public.broadcast_pool_message();

-- 2. pool_message_reactions INSERT/DELETE -> broadcast to the message's pool ---
-- (reaction rows carry message_id, not pool_id, so resolve the pool.)
create or replace function public.broadcast_pool_reaction()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_pool_id  uuid;
  v_record   jsonb;
  v_event    text;
  v_message  uuid;
begin
  if (tg_op = 'DELETE') then
    v_record  := to_jsonb(old);
    v_event   := 'reaction_delete';
    v_message := old.message_id;
  else
    v_record  := to_jsonb(new);
    v_event   := 'reaction_insert';
    v_message := new.message_id;
  end if;

  select pool_id into v_pool_id
  from public.pool_messages
  where message_id = v_message;

  if v_pool_id is not null then
    perform realtime.send(
      jsonb_build_object('record', v_record),
      v_event,
      'pool:' || v_pool_id::text,
      true
    );
  end if;
  return null;
end;
$$;

drop trigger if exists broadcast_pool_reaction_trigger on public.pool_message_reactions;
create trigger broadcast_pool_reaction_trigger
after insert or delete on public.pool_message_reactions
for each row execute function public.broadcast_pool_reaction();

-- 3. Realtime Authorization: pool members can receive their pool's topic -------
-- Text-compares the id parsed from the topic (no uuid cast, so it cannot error
-- on non-pool topics; the `like 'pool:%'` guard short-circuits those anyway).
drop policy if exists "pool members receive pool broadcasts" on realtime.messages;
create policy "pool members receive pool broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() like 'pool:%'
  and exists (
    select 1
    from public.pool_members pm
    join public.users u on u.user_id = pm.user_id
    where u.auth_user_id = (select auth.uid())
      and pm.pool_id::text = split_part(realtime.topic(), ':', 2)
  )
);
