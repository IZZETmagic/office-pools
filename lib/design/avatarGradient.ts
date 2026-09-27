import { contrastRatio, withLightness } from './oklch'

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
 * ⭐⭐ WHY THESE TWENTY-TWO. Ryan rejected two earlier sets. The second — 13 vivid colours plus
 * 4 lighter and 6 deeper siblings — got "those are all still too close", and the number did not
 * explain it: that set measured dE 19 at its closest, and THIS one measures 17. The metric was
 * not describing what he was reacting to.
 *
 * ⚠⚠⚠ TWO SHADES OF ONE HUE READ AS ONE COLOUR TWICE, however far apart they measure. That set
 * had TEN same-hue siblings — red/coral, yellow/butter/olive, teal/deepteal/pine — so a third
 * of the picker looked like duplicates. Every colour here is its OWN HUE. There are no siblings.
 *
 * ⭐ And the tone VARIES BETWEEN NEIGHBOURS rather than being constant. Ryan asked for colours
 * "just slightly darker than pastel", and 22 of those at one lightness sit dE 8 apart — worse
 * than what he rejected. Mixing three bands (L*82/73/64) across distinct hues takes the same
 * 22 colours from dE 8 to dE 17, because neighbours then differ in two ways instead of one.
 *
 * ⭐ THE GLOW AND THE BACKGROUND ARE NOW THE SAME VALUE. Earlier palettes needed a light stop
 * for the midnight duel ground and a separate dark one for the avatar canvas. These sit high
 * enough to read on midnight (dimmest 6.9:1) and soft enough to carry a face, so one value does
 * both — and white initials on the gradient's middle improved to 2.37 against the 1.52 that
 * shipped. Both arrays are kept because they answer different questions and may diverge again.
 *
 * 🔴🔴 AND NO COLOUR MAY SIT ON THE SKIN RAMP. A guard caught `caramel` at ΔE 4.8 from the
 * #C68642 skin tone — that member's head would have been invisible against their own
 * background. It is not a coincidence and it is not fixable by nudging: SKIN IS SOFT WARM
 * BROWN, so a soft colour in that hue region simply IS a skin tone. Pushing the three
 * offenders away turned them into vivid oranges, which destroyed the tone that was asked for.
 *
 * ⭐ Measured, the skin ramp occupies only hue 59–72° in CIELAB. So the twenty-two hues are
 * positioned AROUND that arc rather than through it, which costs almost nothing — and the
 * result is better than what shipped: ΔE 20 from the nearest skin tone against the old 16.
 *
 * ⚠ The duel shifts 72 of the 231 pairings, up from 13%, because a softer palette is a closer
 * one. Every colour still has 12 of the other 21 to shift into, so it always resolves. That
 * trade is the cost of the tone, and it is paid where the member never sees it.
 */

/** Diagonal top-left → bottom-right pairs, tuned to keep white initials legible. */
export const AVATAR_GRADIENTS: readonly (readonly [string, string])[] = [
  ['#F47A93', '#C32458'], // rose
  ['#FFC3C4', '#E74E63'], // blush
  ['#FE9F98', '#D14246'], // salmon
  ['#E98661', '#B34219'], // coral
  ['#BB9E43', '#7C6500'], // olive
  ['#BDBD71', '#747C00'], // sage
  ['#88AC52', '#477300'], // moss
  ['#BDDAA9', '#4D9528'], // fern
  ['#7EC993', '#048846'], // jade
  ['#0DB68B', '#007658'], // emerald
  ['#93E0CE', '#0E9681'], // mint
  ['#0DB3A9', '#04736D'], // teal
  ['#17CBDE', '#06828F'], // lagoon
  ['#8CDDFA', '#0591B1'], // ice
  ['#5AC3FE', '#0A7EAE'], // sky
  ['#41A6FA', '#036BAB'], // azure
  ['#BFD2FE', '#0487ED'], // powder
  ['#A6B5FF', '#3971DE'], // periwinkle
  ['#AB92EB', '#6C55C0'], // lilac
  ['#D285D3', '#9E3FA3'], // orchid
  ['#F8C1E7', '#D056B2'], // petal
  ['#EA7CB4', '#B9297E'], // pink
]

