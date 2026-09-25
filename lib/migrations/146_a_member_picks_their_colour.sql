-- 146 — a member picks their colour
--
-- ⭐ Stage 2 of making a member's colour their own. Until now a person's colour was
-- `hash(user_id) % AVATAR_GRADIENTS.length` — assigned, not chosen. Ryan, 2026-09-25, chose
-- that members should pick it, because the avatar's background IS the colour a Showdown duel
-- glows with, and a colour you were handed is not an identity.
--
-- ⭐⭐ IT STORES THE NAME, NOT THE INDEX. 'teal', not 9. The index is what made the old palette
-- impossible to change: the lookup is `hash % length`, so resizing the list re-colours people
-- who never touched it — measured, 10 → 20 entries moved 49.6% of members. A NAME survives
-- reordering, insertion and removal, which is the whole point of storing it. See
-- `AVATAR_COLOUR_NAMES` in lib/design/avatarGradient.ts for the thirteen.
--
-- ⚠ NULL is meaningful and is the default: it means "has not chosen", and the resolver falls
-- back to the hash. Nobody is colourless, and nobody is silently recoloured by this migration.
--
-- ⚠ NO CHECK CONSTRAINT LISTING THE NAMES, deliberately. A CHECK would pin the database to a
-- palette that is expected to grow, turning every colour addition into a migration and a deploy
-- that must be ordered against each other. Instead the app validates on write against
-- AVATAR_COLOUR_NAMES, and the resolver treats an unrecognised name exactly like NULL — so a
-- colour that is later removed degrades to the hash rather than rendering nothing. The only
-- constraint here is shape, which is what the database is actually good at enforcing.

alter table public.users
  add column if not exists avatar_colour text;

alter table public.users
  drop constraint if exists users_avatar_colour_shape_ck;

alter table public.users
  add constraint users_avatar_colour_shape_ck
  check (avatar_colour is null or avatar_colour ~ '^[a-z][a-z0-9-]{1,23}$');

comment on column public.users.avatar_colour is
  'The palette colour this member picked, by NAME (e.g. ''teal''), not by index — an index '
  'does not survive the palette changing. NULL means not chosen; the app falls back to '
  'hash(user_id). Validated against AVATAR_COLOUR_NAMES in app code, not by a CHECK, so the '
  'palette can grow without a migration. See migration 146.';

-- ⚠ No new grant or policy is needed and none is added. `authenticated` already holds a
-- TABLE-level UPDATE on public.users, which covers columns added later, and the policy
-- "Users can update own profile" (auth_user_id = auth.uid()) already scopes it to the member's
-- own row. Migration 145's trigger guards the privilege columns and deliberately does not
-- mention this one, so a member changing their own colour passes straight through.
--
-- ⚠⚠ That is exactly why 145 had to land first. Before it, this column would have been added
-- to a table whose member-write path could also set is_super_admin.
