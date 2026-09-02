// =============================================================
// One colour and one mark per competition — the pool card's rail
// =============================================================
// ⚠ MIRRORED FROM lib/design/competitionColor.ts + competitionMark.ts +
// getPoolStripe() in lib/design/poolMode.ts. Mobile is a separate npm project
// with its own lockfile, so it cannot import them. Gate R1 in
// drafts/2026-09-02_rn_league_modes_and_cards_plan.md exists to end this.
// `lib/design/__tests__/competitionMirror.guard.test.ts` fails if the two sides drift.
//
// Keyed by `tournaments.external_league_id` — the api-football league id —
// exactly as the web is, so the colour, the mark and the wizard's crest URL
// cannot come apart.
//
// ## Why the card carries a mark at all
//
// Neither pool card names its competition, so the rail is the whole answer to
// "which league is this?". Colour alone stopped scaling at seven: the rail is a
// gradient, so every colour owns a BAND of lightness rather than a point, and
// La Liga and the Bundesliga shipped 0.069 apart in OKLab — different hex
// strings, one colour on a card. The mark answers it directly.
// =============================================================

import type { ImageSourcePropType } from 'react-native';

import { adjustLightness } from './oklch';

/** api-football league ids, so the numbers below are readable. */
export const LEAGUE_ID = {
  worldCup: 1,
  championsLeague: 2,
  premierLeague: 39,
  ligue1: 61,
  bundesliga: 78,
  serieA: 135,
  laLiga: 140,
} as const;

/**
 * The single colour that stands for a competition on a pool card.
 *
 * ⚠ VALUES ARE THE WEB'S, NOT CHOICES MADE HERE. Each was placed against every
 * other in OKLab — see the header of lib/design/competitionColor.ts for why the
 * Bundesliga is a deep red rather than La Liga's bright one, and why Ligue 1
 * took the near-black the Bundesliga would otherwise pair with its red.
 */
export const COMPETITION_COLOR: Record<number, string> = {
  [LEAGUE_ID.premierLeague]: '#3D195B',
  [LEAGUE_ID.laLiga]: '#EE2737',
  [LEAGUE_ID.bundesliga]: '#7A1020',
  [LEAGUE_ID.serieA]: '#0067B1',
  [LEAGUE_ID.ligue1]: '#101215',
  [LEAGUE_ID.championsLeague]: '#050B5E',
  [LEAGUE_ID.worldCup]: '#C9A227',
};

/**
 * Fallback for a competition nobody has themed yet.
 *
 * A neutral slate rather than a guess — it reads as deliberate, and it is
 * visibly NOT one of the branded competitions, so an unthemed league looks
 * unthemed instead of looking like somebody else's.
 */
export const UNTHEMED_COMPETITION = '#4A5568';

/**
 * How far the stripe's top stop sits above the brand colour, in OKLab
 * lightness. One authored colour, two stops — see ./oklch.
 */
export const STRIPE_TOP_LIFT = 0.14;

export function getCompetitionColor(externalLeagueId: number | null | undefined): string {
  if (externalLeagueId == null) return UNTHEMED_COMPETITION;
  return COMPETITION_COLOR[externalLeagueId] ?? UNTHEMED_COMPETITION;
}

/** The rail's two gradient stops, top first. */
export function getPoolStripe(externalLeagueId: number | null | undefined): [string, string] {
  const brand = getCompetitionColor(externalLeagueId);
  return [adjustLightness(brand, STRIPE_TOP_LIFT), brand];
}

/**
 * Every competition with a mark bundled in the app.
 *
 * ⚠ `require` TAKES A LITERAL. Metro resolves these at build time, so the map
 * cannot be built from a template string the way the web's URL is — which also
 * means a competition added to COMPETITION_COLOR without a file here silently
 * gets no mark. That is the fallback below, and it is a real case rather than a
 * defensive branch: a league is a row rather than a deploy, so one can be
 * created in the admin and picked in the wizard before anyone runs
 * `scripts/build-competition-silhouettes.ts` for it.
 *
 * The World Cup is absent on purpose — its mark is an SVG, handled separately
 * in CompetitionRail, because the provider has no usable asset for league 1 and
 * there is no raster to derive.
 */
const MARK_PNG: Record<number, ImageSourcePropType> = {
  [LEAGUE_ID.championsLeague]: require('@/assets/competitions/2.png'),
  [LEAGUE_ID.premierLeague]: require('@/assets/competitions/39.png'),
  [LEAGUE_ID.ligue1]: require('@/assets/competitions/61.png'),
  [LEAGUE_ID.bundesliga]: require('@/assets/competitions/78.png'),
  [LEAGUE_ID.serieA]: require('@/assets/competitions/135.png'),
  [LEAGUE_ID.laLiga]: require('@/assets/competitions/140.png'),
};

/** The bundled PNG mark, or null for the World Cup and anything unbuilt. */
export function getCompetitionMarkPng(
  externalLeagueId: number | null | undefined,
): ImageSourcePropType | null {
  if (externalLeagueId == null) return null;
  return MARK_PNG[externalLeagueId] ?? null;
}

/** True for the one competition whose mark is drawn rather than derived. */
export function isWorldCupMark(externalLeagueId: number | null | undefined): boolean {
  return externalLeagueId === LEAGUE_ID.worldCup;
}

/** Whether this competition has a mark at all, PNG or SVG. */
export function hasCompetitionMark(externalLeagueId: number | null | undefined): boolean {
  return isWorldCupMark(externalLeagueId) || getCompetitionMarkPng(externalLeagueId) !== null;
}
