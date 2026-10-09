-- =============================================================
-- 183 — A MEMBER CAN OWN AN ASSET
-- =============================================================
-- Until now every avatar asset belonged to everyone: the pickers list whatever is in
-- `public/avatar-assets.json`, and `users.avatar_build` is written from the browser with the anon
-- key, so even an asset hidden from the picker was one PATCH away. This adds ownership. A gated
-- asset can only be worn by a member holding a grant for it. Everyone else still SEES it on the
-- owner's face — the picture is public, the right to wear it is not.
--
-- ⭐ The first use is a one-off gift (2026-10-09). The same rows are meant to carry earned items
-- and, behind MONETIZATION_V2's own gate, bought ones — which is why HOW it was granted is one
-- column (`source`) rather than three mechanisms. Plan: drafts/2026-10-09_avatar_asset_grants_plan.md.
--
-- ⚠⚠ THIS AMENDS MONETIZATION_V2 BINDING RULE 17, with Ryan's approval (2026-10-09).
-- Rule 17 said: own table, own policy, "and the renderer intersects equipped-with-entitled
-- server-side". The first two halves hold here. The third is REPLACED by a write-time lock,
-- because there is no single server render to intersect at: the phone reads `avatar_build`
-- straight from Supabase (useHomeData, useMemberRoster, useMemberDetail) and composes on the
-- device. The trigger below gives the same guarantee from one place — nothing un-owned is ever
-- STORED, so nothing un-owned is ever DRAWN, by any reader, on any bundle, old or new.
--
-- ⚠ Knock-on: the `users.avatar_config` column that 147 reserved for "EQUIPPED, PAID cosmetics"
-- is not needed. An owned asset is equipped in `avatar_build` like any other, so a face stays one
-- column and one compositor input. 147's rule becomes: nothing gated lives in avatar_build
-- UNGUARDED — and this migration is the guard.
--
-- Idempotent: tables and policies are created if missing, functions are replaced, triggers are
-- dropped and recreated.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Which assets need ownership.
-- -------------------------------------------------------------
-- ⭐ `slot` uses the BUILD's key names (`facialHair`, `garment`), not the catalog's family names
-- (`facialhair`, `garments`), because the lock reads the build.
--
-- ⚠ FIVE SLOTS, and the omission is deliberate. Each of these has a "none" a revoke can fall back
-- to. Expression, eyes and mouth do not: stripping a gated expression would leave a face with no
-- eyes and no mouth, because compose draws neither when the expression slot is empty and the
-- separate eyes/mouth slots were never set.
create table if not exists public.avatar_gated_assets (
  slot       text        not null
             check (slot in ('hair', 'facialHair', 'glasses', 'earrings', 'garment')),
  asset_key  text        not null check (length(asset_key) between 1 and 64),
  note       text,
  created_at timestamptz not null default now(),
  primary key (slot, asset_key)
);

comment on table public.avatar_gated_assets is
  'Avatar assets that only a member holding a grant may wear. See 183.';

-- -------------------------------------------------------------
-- 2. Who owns what.
-- -------------------------------------------------------------
-- ⭐ Keyed on the ACCOUNT, never a pool — MONETIZATION_V2 constraint 3. A face is the same face in
-- every pool, so "do I own this here?" must never be a question.
--
-- ⚠⚠ ON DELETE RESTRICT to the gated row, NOT CASCADE. Un-gating an asset (making it free for
-- everyone) must not silently strip it off its owners' faces, which is what a cascade would do via
-- the revoke trigger in §4. Un-gating is a deliberate two-step and is not offered yet.
create table if not exists public.avatar_asset_grants (
  user_id    uuid        not null references public.users(user_id) on delete cascade,
  slot       text        not null,
  asset_key  text        not null,
  source     text        not null check (source in ('gift', 'earned', 'purchase')),
  granted_by uuid        references public.users(user_id) on delete set null,
  note       text,
  granted_at timestamptz not null default now(),
  primary key (user_id, slot, asset_key),
  foreign key (slot, asset_key)
    references public.avatar_gated_assets(slot, asset_key) on delete restrict
);

