import { withLightness } from './oklch'

/**
 * Per-user avatar gradients.
 *
 * Deliberately duplicated from AVATAR_GRADIENTS in
 * mobile/components/pool-detail/BanterSheet.tsx — `mobile/**` is in
 * .vercelignore, so web code cannot import from it and still build on Vercel.
 * The same hand-mirror + test-only drift guard pattern as lib/email/brand.ts.
 *
 * ⚠⚠⚠ "APPEND ONLY" IS NOT SAFE, AND THIS FILE USED TO SAY IT WAS. The index is
 * `hash(userId) % AVATAR_GRADIENTS.length`, so appending changes the MODULUS and
 * re-colours people nowhere near the end of the list. Measured over 20,000 ids:
 * 10 → 20 entries re-colours 49.6% of members, 10 → 16 re-colours 87.4%, 10 → 12
 * re-colours 83.1%. Any resize is a re-colour; the only question is how much. The
 * sole way to grow this without churn is to STORE each member's choice.
 *
 * ⭐ WHY THESE THIRTEEN. Ryan, 2026-09-25, on the ten that were here before: "I'd
 * like it so that the shadows and glows don't clash super often, where they have
 * blue and blue, purple and purple, and red and red." That was measurable — 6 of
 * the old 45 pairings sat under CIELAB dE 40 and read as ONE colour in a duel:
 * coral+rose 14, sky+indigo 22, teal+cyan 23, violet+indigo 24, pink+rose 27,
 * teal+emerald 30.
 *
 * Chosen by NAMEABLE CATEGORY, not by even spacing, because "clash" is a thing a
 * person judges rather than a distance. Even perceptual spacing put five cyans in
 * eighteen slots; even HSL spacing scored worse than what it replaced. Each colour
 * sits at the lightness where its hue holds the most chroma in sRGB, which is why
 * the L* values vary instead of being normalised.
 *
 * ⚠ THIRTEEN IS NOT ROUND ON PURPOSE. From sixteen names, dropping the closer of
 * each clashing pair converges here: violet and indigo fall to purple and blue,
 * amber falls to yellow. Closest surviving pair is emerald+teal at dE 25, was 14.
 *
 * ⚠ Still not clash-FREE, and no palette this size can be: 9 of the 78 pairings
 * (12%) sit under dE 40. Those are meant to be resolved by shifting one side at
 * duel time — every colour has at least 10 of the other 12 to shift into. Until
 * that lands, a duel can still show two close colours.
 */

/** Diagonal top-left → bottom-right pairs, tuned to keep white initials legible. */
export const AVATAR_GRADIENTS: readonly (readonly [string, string])[] = [
  ['#FE624E', '#CA3329'], // red
  ['#FF7000', '#BB5000'], // orange
  ['#FFC301', '#B88C00'], // yellow
  ['#94E804', '#69A701'], // lime
  ['#0AF170', '#00AD4E'], // green
  ['#01EBA4', '#06A975'], // emerald
  ['#06E8D1', '#00A796'], // teal
  ['#0ED9FC', '#009CB6'], // cyan
  ['#00B0F9', '#0080B6'], // sky
  ['#6192FF', '#226AD0'], // blue
  ['#BD74FE', '#8E4ACF'], // purple
  ['#E852FF', '#B812D0'], // magenta
  ['#FE55A7', '#CD1B7D'], // pink
]

/**
 * The flat canvas tone behind a composed avatar — one per entry, SAME ORDER.
 *
 * ⚠ A separate list rather than a derivation. The glow stops are light so they
 * survive on the midnight duel ground; an avatar background has the opposite job,
 * because the head is pale skin and needs a dark ground to have an edge at all.
 * One value cannot do both, and a derivation would have to be mirrored into
 * `builder-template.html`, which is plain HTML with no imports and is type-checked
 * by nothing. Explicit values, pinned by a guard test, instead.
 */
export const AVATAR_BACKGROUNDS: readonly string[] = [
  '#8D000A', // red
  '#773000', // orange
  '#715500', // yellow
  '#3D6600', // lime
  '#006A2D', // green
  '#006746', // emerald
  '#00665B', // teal
  '#005F70', // cyan
  '#004F72', // sky
  '#00418A', // blue
  '#5D1F9A', // purple
  '#770088', // magenta
  '#86014F', // pink
]

