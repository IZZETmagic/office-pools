import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { composeAvatar, type AvatarAssets } from '@/lib/avatar/compose'
import { readStoredAvatarBuild, toAvatarConfig } from '@/lib/avatar/storedConfig'
import { avatarBackgroundFor, avatarIndexFor } from '@/lib/design/avatarGradient'
import ASSETS from '@/public/avatar-assets.json'

// =============================================================
// GET /api/avatar/me — the caller's own avatar, composed
// =============================================================
// ⭐⭐ THIS EXISTS SO THERE IS NEVER A FOURTH COMPOSITOR. The React Native app cannot import from
// the repo root — there is no metro.config.js and `mobile/tsconfig.json` maps `@/*` to `mobile/`
// alone, which is why `lib/design/*` is hand-mirrored over there with a drift guard.
// `lib/avatar/compose.ts` is 1,071 lines of pure, dependency-free TypeScript and WOULD run on the
// phone, but copying it would make a fourth implementation of the one thing
// `scripts/verify-avatar-parity.mjs` exists to police. So the server composes and the phone draws
// the string with `<SvgXml>`, exactly as `mobile/components/match/Jersey.tsx` already does.
//
// ⚠⚠ THE PHONE CALLS PRODUCTION BY DEFAULT. `mobile/lib/api.ts` sets
// PROD_BASE_URL = 'https://sportpool.io', and the avatar work is not there yet — measured,
// /avatar-assets.json is 404 on prod and 200 on dev. Until the branch merges, a device has to be
// pointed at dev with EXPO_PUBLIC_API_BASE_URL or this route 404s and the card falls back to
// initials. That fallback is the correct behaviour, which is also what makes the failure quiet.
//
// ⚠ "me", not "[userId]", ON PURPOSE. Composing an arbitrary member's avatar from an id would be
// an enumeration surface — it would answer "does this user exist" and hand back their likeness —
// for a screen that only ever needs the caller's own face. When avatars reach a leaderboard that
// question gets reopened deliberately, with a batch endpoint scoped to a pool's membership.
// =============================================================

/**
 * ⚠ IMPORTED AT MODULE SCOPE, NOT READ PER REQUEST. 563 KB of JSON parses once per warm instance
 * instead of once per call. It also makes the bundle a BUILD dependency, so Vercel's file tracing
 * carries it into the function automatically — `fs.readFile` from `public/` would depend on
 * `outputFileTracingIncludes` and would fail at runtime rather than at build time if it were
 * missing.
 *
 * ⚠ The `as` is load-bearing: TypeScript widens the imported JSON's string maps to
 * `Record<string, string>`, which is structurally what `AvatarAssets` wants, but the optional
 * slots (`hairBackfill`, `frontShirt`, …) only line up once it is asserted.
 */
const A = ASSETS as unknown as AvatarAssets

export type AvatarMeResponse = {
  /** The composed SVG, or null when this member has not built a face. */
  svg: string | null
  /** The member's ground colour, so the phone does not need the palette mirrored to it. */
  ground: string
  /** False when there is no build to draw — the caller shows initials. */
  hasAvatar: boolean
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  // ⚠⚠ THE ERROR IS CAPTURED, NOT DISCARDED. `const { data } = await …` is this repo's most
  // repeated bug: PostgREST returns 400s in `error` with `data` as null, so swallowing it renders
  // a permanent empty default that looks exactly like "this member has no avatar". If the read
  // fails we still answer — the card falls back to initials either way — but it is logged rather
  // than silently indistinguishable from the empty state.
  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('avatar_colour, avatar_build')
    .eq('user_id', userData.user_id)
    .single()

  if (profileErr) {
    console.error('[avatar/me] could not read the profile:', profileErr.message)
  }

  // ⚠ The ground is DERIVED, never stored — migration 147. `avatarIndexFor` hashes from the user
  // id when no colour was picked, so every member has one; this is never grey.
  const ground = avatarBackgroundFor(
    avatarIndexFor(userData.user_id, profile?.avatar_colour ?? null),
  )

  // ⚠ The TOLERANT reader, deliberately. It returns null for anything this deploy cannot draw
  // rather than throwing — `composeAvatar` throws on exactly one field, an unknown `base`, and a
  // build saved after an asset rename is a real possibility while preview and production serve
  // different bundles against the same rows. A member seeing initials is a far better outcome
  // than a 500 on their own profile.
  const build = profile?.avatar_build ? readStoredAvatarBuild(profile.avatar_build, A) : null

  const body: AvatarMeResponse = {
    svg: build ? composeAvatar(toAvatarConfig(build, ground), A) : null,
    ground,
    hasAvatar: build !== null,
  }

  return NextResponse.json(body, {
    headers: {
      // ⚠ PRIVATE. This is one member's likeness resolved from their session — a shared cache
      // keyed on the URL would hand the next caller someone else's face, because the url carries
      // no id. `no-store` rather than a short max-age: the phone refetches on focus anyway, and
      // an avatar that lags a save by even a minute is the complaint this would generate.
      'Cache-Control': 'private, no-store',
    },
  })
}
