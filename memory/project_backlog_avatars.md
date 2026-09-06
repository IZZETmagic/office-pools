---
name: project-backlog-avatars
description: Avatars v1 — Supabase Storage bucket, `<Avatar>` component with initials fallback, upload UI on Expo + web, profile screen surface. Phase 3a.5 (between Showdown launch and Phase 3b.1).
metadata:
  type: project
---

There are no user-uploaded avatars or other identifying images in the product today. Adding them is a small, contained piece of work that unlocks meaningful product gains — most immediately, Showdown's matchup cards go from initials chips to real photos with zero animation changes. It's also the foundational step toward the longer-term **character avatars + cosmetics economy** play (see [[project-backlog-avatar-cosmetics]]).

**Why now:** Showdown launches with initials chips on name plates (see `assets/showdown-storyboard/MOTION_SPEC.md` for the design). The `<Avatar>` component is built with `src + initials fallback` semantics from day one, so when avatars exist, every surface in the app gracefully upgrades — matchup cards, banter sheet, leaderboards, members tab — without any code changes downstream.

**Why not in Phase 3a:** Phase 3a is a tight ~4-week sprint with a hard EPL Aug 15 deadline (R-01). Avatar work would compete with critical-path items (pairing engine, scoring, ledger) for the same bandwidth. Slotting it as Phase 3a.5 (post-launch) keeps the sprint focused and gives Showdown a built-in adoption nudge: "Add your photo and it shows up on your matchup card."

**How to apply:**

### Scope (~3–5 focused days)

| # | Piece | Effort | Notes |
| - | --- | --- | --- |
| 1 | Supabase Storage bucket + RLS policies | 0.5 day | One bucket `avatars`, public-read, authenticated-write-own-folder. Path: `avatars/{user_id}/avatar.webp`. |
| 2 | `<Avatar>` component (web + mobile) | 0.5 day | Props: `userId`, `displayName`, `size`. Logic: try storage URL → fall back to initials-on-colour. Colour hash: deterministic from user_id (same user, same colour, forever). |
| 3 | Mobile upload UI (Expo) | 1.5 days | `expo-image-picker` → in-app crop (1:1) → upload to Supabase. Replace existing image on re-upload. |
| 4 | Web upload UI (Next.js) | 1 day | File input → modal crop → upload. Same flow, same bucket. |
| 5 | Profile screen surface | 0.5 day | The "edit profile" surface gets an avatar field. Tap → opens upload flow. |
| 6 | Image optimization | 0.5 day | Server-side resize to 256×256 + WebP via Supabase Edge Function (or `sharp` if simpler). Originals discarded — only the optimized version is stored. |

### Schema change

Add `users.avatar_url TEXT NULL` (or `auth.users.user_metadata.avatar_url` if we keep it metadata-only). Nullable — existing users default to null, the `<Avatar>` component handles fallback. This is the **only** schema change needed.

### Surfaces that consume the new component

Once `<Avatar>` ships, the following surfaces upgrade automatically (just swap their current initials display for `<Avatar>`):

- Showdown matchup card name plates (most visible win)
- Banter sheet message bubbles
- Members tab list
- Leaderboard rows
- Profile screen header
- Activity feed entries

No animation timing changes anywhere. The reveal animation's name-plate slot is a content swap — initials chip becomes a photo circle.

### Out of scope for v1

- Moderation. Friend-and-family pools — abuse is unlikely. Add reporting later if needed.
- Animated avatars / GIFs.
- Avatar borders / frames.
- Bulk import from third parties (Gravatar, Google, social login profile pics) — could be a follow-up if adoption is low.

### Hard constraints

- **Must not break for users without avatars.** Initials fallback is non-negotiable.
- **Storage bucket must be cost-bounded.** Cap at 1MB per upload pre-optimization; optimized output is ~20KB WebP. At 10k users → ~200MB total. Comfortable on Supabase free tier; trivial on Micro tier.
- **Privacy.** Avatars are public-read by design (they appear in matchup share previews via OG image). Make this explicit in the upload UI so users don't upload sensitive photos.

### Adoption signal — what this teaches us

Track upload rate after launch. The signal feeds two downstream decisions:

1. **Are avatars worth investing in further?** If upload rate > 40% within 3 months, character avatars + cosmetics (see [[project-backlog-avatar-cosmetics]]) becomes a viable Phase 3c+ investment.
2. **Are the "characterful" reveal moods viable?** If upload rate > 60%, the Irreverent and Office-pool moods (currently ruled out — see `assets/showdown-storyboard/MOTION_SPEC.md`) become unlockable as cosmetic theme options in v1.2+.

Related: [[project-backlog-avatar-cosmetics]] (the long-term play this enables), [[project-backlog-showdown]] (Showdown depends on this for personalized matchup cards), [[project-backlog-monetization]] (cosmetics microtransactions added as a Phase 2 monetization candidate).