/**
 * The flat canvas tone behind a composed avatar — one per entry, SAME ORDER.
 *
 * ⚠⚠ SPREAD OVER A WIDE LIGHTNESS BAND (L* 26–58), not a flat fraction of the glow. The old
 * rule was glow L* x 0.46, which compressed every background into a narrow dark band — and that
 * destroyed the one difference a LIGHTER sibling has. `yellow` and `butter` came out dE 2.2
 * apart: two different picks, one indistinguishable avatar. Mapping the glow's lightness range
 * onto a wider background range keeps a lighter option lighter. Measured: pairs under dE 20
 * fell from 24 to 6, and the worst silhouette contrast against any skin tone is 1.03 — exactly
 * what the thirteen already shipped, so nothing regressed.
 *
 * ⚠ Same-hue siblings are still the closest pairs (yellow+butter at dE 6.8). Their duel GLOWS
 * are far apart (dE 37); it is only the darkened background that converges, because it has to
 * stay dark enough for pale skin to have an edge against it.
 *
 * ⚠ A separate list rather than a derivation. The glow stops are light so they
 * survive on the midnight duel ground; an avatar background has the opposite job,
 * because the head is pale skin and needs a dark ground to have an edge at all.
 * One value cannot do both, and a derivation would have to be mirrored into
 * `builder-template.html`, which is plain HTML with no imports and is type-checked
 * by nothing. Explicit values, pinned by a guard test, instead.
 */
export const AVATAR_BACKGROUNDS: readonly string[] = [
  '#F47A93', // rose
  '#FFC3C4', // blush
  '#FE9F98', // salmon
  '#E98661', // coral
  '#BB9E43', // olive
  '#BDBD71', // sage
  '#88AC52', // moss
  '#BDDAA9', // fern
  '#7EC993', // jade
  '#0DB68B', // emerald
  '#93E0CE', // mint
  '#0DB3A9', // teal
  '#17CBDE', // lagoon
  '#8CDDFA', // ice
  '#5AC3FE', // sky
  '#41A6FA', // azure
  '#BFD2FE', // powder
  '#A6B5FF', // periwinkle
  '#AB92EB', // lilac
  '#D285D3', // orchid
  '#F8C1E7', // petal
  '#EA7CB4', // pink
]

/** What each entry is called — for a picker, and for talking about them. */
export const AVATAR_COLOUR_NAMES: readonly string[] = [
  'rose',
  'blush',
  'salmon',
  'coral',
  'olive',
  'sage',
  'moss',
  'fern',
  'jade',
  'emerald',
  'mint',
  'teal',
  'lagoon',
  'ice',
  'sky',
  'azure',
  'powder',
  'periwinkle',
  'lilac',
  'orchid',
  'petal',
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
  return inkFromIndex(avatarIndexFor(userId, chosen))
}

/**
 * The same two steps, for a palette index that has already been decided.
 *
 * ⚠ Needed because a DUEL resolves both sides together — `duelColourIndices` may move one of
 * them off the colour their user id would give, so there is no user id left to ask.
 */
export function inkFromIndex(index: number): AvatarInk {
  const base = AVATAR_GRADIENTS[index][0]
  return { strong: withLightness(base, 0.52), soft: withLightness(base, 0.70) }
}

/**
 * The GROUND a character avatar is drawn on, for a palette index that has already been decided.
 *
 * ⭐⭐ The avatar's background IS the member's colour — migration 146 exists because "a colour you
 * were handed is not an identity", and the background is what a Showdown duel glows with. So it
 * is NOT stored in `users.avatar_build`; it is derived from `avatar_colour` here, and one column
 * remains the single source of that fact.
 *
 * ⚠ INDEX-SHAPED for the same reason as `inkFromIndex` directly above: a duel has already
 * resolved both sides through `duelColourIndices`, which may move one of them, and there is no
 * user id left to ask. A `(userId, chosen)` signature could not express the shifted case at all.
 * Ordinary callers pass `avatarIndexFor(userId, chosen)`; duel callers pass the resolved index.
 */
export function avatarBackgroundFor(index: number): string {
  return AVATAR_BACKGROUNDS[index]
}

