-- =============================================================
-- 173 — THE NOTIFICATION OUTBOX IS DRAINED, EVERY MINUTE
-- =============================================================
-- N3. Schedules the consumer for notification_outbox (migration 172):
-- GET/POST /api/cron/notification-outbox claims what is due, composes,
-- gates, sends — or for shadow rows, records what it would have sent — and
-- settles each row.
--
-- ⚠ APPLY ONLY ONCE THE ROUTE IS IN PRODUCTION. Before that, this job would
-- POST to a 404 every minute. Check first: an unauthenticated GET to the
-- route must answer 401, not 404.
--
-- Every minute, not every two like the league outbox: this is the retry net
-- for notices that a route sends straight away, so a failure should be
-- retried while the notice is still news. A tick with nothing due is one
-- indexed query (notification_outbox_waiting).
--
-- The secret comes from the vault, as every working web-route job here does.
-- Kill switch without a migration: sync_settings 'notification_outbox_enabled'
-- = 'false'.
-- =============================================================

select cron.schedule('notification-outbox', '* * * * *', $$
        SELECT net.http_post(
          url := 'https://sportpool.io/api/cron/notification-outbox',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_cron_secret'),
            'Content-Type',  'application/json'
          ),
          timeout_milliseconds := 60000
        );
$$);
