'use client'

// =============================================================
// A member's face, small — for a list that shows people over and over
// =============================================================
// ⭐ `MemberAvatar` beside this one draws the whole figure INLINE, which is right for one avatar
// on a profile and wrong for a list: Banter puts a face beside every run of messages, and 15–66 KB
// of inline SVG per row is the "~3.3 MB of DOM" MemberAvatar's header warns about.
//
// So this composes a member ONCE (lib/avatar/faceCache.ts), cuts it to the head with the app's
// measured crop (lib/avatar/faceCrop.ts — the same text the phone uses), and hands every row the
// same short blob: url. The browser decodes the picture once; each row is one <img>.
//
// ⭐ PROGRESSIVE, NEVER BLOCKING, NEVER THROWING — the same rules as MemberAvatar. The `fallback`
// (today's initials) shows until the art lands and forever for a member with no build, and a
// member with no build never makes this page download the art at all.
//
// ⚠ The blob urls are never revoked. They live as long as the page, one per member who has built
// an avatar (20 across the whole product today) — and a url revoked while a row still shows it
// would blank that row.
// =============================================================

import { useMemo } from 'react'
import { useAvatarAssets } from './useAvatarAssets'
import { composeAvatar } from '@/lib/avatar/compose'
import { cachedFace } from '@/lib/avatar/faceCache'
import { cropToFace } from '@/lib/avatar/faceCrop'
import { readStoredAvatarBuild, toAvatarConfig } from '@/lib/avatar/storedConfig'
import { avatarBackgroundFor, avatarIndexFor } from '@/lib/design/avatarGradient'

export function MemberFace({
  userId, avatarColour, avatarBuild, className = '', fallback,
}: {
  userId: string
  avatarColour: string | null
  avatarBuild: unknown
  /** Size and shape of the circle, e.g. `w-9 h-9 rounded-pill`. */
  className?: string
  /** What to show while the art loads, or forever if this member has not built a face. */
  fallback: React.ReactNode
}) {
  // ⚠ Unconditional, before any early return — the rules of hooks.
  const { assets } = useAvatarAssets(avatarBuild != null)

  const src = useMemo(() => {
    if (!assets || avatarBuild == null) return null
    const ground = avatarBackgroundFor(avatarIndexFor(userId, avatarColour))
    return cachedFace(assets, avatarBuild, ground, () => {
      const build = readStoredAvatarBuild(avatarBuild, assets)
      if (!build) return null
      try {
        const svg = cropToFace(composeAvatar(toAvatarConfig(build, ground), assets))
        return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
      } catch (err) {
        console.warn('[MemberFace] could not draw a stored avatar', err)
        return null
      }
    })
  }, [assets, avatarBuild, userId, avatarColour])

  if (!src) return <>{fallback}</>

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a blob: url made on this page; there is nothing for next/image to optimise
    <img src={src} alt="" draggable={false} className={`block object-cover ${className}`} />
  )
}