/**
 * The two inks that can be painted ON a member's ground — see `groundInkFor`.
 *
 * ⚠⚠ BOTH ARE LITERALS AND NEITHER IS A THEME TOKEN. The ground does not change with the theme:
 * it is the member's colour, the same value under `html.dark` as under `:root`. A theme-aware
 * token (`text-ink`, `--foreground`) painted on a theme-independent background is guaranteed to
 * invert into failure in one of the two themes. Anything drawn on a member's ground is pinned
 * to these.
 */
export const GROUND_INK_DARK = '#1B2340'
export const GROUND_INK_LIGHT = '#FFFFFF'

/**
 * Which ink to paint on a member's own ground — dark or light, whichever actually reads.
 *
 * ⭐ DERIVED, NOT HARDCODED, so the answer follows the palette. Today it returns the dark ink for
 * all twenty-two, and that is a measurement rather than a preference:
 *
 *   vs #FFFFFF   1.51 (powder) .. 2.61 (rose)     — every single one FAILS 4.5:1
 *   vs #1B2340   5.90 (rose)   .. 10.19 (powder)  — every single one passes
 *
 * ⚠⚠ WHITE ON A COLOUR BANNER IS THE INSTINCTIVE CHOICE AND IT IS WRONG FOR EVERY MEMBER HERE.
 * Not one ground clears even the 3:1 allowed for large text, so it fails for the name as well as
 * for the caption under it. The old gradient profile hero did use white legitimately — it sat on
 * primary-600/700, which is dark. These twenty-two are pale-to-mid tints and the habit does not
 * carry over. The two darkest, emerald and teal, still only reach 2.60.
 *
 * So the branch below does not fire today. It exists because the palette is the kind of thing
 * that grows — and a deep colour added to it would silently make this text unreadable if the ink
 * were a constant. `avatarGradient.test.ts` pins every ground at 4.5:1 against whatever this
 * returns, so a colour that breaks the assumption fails the suite instead of shipping.
 */
export function groundInkFor(index: number): string {
  return inkOn(AVATAR_BACKGROUNDS[index])
}

/**
 * The same choice for an arbitrary colour.
 *
 * ⭐ SPLIT OUT SO THE LIGHT BRANCH IS TESTABLE. `groundInkFor` only ever sees the twenty-two, all
 * of which answer dark, so through that signature alone the light half of this function could
 * never be exercised and would rot unnoticed until the day a deep colour needed it. Given a hex
 * directly, a test can prove both branches today.
 */
export function inkOn(background: string): string {
  return contrastRatio(background, GROUND_INK_DARK) >= contrastRatio(background, GROUND_INK_LIGHT)
    ? GROUND_INK_DARK
    : GROUND_INK_LIGHT
}

// ---------------------------------------------------------------------------------------
// TWO SIDES OF A DUEL
// ---------------------------------------------------------------------------------------

/**
 * Where a colour must move to when the other side is too close to it.
 *
 * `COLOUR_SHIFT[from][against]` is the index `from` becomes so it reads clearly against
 * `against`. When they are already far enough apart it is `from` itself, so "does this pair
 * clash" and "what does it become" are one lookup.
 *
 * ⭐ A TABLE, NOT A CALCULATION, and deliberately so. The alternative is a CIELAB ΔE function
 * duplicated into the RN copy, where the two could drift silently and a duel would compose
 * differently on each platform. Numbers cannot drift without a guard test noticing. The test
 * REGENERATES this from the palette, so it also cannot fall out of step with the colours.
 *
 * ⚠ The rule that built it: walk forward from `from` through the palette — which is in hue
 * order — and take the FIRST colour at least ΔE 40 from `against`. Smallest change that works,
 * rather than jumping to the opposite of the wheel, so a shifted side still looks like a
 * near neighbour of what that member picked.
 *
 * ⚠ 9 of the 78 pairings move. Every colour has at least 10 of the other 12 to move into, so
 * this can never fail to find one.
 */
