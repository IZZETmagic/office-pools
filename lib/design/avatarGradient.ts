/**
 * Per-user avatar gradients.
 *
 * Deliberately duplicated from AVATAR_GRADIENTS in
 * mobile/components/pool-detail/BanterSheet.tsx — `mobile/**` is in
 * .vercelignore, so web code cannot import from it and still build on Vercel.
 * The same hand-mirror + test-only drift guard pattern as lib/email/brand.ts.
 *
 * The order is load-bearing: the index comes from a hash of the user id, so
 * reordering or resizing this list reassigns everyone's colour and the same
 * person would show up differently on web than in the app. Append only.
 */

/** Diagonal top-left → bottom-right pairs, tuned to keep white initials legible. */
export const AVATAR_GRADIENTS: readonly (readonly [string, string])[] = [
  ['#FF6B6B', '#EE5A6F'], // coral / rose
  ['#4ECDC4', '#44A08D'], // teal / sea
  ['#5B8AFF', '#3B6EFF'], // sky / primary blue
  ['#FFB347', '#FF8C42'], // peach / amber
  ['#A855F7', '#7C3AED'], // violet / purple
  ['#10B981', '#059669'], // emerald
  ['#F472B6', '#EC4899'], // pink
  ['#6366F1', '#4F46E5'], // indigo
  ['#FB7185', '#E11D48'], // rose / red
  ['#06B6D4', '#0891B2'], // cyan
]

/**
 * Deterministic hash → palette index, djb2 variant. Must stay byte-identical to
 * the RN copy: the whole point is that a given user lands on the same colour on
 * both platforms.
 *
 * `| 0` keeps the intermediate in int32 exactly as the RN version does — drop it
 * and large ids drift into float territory and pick a different bucket.
 */
export function hashUserIdToIndex(userId: string, count: number): number {
  let h = 5381
  for (let i = 0; i < userId.length; i++) {
    h = ((h << 5) + h + userId.charCodeAt(i)) | 0
  }
  return Math.abs(h) % count
}

/** The CSS gradient for a user's avatar. */
export function avatarGradient(userId: string): string {
  const [from, to] = AVATAR_GRADIENTS[hashUserIdToIndex(userId, AVATAR_GRADIENTS.length)]
  return `linear-gradient(135deg, ${from}, ${to})`
}

/**
 * The one flat colour that stands for a user — their avatar's first stop.
 *
 * For the places a gradient cannot go: a 6px bar, a ring, a chart segment. It
 * is the SAME colour the avatar opens with, so a blue segment beside a blue
 * face reads as one person rather than two things that happen to be blue.
 *
 * ⚠ THE FIRST STOP, NOT THE SECOND, and not a blend. Every pair in the list
 * runs light → dark, so the first is the brighter of the two and the one that
 * survives on a dark ground. Measured against `--sp-midnight` (#0B0F1A) the ten
 * first stops sit at L=0.585 (indigo) to L=0.821 (peach) — all clear of the
 * ground, so no lightening step is needed. If a future colour is added below
 * about L=0.5, use `adjustLightness` from `lib/design/oklch.ts` rather than
 * hand-picking a lighter hex, or the two platforms will drift.
 *
 * ⚠ NOT MIRRORED IN RN. The array is the thing that has to stay byte-identical
 * across platforms (`avatarGradient.test.ts` guards it); this is a web-side
 * accessor over it and adds no new colour.
 */
export function avatarColor(userId: string): string {
  return AVATAR_GRADIENTS[hashUserIdToIndex(userId, AVATAR_GRADIENTS.length)][0]
}
