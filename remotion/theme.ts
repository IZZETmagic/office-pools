// =============================================================
// WHAT EVERY COMPOSITION SHARES
// =============================================================
// Extracted when the second composition arrived, before the two copies could
// disagree — which is the failure this repo keeps writing headers about. The
// font load in particular MUST be one call: two `loadFont` calls for the same
// family are two resources Remotion blocks frame 0 on.
// =============================================================

import { loadFont as loadNunito } from '@remotion/google-fonts/Nunito'

import { palette } from '../lib/design/tokens'

// ⚠ Module scope, not inside a component. `loadFont` registers the font as a
// resource Remotion waits for before capturing frame 0; called during render it
// would race the first frames and ship a fallback face into the file.
//
// ⚠ Only the weights actually used. The argument-less call fetches every weight
// and subset, which is a pile of requests before the first frame can be taken.
const { fontFamily: NUNITO } = loadNunito('normal', {
  weights: ['700', '800', '900'],
  subsets: ['latin'],
})

export const FONT = `${NUNITO}, ui-rounded, system-ui, -apple-system, sans-serif`

/** The duel ground. Same `--sp-midnight` the in-app duel surfaces sit on. */
export const MIDNIGHT = palette.midnight.dark

/**
 * The loud treatment: the things on a card that carry the result.
 *
 * ⚠ MIRRORS `t-display` in app/globals.css, which these compositions cannot
 * use — they bundle outside Next, so no Tailwind utility exists here. Anton was
 * removed from both on 2026-09-01; what is left is a WEIGHT, and the two have
 * to be changed together or the app and its own share card disagree.
 *
 * ⚠ NOT UPPERCASE. It went with Anton. A rounded face set in caps at this size
 * reads as shouting rather than as a graphic.
 */
export const LOUD = {
  fontFamily: 'inherit',
  fontWeight: 900,
  letterSpacing: '-0.01em',
  lineHeight: 1.05,
} as const

export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** A hex plus alpha, for the ambient wash. `avatarInk` returns opaque hexes. */
export function hexA(hex: string, alpha: number): string {
  return `color-mix(in srgb, ${hex} ${Math.round(alpha * 100)}%, transparent)`
}

/**
 * The story safe band.
 *
 * ⚠ A story is 1080×1920 but the top and bottom ~15% belong to the platform —
 * the poster's handle over one end, the reply bar and progress pips over the
 * other. Found by rendering: spreading content across the full height put the
 * fixture line and the payout under that chrome. Everything lives in here.
 */
export const SAFE = {
  padding: 96,
  justifyContent: 'center',
  alignItems: 'center',
} as const
