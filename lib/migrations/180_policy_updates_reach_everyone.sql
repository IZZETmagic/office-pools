-- =============================================================
-- 180 — POLICY UPDATES REACH EVERYONE
-- =============================================================
-- Ryan, 2026-10-07 ("Okay" to: Terms and Privacy updates should be always
-- delivered, as their own type). Since migration 179 a Broadcast is News from
-- SportPool, so a member who switched News off would have missed a notice that
-- the Terms or the Privacy Policy changed — a change to what they agreed to.
--
-- policy_update is ALWAYS DELIVERED (transactional): no switch of ours stops it.
-- It goes out as a Resend Broadcast to the General segment WITHOUT the News
-- topic, so the one thing that does stop it is unsubscribing from all our email
-- — Resend never broadcasts to a contact who did that. The sentence says so.
-- The same "registry rows" markers, so registry.guard.test.ts reads these too.
-- =============================================================

insert into public.notification_types
  (type_key, category, modes, channels, is_transactional, expires, expiry_window, status, disclosure_sentence)
values
-- registry rows: begin
  ('policy_update', 'ADMIN', null, '{email}', true, 'never', null, 'live', 'When our Terms or Privacy Policy change, we email you whatever your switches say — only unsubscribing from all our email stops it.')
-- registry rows: end
on conflict (type_key) do update set
  category = excluded.category,
  modes = excluded.modes,
  channels = excluded.channels,
  is_transactional = excluded.is_transactional,
  expires = excluded.expires,
  expiry_window = excluded.expiry_window,
  status = excluded.status,
  disclosure_sentence = excluded.disclosure_sentence;