export const COLOUR_SHIFT: readonly (readonly number[])[] = [
  [4, 4, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 3],
  [4, 4, 4, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 3, 3],
  [4, 4, 4, 5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3],
  [4, 4, 4, 5, 8, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [4, 4, 4, 5, 8, 9, 10, 12, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [5, 5, 5, 5, 8, 9, 10, 12, 12, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  [6, 6, 6, 6, 8, 9, 10, 12, 12, 13, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  [7, 7, 7, 7, 8, 9, 10, 12, 12, 13, 14, 14, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7],
  [8, 8, 8, 8, 8, 9, 10, 12, 12, 13, 14, 14, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
  [9, 9, 9, 9, 9, 9, 10, 12, 12, 13, 14, 14, 15, 9, 9, 9, 9, 9, 9, 9, 9, 9],
  [10, 10, 10, 10, 10, 10, 10, 12, 12, 13, 14, 14, 15, 18, 10, 10, 11, 10, 10, 10, 10, 10],
  [11, 11, 11, 11, 11, 11, 11, 12, 12, 13, 14, 14, 15, 18, 11, 11, 11, 11, 11, 11, 11, 11],
  [12, 12, 12, 12, 12, 12, 12, 12, 12, 13, 14, 14, 15, 18, 18, 12, 19, 12, 12, 12, 12, 12],
  [13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 14, 14, 15, 18, 18, 19, 19, 21, 13, 13, 13, 13],
  [14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 15, 18, 18, 19, 19, 21, 14, 14, 14, 14],
  [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 18, 18, 19, 19, 21, 0, 15, 15, 15],
  [16, 17, 16, 16, 16, 16, 16, 16, 16, 16, 17, 16, 17, 18, 18, 19, 19, 21, 0, 16, 3, 16],
  [17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 18, 18, 19, 19, 21, 0, 1, 3, 17],
  [18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 18, 19, 19, 21, 0, 1, 3, 3],
  [4, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 19, 21, 0, 1, 3, 3],
  [4, 4, 4, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 21, 21, 0, 1, 3, 3],
  [4, 4, 4, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 0, 1, 3, 3],
]

/**
 * One side of a duel, for colouring purposes.
 *
 * ⚠⚠ `entryId` IS NOT "you" OR "them". Showdown's sides are VIEWER-RELATIVE — `useDuel.ts`
 * warns that `entry_a`/`entry_b` carry no meaning and are safe to flip for display. If the
 * decision below keyed off which side the viewer is, the two participants would each see the
 * other's colour changed and neither would be looking at the same duel. It keys off the entry
 * id, which every viewer agrees on.
 */
export type DuelSideColour = {
  entryId: string
  userId: string
  /** `users.avatar_colour` — the name they picked, or null/undefined if they have not. */
  chosen?: string | null
}

/**
 * The palette index each side of a duel renders in.
 *
 * ⭐⭐ WHO MOVES, when two sides are too close:
 *
 *   1. If exactly ONE of them actually PICKED the clashing colour, the other moves. A member
 *      who chose teal keeps teal against somebody who merely hashed into it — nothing is taken
 *      from the person who made a choice, which is the whole reason choosing exists.
 *   2. Otherwise — both picked it, or neither did — the side whose entry id sorts HIGHER moves.
 *      Arbitrary, but stable and identical for everyone looking.
 *
 * ⚠ Both rules are viewer-independent on purpose, so a duel composes the same for both
 * participants, for a spectator, and for a server-rendered recap card.
 *
 * ⚠⚠ A SEALED WEEK CANNOT USE THIS. Until `duelPhase().opponentVisible`, the opponent's colour
 * is deliberately withheld — it identifies them as surely as their name — so there is nothing
 * to compare against and the right-hand side stays neutral. That means a shift can only resolve
 * AT reveal. Rule 1 is what keeps that acceptable: a member who chose their colour never sees
 * it change at the reveal, because only the one who did not choose moves.
 */
export function duelColourIndices(
  a: DuelSideColour,
  b: DuelSideColour,
): { a: number; b: number } {
  const ia = avatarIndexFor(a.userId, a.chosen)
  const ib = avatarIndexFor(b.userId, b.chosen)
  if (COLOUR_SHIFT[ia][ib] === ia) return { a: ia, b: ib }

  const aPicked = isAvatarColourName(a.chosen) && AVATAR_COLOUR_NAMES.indexOf(a.chosen) === ia
  const bPicked = isAvatarColourName(b.chosen) && AVATAR_COLOUR_NAMES.indexOf(b.chosen) === ib

  const bMoves = aPicked !== bPicked ? aPicked : a.entryId < b.entryId
  return bMoves ? { a: ia, b: COLOUR_SHIFT[ib][ia] } : { a: COLOUR_SHIFT[ia][ib], b: ib }
}