comment on table public.avatar_asset_grants is
  'Which member owns which gated avatar asset. Written by the service role only; a member reads '
  'their own rows. Deleting a row takes the asset off that member''s avatar. See 183.';

-- -------------------------------------------------------------
-- 3. THE LOCK — an asset newly put on a face must be owned.
-- -------------------------------------------------------------
-- ⭐⭐ ONLY SLOTS WHOSE VALUE CHANGED ARE CHECKED, and that is load-bearing, not an optimisation.
-- A bulk revoke (`delete … where user_id = X`) deletes every grant first and fires the §4 strips
-- afterwards, one per row. The first strip rewrites the build while the second asset is still on
-- it with its grant already gone — checking the WHOLE build would raise there and make a
-- multi-asset revoke impossible. Checking only what changed is also the honest rule: you may not
-- newly equip what you do not own. Something already on a face got there through this check, or
-- was there before gating, which §5 forbids.
--
-- ⚠ UNLIKE 145, THE SERVICE ROLE IS NOT EXEMPT. Ownership has one answer: a seed script or an admin
-- tool grants first, then equips. There is no context in which an asset goes on a face unowned.
--
-- ⚠ It RAISES rather than stripping. A member only reaches this by forging a request (the picker
-- never offers what they do not own) or on a stale app bundle, and a forged write should fail
-- loudly, not half-succeed.
create or replace function public.guard_gated_avatar_assets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot text;
  v_key  text;
begin
  if new.avatar_build is null then
    return new;
  end if;

  for v_slot, v_key in
    select g.slot, g.asset_key
      from public.avatar_gated_assets g
     where new.avatar_build ->> g.slot = g.asset_key
       and (tg_op = 'INSERT'
            or (old.avatar_build ->> g.slot) is distinct from g.asset_key)
  loop
    if not exists (
      select 1
        from public.avatar_asset_grants r
       where r.user_id   = new.user_id
         and r.slot      = v_slot
         and r.asset_key = v_key
    ) then
      raise exception 'users: % % is a gated avatar asset and % does not own it',
        v_slot, v_key, new.user_id
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

comment on function public.guard_gated_avatar_assets() is
  'Refuses to put a gated avatar asset on a member who holds no grant for it. Checks only slots '
  'whose value changed. Applies to every role, the service role included. See 183.';

drop trigger if exists users_guard_gated_avatar_assets on public.users;
create trigger users_guard_gated_avatar_assets
  before insert or update of avatar_build on public.users
  for each row
  execute function public.guard_gated_avatar_assets();

-- -------------------------------------------------------------
-- 4. A revoke takes the asset off the face, in the same transaction.
-- -------------------------------------------------------------
-- ⭐ This is what makes a write-time lock safe for refunds later: there is no state in which a
-- member wears something they no longer own, and no second step to forget.
--
-- ⚠ `null`, set explicitly, not the key removed. `isStoredAvatarBuild` accepts null for all five
-- gateable slots, and an explicit null reads the same on every bundle as "none".
create or replace function public.strip_revoked_avatar_asset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
     set avatar_build = jsonb_set(avatar_build, array[old.slot], 'null'::jsonb)
   where user_id = old.user_id
     and avatar_build ->> old.slot = old.asset_key;
  return old;
end;
$$;

comment on function public.strip_revoked_avatar_asset() is
  'When a grant is deleted, sets that slot to null on the owner''s avatar_build. See 183.';

drop trigger if exists avatar_asset_grants_strip_on_revoke on public.avatar_asset_grants;
create trigger avatar_asset_grants_strip_on_revoke
  after delete on public.avatar_asset_grants
  for each row
  execute function public.strip_revoked_avatar_asset();

