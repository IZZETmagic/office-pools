// =============================================================
// The match header's band, in a competition's colour
// =============================================================
// One competition, two gradient stops, for the band behind a match's crests
// and score. Keyed on `external_league_id` like everything else that asks a
// competition for its colour — see the warning on `ResultsMatch.competitionId`.
//
// ## Why this is not `getPoolStripe()`
//
// The pool card's rail is a small block of pure brand on a light surface, and
// it can be: nothing is written on top of it. This band carries white type at
// three weights, including a 55%-opacity secondary line, and the brands are not
// remotely equal in lightness — La Liga is `#EE2737` and Ligue 1 is `#101215`.
// Painting the brand flat gives one competition a band you cannot read and
// another one you cannot tell from the old near-black header.
//
// So the band is the brand at a FIXED perceptual lightness rather than at its
// own. `withLightness` sets L in OKLab and leaves chroma alone, so every
// competition lands equally dark and equally legible while still being
// unmistakably itself. The bright brands come down, the near-black ones come
// up, and the difference between them survives.
//
// ⚠ THE SWEEP IS HORIZONTAL, AND THAT IS LOAD-BEARING. The header draws this
// twice — once on the sliding band and once on the pinned chrome row above it —
// and two stacked boxes painting the same left-to-right sweep read as one
// continuous field. Any vertical component and the join between the two layers
// becomes a visible line across the header. Same constraint, same reason, as
// `ShowdownDuelHeader`'s `Glow`.
//
// ⚠ NOT IN `competition.ts`. That file is a hand copy of the web's palette and
// `lib/design/__tests__/competitionMirror.guard.test.ts` exists to keep the two
// byte-identical in the parts that matter. The band is a mobile-only rendering
// decision with no web counterpart, so it lives here rather than adding drift
// to a file whose whole point is not having any.
// =============================================================

import { getCompetitionColor } from './competition';
import { withLightness } from './oklch';

/**
 * Where the band sits in OKLab lightness, left stop then right.
 *
 * Tuned against white-at-55% (the kickoff/venue line), which is the lowest
 * contrast the band has to carry. Going lighter than ~0.34 starts to lose it on
 * the yellows — the World Cup gold is the one that fails first.
 */
const BAND_L_LEFT = 0.30;
const BAND_L_RIGHT = 0.19;

/**
 * A competition with no colour of its own still needs a band. This is the same
 * neutral `UNTHEMED_COMPETITION` resolves to, run through the same lightness —
 * so an unthemed league looks deliberately plain rather than broken.
 */
export function getCompetitionBand(
  externalLeagueId: number | null | undefined,
): [string, string] {
  const brand = getCompetitionColor(externalLeagueId);
  return [withLightness(brand, BAND_L_LEFT), withLightness(brand, BAND_L_RIGHT)];
}

// =============================================================
// The glow — the same colour, at four depths
// =============================================================
// A single flat field reads as a slab of paint, however well chosen the colour
// is. What the old near-black header had going for it was ambient light: two
// soft blooms that made it feel lit rather than filled. This brings that back
// in the competition's own colour instead of the app's primary.
//
// ⚠ EVERY BLOB IS THE BRAND AT A DIFFERENT LIGHTNESS — never a second hue. Two
// hues in one band is a gradient between two brands, and at that point the
// header stops saying "Premier League" and starts saying "some purple". Chroma
// and hue come from `getCompetitionColor` untouched; only L moves. That is also
// what makes this work for every competition without a per-league table: the
// same four steps under La Liga red or World Cup gold read as the same object.
//
// ⚠⚠ THE GEOMETRY IS IN SCREEN SPACE, AND IT HAS TO BE. The header paints its
// fill TWICE — once on the sliding band, once on the pinned chrome row above it
// — and the base gradient gets away with that only because it is purely
// horizontal, so it is constant down the screen and the join cannot be seen.
// Blobs are not constant down the screen. They are seamless only if both layers
// draw the SAME canvas anchored to the SAME origin and each clips its own
// slice, which is why these are absolute offsets from the top of the screen
// rather than percentages of whatever box is drawing them.
// =============================================================

/**
 * Height of the glow canvas, in points from the top of the screen.
 *
 * ⚠ It must cover the band at its TALLEST — status bar, chrome row, the
 * competition line, the crests, the status badge and the tab strip. Short and
 * the glow stops in a straight horizontal line partway down the band, which is
 * the exact seam this whole arrangement exists to avoid.
 */
export const GLOW_HEIGHT = 360;

export type GlowBlob = {
  /** Centre and radii, in points from the top-left of the screen. */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: string;
  /** Opacity at the centre; every blob fades to fully transparent at its edge. */
  opacity: number;
};

/**
 * Four blooms, as fractions of the screen width.
 *
 * Placed to light the band from its corners and leave the middle — where the
 * scoreline sits — comparatively calm, so the biggest type on the screen is
 * never fighting the brightest part of the background.
 */
export function getCompetitionGlow(
  externalLeagueId: number | null | undefined,
  width: number,
): GlowBlob[] {
  const brand = getCompetitionColor(externalLeagueId);
  return [
    // Top right, the brightest — behind the status bar and the tail of the
    // competition line, where nothing needs to stay legible.
    {
      cx: width * 0.92,
      cy: 34,
      rx: width * 0.62,
      ry: 190,
      color: withLightness(brand, 0.58),
      opacity: 0.5,
    },
    // Left shoulder, mid-depth, behind the home crest.
    {
      cx: width * 0.02,
      cy: 150,
      rx: width * 0.58,
      ry: 200,
      color: withLightness(brand, 0.46),
      opacity: 0.42,
    },
    // A deep pocket low and right. Darker than the base, so the band gains a
    // shadow as well as a highlight — light in one direction only reads flat.
    {
      cx: width * 0.78,
      cy: GLOW_HEIGHT - 40,
      rx: width * 0.7,
      ry: 170,
      color: withLightness(brand, 0.12),
      opacity: 0.5,
    },
    // A small bright bubble low-left, to keep the tab strip off a dead ground.
    {
      cx: width * 0.16,
      cy: GLOW_HEIGHT - 76,
      rx: width * 0.36,
      ry: 120,
      color: withLightness(brand, 0.52),
      opacity: 0.28,
    },
  ];
}
