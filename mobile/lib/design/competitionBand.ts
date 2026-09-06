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
