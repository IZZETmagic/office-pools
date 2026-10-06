-- =============================================================
-- 172 — THE NOTIFICATION OUTBOX
-- =============================================================
-- N3 of the notification plan. Ryan, 2026-10-05: "go ahead with N3."
--
-- One queue for every notification. Until now only the league notices went
-- through a queue (league_score_events); everything else was sent inline the
-- moment it happened, fire-and-forget — a failed send was simply lost, and
-- nothing recorded that it had ever been attempted.
--
-- ONE ROW PER PERSON, with its own state per channel. So a retry re-sends
-- only the channel that failed, and nothing goes out twice:
--   * dedup_key is UNIQUE — a producer that fires twice queues once;
--   * email_status / push_status record each channel separately — a row whose
--     email went and whose push failed retries the push alone;
--   * the email carries a Resend idempotency key per row, which closes the
--     last gap (a send that succeeded but was never recorded).
-- This is deliberately not N4's delivery ledger (one row per device, with
-- provider ids, partitioned): N4 still builds that. This is the work queue.
--
-- DECISION 16, MADE STRUCTURAL. expires_at is not the producer's to choose:
-- the insert trigger computes it from the registry (migration 170) — the
-- deadline the notice is about, a fixed window after the event, or never. The
-- claim function marks a row past expires_at 'expired' instead of handing it
-- out, so a backlog can never replay a stale notice — the N0 lesson.
--
-- And only a LIVE registry kind can be queued: the trigger refuses a planned
-- or retired one, and a channel the registry does not list for it.
--
-- Nobody but the service role reads or writes it. Processed rows are pruned
-- after 30 days; the history worth keeping is N4's.
-- =============================================================

create table public.notification_outbox (
  outbox_id       bigint generated always as identity primary key,
  type_key        text        not null references public.notification_types(type_key),
  -- The recipient: a member, or — only for a transactional kind — an address
  -- with no account (a Crews invitation emailed to someone not yet here).
  user_id         uuid        references public.users(user_id) on delete cascade,
  to_email        text,
  pool_id         uuid        references public.pools(pool_id) on delete cascade,
  dedup_key       text        not null,
  -- The composer's inputs. The content itself is composed at SEND time, so a
  -- notice reads the world as it is when it goes, not as it was when queued.
  payload         jsonb       not null default '{}'::jsonb,
  channels        text[]      not null default '{}',
  event_at        timestamptz not null default now(),
  deadline_at     timestamptz,
  expires_at      timestamptz,
  -- Shadow rows are composed and gated but never sent: how a new path is run
  -- beside an old one until the two agree. Their dedup_key starts 'shadow:'.
  shadow          boolean     not null default false,
  email_status    text,
  push_status     text,
  attempts        integer     not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at      timestamptz,
  processed_at    timestamptz,
  outcome         text,
  last_error      text,
  created_at      timestamptz not null default now(),
  constraint notification_outbox_dedup unique (dedup_key),
  constraint notification_outbox_recipient check ((user_id is null) <> (to_email is null)),
  constraint notification_outbox_shadow_key check (shadow = (dedup_key like 'shadow:%')),
  constraint notification_outbox_channels_check check (channels <@ array['email', 'push', 'inapp']::text[]),
  constraint notification_outbox_email_status_check check (
    email_status is null or email_status ~ '^(sent|failed|skipped:[a-z_]+|shadow:[a-z_]+)$'),
  constraint notification_outbox_push_status_check check (
    push_status is null or push_status ~ '^(sent|failed|skipped:[a-z_]+|shadow:[a-z_]+)$'),
  constraint notification_outbox_outcome_check check (
    outcome is null or outcome in ('sent', 'skipped', 'expired', 'failed', 'shadow'))
);

-- The claim's own index: only what is still waiting.
create index notification_outbox_waiting on public.notification_outbox (next_attempt_at)
  where processed_at is null;
create index notification_outbox_type_created on public.notification_outbox (type_key, created_at);

