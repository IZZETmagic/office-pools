// =============================================================
// A PERSON'S COLOUR, IN ONE PLACE
// =============================================================
// The shaded avatar every surface draws: a two-stop gradient chosen from the
// user's id, with their initials in white.
//
// ## ⚠⚠⚠ ANY RESIZE RE-COLOURS PEOPLE — "APPEND ONLY" WAS WRONG
//
// The gradient is `hash(userId) % AVATAR_GRADIENTS.length`, so inserting a
// colour, removing one, or reordering them RE-COLOURS EXISTING MEMBERS —
// silently, on the next app update. This header used to say "append only", as
// though adding to the end were safe. It is not: appending changes the MODULUS.
// Measured over 20,000 ids, 10 → 20 entries re-colours 49.6% of members.
//
// People recognise each other by colour in a busy Banter thread, so this is a
// visible change with no error and no migration. The only way to grow the list
// without churn is to STORE each member's colour, which nothing does yet.
//
// ⚠ This file is the hand-mirror of `lib/design/avatarGradient.ts`. The web copy
// carries the full reasoning for these thirteen; a drift guard byte-compares the
// two, so change both or neither.
//
// This warning was already in `BanterSheet` when this file was extracted from
// it. It has moved here because the constant did.
//
// ## Why this is shared now
//
// It was defined twice — `BanterSheet` (10 colours, keyed per person) and
// `home/PoolCard` (3 colours, keyed by POSITION in a stack). Those are two
// different things wearing one name: Banter's is identity, the pool card's is
// decoration on a row of bubbles. The Showdown duel header needs the identity
// one, because the person you are fighting has to be the same colour in the
// corner as they are in the chat.
//
// ⚠ `home/PoolCard` is deliberately NOT switched over. Its stack is positional
// and changing it would repaint the dashboard for everyone, which is a product
// call rather than a refactor. So a member's pool-card bubble and their Banter
// avatar can still disagree — that is pre-existing, and recorded here rather
// than quietly "fixed".
// =============================================================

/**
 * Thirteen nameable colours, each at the lightness where its hue holds the most
 * chroma in sRGB, with enough contrast for white text at 24–68px.
 *
 * ⚠ Read the header before touching this. Mirrored in lib/design/avatarGradient.ts.
 */
export const AVATAR_GRADIENTS: readonly [string, string][] = [
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
];

/**
 * What each entry is called — the value stored in `users.avatar_colour`.
 *
 * ⚠ SAME ORDER as AVATAR_GRADIENTS; the index is shared. Mirrored from
 * lib/design/avatarGradient.ts and byte-compared by a drift guard, because a member's stored
 * 'teal' must resolve to the same colour on both platforms or they are two different people.
 */
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
];

/**
 * Deterministic hash → palette index. djb2 variant — small, stable, no crypto.
 *
 * The same userId always lands on the same gradient, on every device and for
 * every viewer, which is the whole point: colour is how you recognise somebody
 * before you have read their name.
 */
export function hashUserIdToIndex(userId: string, count: number): number {
  let h = 5381;
  for (let i = 0; i < userId.length; i++) {
    h = ((h << 5) + h + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % count;
}

/**
 * The palette index for a member: THEIR CHOICE if they have one, otherwise the hash.
 *
 * ⚠ Mirrors `avatarIndexFor` in lib/design/avatarGradient.ts, which carries the reasoning.
 * An unrecognised name falls back rather than throwing, because `users.avatar_colour` has no
 * CHECK listing the names and a colour dropped from the palette must degrade, not crash.
 */
export function avatarIndexFor(userId: string, chosen?: string | null): number {
  if (chosen) {
    const picked = AVATAR_COLOUR_NAMES.indexOf(chosen);
    if (picked !== -1) return picked;
  }
  return hashUserIdToIndex(userId, AVATAR_GRADIENTS.length);
}

/**
 * The two-stop gradient for a person.
 *
 * ⚠⚠ `chosen` is optional because most RN screens hold a bare user id and nothing else —
 * ShowdownDuelHeader, ShowdownLeaderboard, ScoutHeader and the rest take `userId: string`
 * props from three separate loaders. Until the stored colour is threaded to them they render
 * the hash, so a member who has picked can see two different colours in one app. Known and
 * deliberate for now; it must be finished before a picker ships to members.
 */
export function gradientForUser(userId: string, chosen?: string | null): readonly [string, string] {
  return AVATAR_GRADIENTS[avatarIndexFor(userId, chosen)];
}

/**
 * First and LAST initial — "Priya Nair" → PN, "Mary Jane Watson" → MW.
 *
 * ⚠ Last, not second. A three-word name takes its final word, which is what
 * reads as a surname. Changing this changes the letters on every avatar in the
 * product at once.
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
