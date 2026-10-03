-- =============================================================================================
-- 157 — A captain can disband a crew, and restore it
-- =============================================================================================
-- Ryan's calls, 2026-10-02:
--   · "Disband crew" — the captain only.
--   · A disbanded crew DISAPPEARS for everyone in it, like a crew whose last member left.
--   · The captain can RESTORE it, members as they were — a mis-tap is recoverable. So the captain
--     alone still sees it (My Crews, "Disbanded · only you can see this").
--   · A crew pool still running carries on as an ordinary private pool; saved spots nobody has taken
--     are released.
--
-- Until now a crew closed one way — its last member left — and `closed_at` said all there was to
-- say. Now there are two, and only one of them can be undone, so the crew records WHY and WHO:
--   emptied    the last member left — nobody is left to restore it
--   disbanded  the captain disbanded it — that captain can restore it
--
-- Crews still close, never delete (154). Additive; production had no closed crew when this ran,
-- and the backfill below covers any that appear before it does.
-- =============================================================================================

alter table public.crews
  add column closed_by uuid references public.users (user_id) on delete set null,
  add column closed_reason text check (closed_reason in ('emptied', 'disbanded'));

update public.crews set closed_reason = 'emptied' where closed_at is not null and closed_reason is null;

-- A reason exactly when closed. (closed_by may be NULL on a closed crew: an emptied crew records no
-- actor, and a disbander's account can be deleted.)
alter table public.crews
  add constraint crews_closed_reason_pair check ((closed_at is null) = (closed_reason is null));

comment on column public.crews.closed_reason is
  'Why it closed: emptied (the last member left) or disbanded (its captain disbanded it, and that '
  'captain can restore it). NULL while open. See 157.';
comment on column public.crews.closed_by is
  'Who disbanded it. NULL while open, for an emptied crew, or once that account is deleted. See 157.';