/** What each entry is called — for a picker, and for talking about them. */
export const AVATAR_COLOUR_NAMES: readonly string[] = [
  'red',
  'orange',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'purple',
  'magenta',
  'pink',
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

/**
 * The palette index for a member: THEIR CHOICE if they have one, otherwise the hash.
 *
 * ⭐ This is the one place the two schemes meet, and every accessor goes through it so they
 * cannot disagree. A member who has picked is that colour everywhere; a member who has not is
 * exactly as they were before — nobody is left colourless and nobody is silently moved.
 *
 * ⚠⚠ AN UNRECOGNISED NAME FALLS BACK RATHER THAN THROWING. `users.avatar_colour` has no CHECK
 * listing the names (migration 146 explains why), so a colour dropped from the palette leaves
 * stored rows pointing at nothing. Degrading to the hash means those members look like they
 * never chose, which is recoverable; throwing would take out every surface that renders them.
 *
 * ⚠ `chosen` is OPTIONAL on purpose. Several leaf components — the community message rows, most
 * of the RN screens — hold a bare user id and no way to reach the stored value yet. They keep
 * working on the hash until the value is threaded to them. That is a KNOWN half-wired state,
 * not an oversight: while it lasts, a member who has picked can see their chosen colour on one
 * surface and their hashed colour on another. Finish the threading before shipping the picker.
 */
export function avatarIndexFor(userId: string, chosen?: string | null): number {
  if (chosen) {
    const picked = AVATAR_COLOUR_NAMES.indexOf(chosen)
    if (picked !== -1) return picked
  }
  return hashUserIdToIndex(userId, AVATAR_GRADIENTS.length)
}

/** Is this a colour a member is allowed to store? Used on the WRITE path. */
export function isAvatarColourName(value: unknown): value is string {
  return typeof value === 'string' && AVATAR_COLOUR_NAMES.includes(value)
}

/** The CSS gradient for a user's avatar. */
export function avatarGradient(userId: string, chosen?: string | null): string {
  const [from, to] = AVATAR_GRADIENTS[avatarIndexFor(userId, chosen)]
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
export function avatarColor(userId: string, chosen?: string | null): string {
  return AVATAR_GRADIENTS[avatarIndexFor(userId, chosen)][0]
}

/** A user's colour, adjusted so it survives on a light card and a dark one. */
export type AvatarInk = {
  /** Fills in either theme, and text on a LIGHT surface. */
  strong: string
  /**
   * Text on a DARK surface, where `strong` goes muddy.
   *
   * Also the right step for an ambient WASH on a dark ground, for a reason
   * that has nothing to do with text: every colour is normalised to the same
   * lightness, so ten different people produce ten corners of equal weight.
   * The raw stops span L=0.585 to L=0.821, and at a fixed alpha that makes a
   * peach corner visibly brighter than an indigo one — which on a duel card
   * reads as one side winning.
   */
  soft: string
}

/**
 * The two steps of a user's colour that a normal card can use.
 *
 * `avatarColor` is the raw stop and is right on the midnight duel card, where
 * everything is bright against near-black. A `Card` is #FFFFFF in light and
 * #1C2030 in dark, and the raw stops fail there in BOTH directions: peach
 * (L=0.82) as text on white is unreadable, and indigo (L=0.59) as text on the
 * dark card is nearly as bad. A single colour cannot serve both grounds, so
 * this returns the two the themes need.
 *
 * ⚠ THE NUMBERS ARE MEASURED, NOT PICKED. WCAG contrast for all ten colours:
 *
 *   L=0.52 vs #FFFFFF   5.17 (emerald) .. 6.23 (violet)
 *   L=0.70 vs #1C2030   5.55 (pink)    .. 6.45 (emerald)
 *
 * so every colour clears 4.5:1 on its own ground with room to spare. 0.52 also
 * serves as a FILL under white text — a fill's contrast is against the white
 * text, which is the same figure as the first row — which is why `strong` does
 * both jobs and there is no third step.
 *
 * Derived rather than hand-listed so a colour added to the palette, or one a
 * member eventually picks on their profile, gets the same treatment for free.
 */
export function avatarInk(userId: string, chosen?: string | null): AvatarInk {
  const base = avatarColor(userId, chosen)
  return { strong: withLightness(base, 0.52), soft: withLightness(base, 0.70) }
}