-- -------------------------------------------------------------
-- 5. Nothing anyone already wears can be gated — MONETIZATION_V2 rule 18, enforced.
-- -------------------------------------------------------------
-- Rule 18: "Nothing live and free moves behind a player paywall." New art can be gated; an asset
-- that is already on someone's face cannot be taken away from them.
create or replace function public.guard_gating_a_worn_asset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wearers integer;
begin
  select count(*) into v_wearers
    from public.users u
   where u.avatar_build ->> new.slot = new.asset_key;

  if v_wearers > 0 then
    raise exception
      'avatar_gated_assets: % % is already worn by % member(s) and cannot be gated (MONETIZATION_V2 rule 18)',
      new.slot, new.asset_key, v_wearers
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.guard_gating_a_worn_asset() is
  'Refuses to gate an avatar asset that any member already wears. See 183.';

drop trigger if exists avatar_gated_assets_not_already_worn on public.avatar_gated_assets;
create trigger avatar_gated_assets_not_already_worn
  before insert or update of slot, asset_key on public.avatar_gated_assets
  for each row
  execute function public.guard_gating_a_worn_asset();

-- -------------------------------------------------------------
-- 6. The doors.
-- -------------------------------------------------------------
-- ⭐ NO MEMBER-WRITABLE PATH TO OWNERSHIP EXISTS. Both tables are read-only to `authenticated` and
-- closed to `anon`; only the service role writes, and it bypasses RLS. RLS is on as well as the
-- revoke, for 182's reason: a future blanket grant on the schema would put the privilege back, and
-- RLS with only a SELECT policy still refuses the write.
--
-- ⚠ `anon` gets NOTHING, a deliberate narrowing of the plan's first draft: the only reader is the
-- avatar editor, which is always signed in.
alter table public.avatar_gated_assets enable row level security;
alter table public.avatar_asset_grants enable row level security;

revoke all on public.avatar_gated_assets from anon, authenticated;
revoke all on public.avatar_asset_grants from anon, authenticated;
grant select on public.avatar_gated_assets to authenticated;
grant select on public.avatar_asset_grants to authenticated;
grant select, insert, update, delete on public.avatar_gated_assets to service_role;
grant select, insert, update, delete on public.avatar_asset_grants to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'avatar_gated_assets'
       and policyname = 'Members see which avatar assets are gated'
  ) then
    create policy "Members see which avatar assets are gated"
      on public.avatar_gated_assets
      for select
      to authenticated
      using (true);
  end if;

  -- ⭐ 168's idiom: auth.uid() wrapped in a select so it is evaluated once per statement.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'avatar_asset_grants'
       and policyname = 'Members read their own avatar grants'
  ) then
    create policy "Members read their own avatar grants"
      on public.avatar_asset_grants
      for select
      to authenticated
      using (
        user_id in (select u.user_id from public.users u where u.auth_user_id = (select auth.uid()))
      );
  end if;
end;
$$;

-- -------------------------------------------------------------
-- 7. 147's column comment, brought up to date.
-- -------------------------------------------------------------
comment on column public.users.avatar_build is
  'The member''s character-avatar configuration, or NULL if they have not built one. '
  'Composed at render by lib/avatar/compose.ts. Does NOT contain the background — that is '
  'derived from avatar_colour. A gated asset may appear here only for a member who owns it: '
  'the users_guard_gated_avatar_assets trigger (183) enforces that on every write.';

-- -------------------------------------------------------------
-- ⚠⚠ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- -------------------------------------------------------------
-- * It gates NOTHING. Both tables start empty, so applying it changes no member's experience.
--   An asset is gated by `scripts/grant-avatar-asset.ts`, and the gated row must exist BEFORE the
--   art reaches `public/avatar-assets.json` — otherwise there is a window where anyone can wear it.
-- * It adds no purchase path. `source = 'purchase'` is vocabulary, not a shop; MONETIZATION_V2's
--   gate on building one is untouched.
-- * It does not hide gated art from the catalog. The phone composes other members' faces from
--   that file, so the owner's face needs the art to be in it.
-- * It does not touch the pre-existing hole 145 recorded: `users` is readable by PUBLIC, so who is
--   WEARING a gated asset is visible in `avatar_build`. That is the face itself, which is public by
--   design. Who OWNS what (the grants table) is not.
