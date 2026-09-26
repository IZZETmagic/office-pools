'use client'

// =============================================================
// A member's character avatar, wherever one is shown
// =============================================================
// ⭐ PROGRESSIVE, NOT BLOCKING. The art is a 169 KB (gzipped) fetch, so this renders the
// `fallback` — today's initials — until the bundle arrives, then swaps. A member never waits on
// a network request to see their own page, and a member who has not built an avatar never pays
// for the fetch at all.
//
// ⚠⚠ IT NEVER THROWS. `readStoredAvatarBuild` returns null for anything this deploy cannot draw
// and `composeAvatar` throws on exactly one field — an unknown `base`. Preview and production
// serve different asset bundles from the same url against the same rows, so a build saved on
// dev after an asset rename WILL be read by an older bundle. The fallback is the answer, not an
// error boundary.
//
// ⚠ Beta scope: the profile page only. Putting this in a leaderboard means 50 composed SVGs at
// 15–66 KB each — ~3.3 MB of DOM — which needs a level-of-detail strategy that does not exist.
// =============================================================

import { useMemo } from 'react'
import { useAvatarAssets } from './useAvatarAssets'
import { composeAvatar } from '@/lib/avatar/compose'
import { readStoredAvatarBuild, toAvatarConfig } from '@/lib/avatar/storedConfig'
import { avatarBackgroundFor, avatarIndexFor } from '@/lib/design/avatarGradient'

/** The round-slot default: fill the width, let height follow the square viewBox. */
const DEFAULT_SVG = '[&>svg]:w-full [&>svg]:h-auto [&>svg]:block'

export function MemberAvatar({
  userId, avatarColour, avatarBuild, className = '', svgClassName = DEFAULT_SVG, fallback,
}: {
  userId: string
  avatarColour: string | null
  avatarBuild: unknown
  className?: string
  /**
   * How the composed SVG sizes itself inside the wrapper. The default fills the wrapper's WIDTH
   * and lets height follow the square viewBox, which is what a round 96px slot wants.
   *
   * ⭐ A banner wants the opposite — see `AvatarCard`, where the card is far wider than the
   * avatar and the square is sized to the card's HEIGHT instead. Overridable rather than
   * hardcoded because these two are genuinely different shapes, not one shape with a modifier.
   */
  svgClassName?: string
  /** What to show while the art loads, or forever if this member has not built a face. */
  fallback: React.ReactNode
}) {
  // ⚠ Hooks run unconditionally — an early return before this would break the rules of hooks
  // the moment someone adds a second condition.
  const { assets } = useAvatarAssets()

  const svg = useMemo(() => {
    if (!assets || avatarBuild == null) return null
    const build = readStoredAvatarBuild(avatarBuild, assets)
    if (!build) return null
    const background = avatarBackgroundFor(avatarIndexFor(userId, avatarColour))
    return composeAvatar(toAvatarConfig(build, background), assets)
  }, [assets, avatarBuild, userId, avatarColour])

  if (!svg) return <>{fallback}</>

  return (
    <div
      className={`overflow-hidden ${svgClassName} ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
