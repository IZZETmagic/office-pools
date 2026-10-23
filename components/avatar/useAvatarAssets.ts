'use client'

// =============================================================
// Loading the avatar art
// =============================================================
// The asset markup is FETCHED from /avatar-assets.json rather than imported, so 564 KB of SVG
// never enters a JavaScript bundle. Regenerate it with:
//     uv run assets/character-base/nano/build-builder.py
//
// ⭐ ONE HOOK, TWO HOSTS. The admin tab and the profile builder need exactly the same fetch,
// the same loading state and the same error. Duplicating it would mean a rebuilt bundle going
// stale on precisely one of the two surfaces, which reads as "my change didn't work" rather
// than as a caching problem.
//
// ⚠⚠ THE ADMIN USED `cache: 'no-store'` AND A MEMBER MUST NOT. That was right for one person
// regenerating a build artefact and watching for it to change; it is wrong for a member who
// opens the page repeatedly, because the url never changes when the bundle is rebuilt. The
// caching is now the SERVER's job — see the `headers()` rule for /avatar-assets.json in
// next.config.ts, which sets a short max-age with stale-while-revalidate. It cannot be
// `immutable` on a fixed path: a deploy that regenerates the art would serve the old art
// forever. A content-hashed filename is the durable answer and is not built yet.
//
// Over the wire this is ~169 KB gzipped, which Vercel does automatically and the dev server
// does not — so it looks six times heavier locally than it is in production.
//
// ⭐⭐ ONE FETCH PER PAGE, NOT PER CALLER. Banter draws an avatar beside every run of messages;
// a fetch per hook would parse 564 KB of JSON once PER ROW, and hand each row its own copy, so
// nothing keyed on the bundle (lib/avatar/faceCache.ts) could ever be shared. The bundle is
// loaded once into module scope, the same as the app's hook. A failed load is NOT kept, so the
// next caller tries again.
// =============================================================

import { useEffect, useState } from 'react'
import type { AvatarAssets } from '@/lib/avatar/compose'

export type AvatarAssetsState = {
  assets: AvatarAssets | null
  error: string | null
}

let loaded: AvatarAssets | null = null
let inflight: Promise<AvatarAssets> | null = null

function loadAvatarAssets(): Promise<AvatarAssets> {
  if (!inflight) {
    inflight = fetch('/avatar-assets.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then((d: AvatarAssets) => {
        loaded = d
        return d
      })
      .catch((e) => {
        inflight = null
        throw e
      })
  }
  return inflight
}

/**
 * @param enabled  false = don't fetch. A chat in which nobody has built an avatar should never
 *                 download the art; `MemberFace` passes whether this member has a build.
 */
export function useAvatarAssets(enabled = true): AvatarAssetsState {
  // ⚠ `loaded` is null during server rendering and the first hydrating render (the module has
  // only just loaded), so this cannot mismatch; on a client-side navigation it is the bundle an
  // earlier page already paid for.
  const [assets, setAssets] = useState<AvatarAssets | null>(loaded)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || assets) return
    let cancelled = false
    loadAvatarAssets()
      .then((d) => {
        if (!cancelled) setAssets(d)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(`Could not load the avatar art (${e.message}).`)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, assets])

  return { assets, error }
}
