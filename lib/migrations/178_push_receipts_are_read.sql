-- =============================================================
-- 178 — PUSH RECEIPTS ARE READ
-- =============================================================
-- N4, step 3 (Ryan, 2026-10-07: "Push then continue with the next item").
--
-- An Android push goes through Expo, which answers at once with a TICKET (it
-- took the message) and, minutes later, a RECEIPT: whether Google's FCM took it
-- in turn. A phone the app was uninstalled from turns up in the receipt as
-- DeviceNotRegistered, and Expo's rule is to stop sending to it. The ticket's
-- own errors already remove a token at send time (lib/push/expo-push.ts), as
-- APNs's 410 does for iPhones; receipts were never read, so a phone that only
-- the receipt reports as gone stayed on file for good.
--
-- The delivery record (176) keeps every ticket id. Every 15 minutes the
-- push-receipts job (/api/cron/push-receipts, lib/push/receipts.ts) asks Expo
-- about the rows at least 15 minutes old — Expo's advice — that are not yet
-- checked, marks each with Expo's answer, and removes the tokens Expo calls
-- DeviceNotRegistered. Expo keeps a receipt 24 hours; a row past that is
-- marked 'unavailable' rather than asked about forever. Nothing here sends.
--
-- ⚠ APPLY AFTER THE DEPLOY THAT ADDS THE ROUTE, or the job posts to a 404
-- every 15 minutes. The columns are read only by that route.
-- =============================================================

alter table public.notification_deliveries
  add column receipt_status text,
  add column receipt_checked_at timestamptz,
  add constraint notification_deliveries_receipts_are_expo check (receipt_status is null or provider = 'expo');

comment on column public.notification_deliveries.receipt_status is
  'Expo''s receipt for an Android push: ok, its error code (DeviceNotRegistered, MessageTooBig, MessageRateExceeded, MismatchSenderId, InvalidCredentials), or unavailable once Expo no longer holds it. Migration 178.';

-- What the job reads: Expo rows the provider took, not yet checked, oldest first.
create index notification_deliveries_receipt_due on public.notification_deliveries (created_at)
  where provider = 'expo' and status = 'sent' and receipt_checked_at is null;

-- One statement for a whole batch of answers. Keyed on the full primary key, so
-- each update lands in one partition; a row already checked is left alone.
create or replace function public.notification_deliveries_mark_receipts(p_marks jsonb)
returns integer
language sql
security definer
set search_path = public
as $$
  with marks as (
    select *
    from jsonb_to_recordset(p_marks) as m(created_at timestamptz, delivery_id bigint, receipt_status text)
  ), marked as (
    update public.notification_deliveries d
    set receipt_status = marks.receipt_status,
        receipt_checked_at = now()
    from marks
    where d.created_at = marks.created_at
      and d.delivery_id = marks.delivery_id
      and d.receipt_checked_at is null
    returning 1
  )
  select count(*)::integer from marked;
$$;

revoke all on function public.notification_deliveries_mark_receipts(jsonb) from public, anon, authenticated;
grant execute on function public.notification_deliveries_mark_receipts(jsonb) to service_role;

select cron.schedule('push-receipts', '*/15 * * * *', $$
        SELECT net.http_post(
          url := 'https://sportpool.io/api/cron/push-receipts',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_cron_secret'),
            'Content-Type',  'application/json'
          ),
          timeout_milliseconds := 30000
        );
$$);
