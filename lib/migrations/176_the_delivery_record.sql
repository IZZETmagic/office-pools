-- =============================================================
-- 176 — THE DELIVERY RECORD
-- =============================================================
-- N4, step 2 (Ryan, 2026-10-07: "do the next step then n4 step 2").
--
-- One row per message handed to a provider: each device a push went to, each
-- address an email went to — with the provider's own id for it, and whether the
-- provider took it. Written by the transports themselves (lib/push/apns.ts,
-- lib/email/send.ts), so nothing that sends can skip it — the outbox, the league
-- path until its cut-over, and invites emailed to an address alike.
--
-- What it answers that the outbox cannot:
--   * "sent to 3 of 4 phones" — the outbox holds one row per PERSON;
--   * which provider message was ours — Expo's ticket id is what step 3 asks
--     Expo about later, to find phones that have gone;
--   * sends that never touch the outbox;
--   * six months back, where the outbox keeps thirty days.
--
-- Not an attempt, so not recorded: a member skipped because their switch is
-- off, or because they have no device. The outbox records those decisions for
-- the notices it carries.
--
-- ⚠ PARTITIONED BY MONTH, KEPT SIX MONTHS (the plan's C1, 28 Sep: projected to
-- be the largest table in the database). notification_deliveries_maintain()
-- runs daily: it creates this month and the next two, and drops a month once
-- all of it is more than six months old. There is NO default partition on
-- purpose — one with rows in it blocks creating the month it overlaps.
--
-- ⚠ PERSONAL DATA. `user_id` goes to null when the account is deleted (the
-- foreign key does it). `address` is kept only when the sender knew no user — an
-- invitation to an address — and the account-delete route clears it by address.
-- Service role only; every partition gets RLS and loses the anon/authenticated
-- grants Supabase hands a new table.
-- =============================================================

create table public.notification_deliveries (
  delivery_id bigint generated always as identity,
  created_at timestamptz not null default now(),
  type_key text references public.notification_types (type_key),
  channel text not null check (channel in ('email', 'push')),
  provider text not null check (provider in ('resend', 'apns', 'expo')),
  status text not null check (status in ('sent', 'failed')),
  user_id uuid references public.users (user_id) on delete set null,
  address text,
  pool_id uuid,
  outbox_id bigint,
  push_token_id uuid,
  provider_id text,
  error text,
  primary key (created_at, delivery_id),
  constraint notification_deliveries_provider_fits_channel check ((channel = 'email') = (provider = 'resend')),
  constraint notification_deliveries_address_only_without_user check (address is null or (user_id is null and channel = 'email')),
  constraint notification_deliveries_token_only_on_push check (push_token_id is null or channel = 'push')
) partition by range (created_at);

comment on table public.notification_deliveries is
  'One row per message handed to a provider (each device, each address). Written by the transports; kept six months in monthly partitions. Migration 176.';

create index notification_deliveries_by_user on public.notification_deliveries (user_id, created_at desc) where user_id is not null;
create index notification_deliveries_by_outbox on public.notification_deliveries (outbox_id) where outbox_id is not null;
create index notification_deliveries_by_type on public.notification_deliveries (type_key, created_at desc);
create index notification_deliveries_by_address on public.notification_deliveries (address) where address is not null;

alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;
grant select, insert, update, delete on public.notification_deliveries to service_role;

-- -------------------------------------------------------------
-- The months: created ahead, dropped behind
-- -------------------------------------------------------------
create or replace function public.notification_deliveries_maintain()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  month_start date;
  part text;
  -- Everything on or after this date is kept: at least six whole months.
  keep_from constant date := (date_trunc('month', now()) - interval '6 months')::date;
  created_n int := 0;
  dropped_n int := 0;
begin
  for i in 0..2 loop
    month_start := (date_trunc('month', now()) + make_interval(months => i))::date;
    part := 'notification_deliveries_' || to_char(month_start, 'YYYY_MM');
    if to_regclass('public.' || part) is null then
      execute format(
        'create table public.%I partition of public.notification_deliveries for values from (%L) to (%L)',
        part, month_start, (month_start + interval '1 month')::date
      );
      execute format('alter table public.%I enable row level security', part);
      execute format('revoke all on public.%I from anon, authenticated', part);
      created_n := created_n + 1;
    end if;
  end loop;

  for part in
    select c.relname
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    where i.inhparent = 'public.notification_deliveries'::regclass
  loop
    -- Only partitions this function named; a month goes once all of it is older than keep_from.
    if part ~ '^notification_deliveries_[0-9]{4}_[0-9]{2}$'
       and (to_date(right(part, 7), 'YYYY_MM') + interval '1 month')::date <= keep_from then
      execute format('drop table public.%I', part);
      dropped_n := dropped_n + 1;
    end if;
  end loop;

  return format('created %s, dropped %s', created_n, dropped_n);
end;
$$;

revoke all on function public.notification_deliveries_maintain() from public, anon, authenticated;
grant execute on function public.notification_deliveries_maintain() to service_role;

select public.notification_deliveries_maintain();
select cron.schedule('notification-deliveries-maintain', '41 3 * * *', 'select public.notification_deliveries_maintain()');
