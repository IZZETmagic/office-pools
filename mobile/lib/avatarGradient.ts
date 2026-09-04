// =============================================================
// A PERSON'S COLOUR, IN ONE PLACE
// =============================================================
// The shaded avatar every surface draws: a two-stop gradient chosen from the
// user's id, with their initials in white.
//
// ## ⚠⚠ THE ARRAY'S LENGTH AND ORDER ARE FROZEN
//
// The gradient is `hash(userId) % AVATAR_GRADIENTS.length`, so inserting a
// colour, removing one, or reordering them RE-COLOURS EVERY EXISTING MEMBER —
// silently, on the next app update. People recognise each other by colour in a
// busy Banter thread; changing it is a visible regression with no error and no
// migration. Append only, and only if you have thought about that.
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
 * Saturated mid-tones with enough contrast for white text at 24–68px.
 *
 * ⚠ FROZEN — read the header before touching this.
 */
export const AVATAR_GRADIENTS: readonly [string, string][] = [
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

/** The two-stop gradient for a person. */
export function gradientForUser(userId: string): readonly [string, string] {
  return AVATAR_GRADIENTS[hashUserIdToIndex(userId, AVATAR_GRADIENTS.length)];
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
