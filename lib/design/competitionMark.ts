// =============================================================
// One mark per competition, knocked out of the card's rail
// =============================================================
// Keyed by `tournaments.external_league_id`, exactly as the colour in
// competitionColor.ts and the wizard's crest URL are — so the three things a
// competition looks like cannot drift apart.
//
// ## Why the card carries a mark at all
//
// Neither pool card names its competition, so the rail is the whole answer to
// "which league is this?". That worked while there was one competition. It does
// not scale: because the rail is a gradient, every colour owns a BAND of
// lightness rather than a point, and the red and navy bands each hold about two
// competitions. Both are full at seven. La Liga and the Bundesliga shipped
// 0.069 apart in OKLab — different hex strings, one colour on the card.
//
// The mark takes colour off the critical path. It is also what makes brand-true
// colour affordable again: two near-identical reds are fine when the crest is
// doing the identifying.
//
// ## The files
//
// Built by `scripts/build-competition-silhouettes.ts` into public/competitions/
// as white-on-transparent images, so `.pool-rail` can knock them straight out
// of the competition colour with no per-competition CSS. Re-run that script
// when a competition is added.
// =============================================================

import { LEAGUE_ID } from './competitionColor'

/**
 * Competitions whose mark is an SVG rather than a PNG.
 *
 * Only the World Cup, and only because the provider has no usable asset for it
 * — league 1 returns api-football's generic placeholder shield — so its mark is
 * drawn by hand and there is no raster to derive. Everything else comes out of
 * the pipeline as a PNG.
 */
const SVG_MARKS = new Set<number>([LEAGUE_ID.worldCup])

/**
 * Every competition with a mark on disk.
 *
 * ⚠ MUST MATCH `COMPETITIONS` in scripts/build-competition-silhouettes.ts. A id
 * here with no file renders an empty rail; a file with no id here is never
 * served. The guard in __tests__/competitionMark.test.ts checks both directions
 * against the filesystem, so the two cannot drift silently.
 */
const MARKED = new Set<number>([
  LEAGUE_ID.worldCup,
  LEAGUE_ID.championsLeague,
  LEAGUE_ID.premierLeague,
  LEAGUE_ID.ligue1,
  LEAGUE_ID.bundesliga,
  LEAGUE_ID.serieA,
  LEAGUE_ID.laLiga,
])

/**
 * The mark's URL, or null for a competition nobody has built one for.
 *
 * ⚠ NULL IS A REAL CASE and the card has to handle it. A league is a row rather
 * than a deploy — a new competition can be created in the admin and picked in
 * the wizard before anyone runs the build script — so the rail must fall back
 * to the plain colour bar rather than rendering a blank 46px block. See
 * `PoolCardRail` in app/pools/PoolsClient.tsx.
 */
export function getCompetitionMark(externalLeagueId: number | null | undefined): string | null {
  if (externalLeagueId == null || !MARKED.has(externalLeagueId)) return null
  return `/competitions/${externalLeagueId}.${SVG_MARKS.has(externalLeagueId) ? 'svg' : 'png'}`
}

/** Whether this competition has a mark, without building the URL. */
export function hasCompetitionMark(externalLeagueId: number | null | undefined): boolean {
  return externalLeagueId != null && MARKED.has(externalLeagueId)
}

/** Every competition with a mark, so tests can iterate the real set. */
export const MARKED_COMPETITION_IDS: number[] = [...MARKED]
