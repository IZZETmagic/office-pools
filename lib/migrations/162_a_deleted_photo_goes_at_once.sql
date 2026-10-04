-- 162 — a deleted photo goes at once
--
-- 160 queues a photo's file when its message is deleted; something then has to call
-- /api/banter/media/sweep to remove it through the Storage API. The clients were that
-- something — and on 2026-10-04 an app delete (00:31:28 UTC) reached the database but no
-- storage removal followed: the client's sweep call never did its job, so the file waited for
-- the hourly cron (161). "Deleted" must mean gone now, whichever app, browser or admin tab
-- did it, and whether or not that device's own request lands.
--
-- So the DATABASE asks for the sweep: a STATEMENT-level trigger on pool_messages, after any
-- statement that soft-deletes (UPDATE OF deleted_at) or hard-deletes rows, fires ONE
-- net.http_post at the sweep route if the queue is not empty — the exact request the cron
-- sends (161), same vault secret.
--
--  - One request per STATEMENT, not per photo: deleting a pool with 100 photos sends one.
--  - pg_net queues the request inside this transaction and sends it after COMMIT — a delete
--    that rolls back sends nothing.
--  - Fire-and-forget: a failed request never blocks or fails the delete. Anything it misses,
--    the hourly cron (161) still sweeps.
--  - The clients' own sweep calls stay; they are now redundant, not load-bearing.
--
-- ⚠ Preview (dev.sportpool.io) shares this production database, so a delete made on dev also
-- sweeps via https://sportpool.io — correct, it is the same bucket.

create or replace function public.request_banter_media_sweep()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.banter_media_deletions) then
    perform net.http_post(
      url := 'https://sportpool.io/api/banter/media/sweep',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sync_cron_secret'),
        'Content-Type',  'application/json'
      ),
      timeout_milliseconds := 30000
    );
  end if;
  return null;
end;
$$;

comment on function public.request_banter_media_sweep() is
  'After a statement deletes pool_messages, asks /api/banter/media/sweep (via pg_net, after '
  'commit) to remove queued photo files at once. See 162; the hourly cron (161) is the backstop.';

revoke execute on function public.request_banter_media_sweep() from public, anon, authenticated;

drop trigger if exists request_banter_media_sweep_on_soft_delete on public.pool_messages;
create trigger request_banter_media_sweep_on_soft_delete
  after update of deleted_at on public.pool_messages
  for each statement
  execute function public.request_banter_media_sweep();

drop trigger if exists request_banter_media_sweep_on_delete on public.pool_messages;
create trigger request_banter_media_sweep_on_delete
  after delete on public.pool_messages
  for each statement
  execute function public.request_banter_media_sweep();