-- -------------------------------------------------------------
-- The registry decides: channels, expiry, and whether it can be queued at all.
-- -------------------------------------------------------------
create or replace function public.notification_outbox_prepare()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  t public.notification_types%rowtype;
begin
  select * into t from public.notification_types where type_key = new.type_key;
  if not found then
    raise exception 'notification_outbox: % is not in the registry', new.type_key using errcode = '23503';
  end if;
  if t.status <> 'live' then
    raise exception 'notification_outbox: % is %, not live — it cannot be queued', new.type_key, t.status
      using errcode = '23514';
  end if;
  if new.to_email is not null and not t.is_transactional then
    raise exception 'notification_outbox: % may only go to members — an address with no account has no switches',
      new.type_key using errcode = '23514';
  end if;

  -- A producer may narrow the registry's channels, never widen them.
  if cardinality(new.channels) = 0 then
    new.channels := t.channels;
  elsif not (new.channels <@ t.channels) then
    raise exception 'notification_outbox: % does not send on %', new.type_key, new.channels using errcode = '23514';
  end if;

  -- Decision 16. The producer's own expires_at, if any, is ignored.
  if t.expires = 'at_deadline' then
    if new.deadline_at is null then
      raise exception 'notification_outbox: % expires at its deadline, so deadline_at is required', new.type_key
        using errcode = '23502';
    end if;
    new.expires_at := new.deadline_at;
  elsif t.expires = 'after_window' then
    new.expires_at := new.event_at + t.expiry_window;
  else
    new.expires_at := null;
  end if;

  return new;
end;
$$;

create trigger notification_outbox_prepare
  before insert on public.notification_outbox
  for each row execute function public.notification_outbox_prepare();

-- -------------------------------------------------------------
-- Claim: expire what is stale, then hand out what is due. FOR UPDATE SKIP
-- LOCKED, so overlapping consumers — the cron, and a route sending its own
-- rows straight away — never take the same row. A claim older than five
-- minutes is treated as abandoned (the function that held it died) and the
-- row is handed out again. Pass p_ids to claim only those rows.
-- -------------------------------------------------------------
create or replace function public.notification_outbox_claim(p_limit integer default 50, p_ids bigint[] default null)
returns setof public.notification_outbox
language sql
set search_path = public
as $$
  with expired as (
    update public.notification_outbox
       set processed_at = now(), outcome = 'expired', claimed_at = null
     where processed_at is null
       and expires_at is not null and expires_at <= now()
       and (p_ids is null or outbox_id = any (p_ids))
    returning 1
  )
  update public.notification_outbox o
     set claimed_at = now(), attempts = o.attempts + 1
   where o.outbox_id in (
     select w.outbox_id from public.notification_outbox w
      where w.processed_at is null
        and w.next_attempt_at <= now()
        and (w.expires_at is null or w.expires_at > now())
        and (w.claimed_at is null or w.claimed_at < now() - interval '5 minutes')
        and (p_ids is null or w.outbox_id = any (p_ids))
      order by w.outbox_id
      limit greatest(p_limit, 0)
      for update skip locked)
  returning o.*;
$$;

-- Processed rows older than 30 days. The work queue is not the history.
create or replace function public.notification_outbox_prune()
returns integer
language sql
set search_path = public
as $$
  with gone as (
    delete from public.notification_outbox
     where processed_at is not null and processed_at < now() - interval '30 days'
    returning 1
  )
  select count(*)::integer from gone;
$$;

-- -------------------------------------------------------------
-- Service role only — no member reads this, and no member writes it.
-- -------------------------------------------------------------
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;
grant select, insert, update, delete on public.notification_outbox to service_role;

revoke all on function public.notification_outbox_prepare() from public, anon, authenticated;
revoke all on function public.notification_outbox_claim(integer, bigint[]) from public, anon, authenticated;
revoke all on function public.notification_outbox_prune() from public, anon, authenticated;
grant execute on function public.notification_outbox_claim(integer, bigint[]) to service_role;
grant execute on function public.notification_outbox_prune() to service_role;

select cron.schedule('notification-outbox-prune', '23 4 * * *', 'select public.notification_outbox_prune()');
