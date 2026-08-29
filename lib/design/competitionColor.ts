// =============================================================
// One colour per competition
// =============================================================
// Keyed by `tournaments.external_league_id` — the api-football league id —
// rather than by a slug of our own. Three reasons, in order:
//
//   1. It is already the key for the OTHER visual an admin sees per
//      competition. `providerCrest(leagueId)` in CreatePoolModal builds the
//      crest URL from exactly this number, so the crest and the colour are
//      looked up the same way and cannot drift apart.
//   2. It is populated on every row already — World Cup 1, Premier League 39,
//      La Liga 140, Serie A 135, Bundesliga 78 — and on `league_seasons` too,
//      so either table can answer the question.
//   3. It is the provider's identifier, so it survives us renaming a
//      competition, changing a slug, or running a second season.
//
// ⚠ THESE ARE NOT IN THE DATABASE, deliberately for now. A colour column would
// be a migration, a backfill and an admin surface for a decision that changes
// about once a year and belongs with the design tokens rather than with the
// fixture data. When a competition needs to be re-themed without a deploy, that
// is the moment to move it — not before.
//
// ⚠ AND THEY DISAGREE WITH app/competitions.ts, which has the Premier League as
// BLUE (#667EEA → #3B6EFF). That file is the marketing strip on the landing
// page and predates any league actually shipping; the blue was a placeholder
// picked when the World Cup was the only real competition. Ryan's call
// (2026-08-29) is the real Premier League purple, which is what this file uses.
// The landing strip should follow, and until it does the two surfaces will show
// different purples — worth fixing, out of scope for the card work.
// =============================================================

/** api-football league ids, so the numbers below are readable. */
export const LEAGUE_ID = {
  worldCup: 1,
  championsLeague: 2,
  premierLeague: 39,
  ligue1: 61,
  bundesliga: 78,
  serieA: 135,
  laLiga: 140,
} as const

/**
 * The single colour that stands for a competition on a pool card.
 *
 * One value, not a gradient: it is the TOP of the stripe and the mode supplies
 * the bottom, so a second stop here would be a third colour in a five-pixel
 * bar. Where a competition's brand is a lockup of several colours, this is the
 * one a person would name if asked what colour that league "is".
 */
const COMPETITION_COLOR: Record<number, string> = {
  // The Premier League's own purple. Their brand palette pairs it with a cyan
  // and a pink, but the purple is the one that reads as "Premier League" alone.
  [LEAGUE_ID.premierLeague]: '#3D195B',
  [LEAGUE_ID.laLiga]: '#EE2737',
  [LEAGUE_ID.bundesliga]: '#D20515',
  [LEAGUE_ID.serieA]: '#0067B1',
  // Ligue 1's current identity is essentially monochrome, so this is the navy
  // it uses where black would disappear — which on a dark card it would.
  [LEAGUE_ID.ligue1]: '#091C3E',
  [LEAGUE_ID.championsLeague]: '#0B1E64',
  // The World Cup's mark is a trophy; gold is the honest answer for it, and it
  // is the one competition colour that already exists in the app, on the
  // landing strip.
  [LEAGUE_ID.worldCup]: '#C9A227',
}

/**
 * Fallback for a competition nobody has themed yet.
 *
 * A neutral slate rather than a guess. It reads as deliberate beside the mode
 * colour below it, and — the point — it is visibly NOT one of the branded
 * competitions, so an unthemed league looks unthemed instead of looking like
 * somebody else's. `getCompetitionColor` returning this is the signal to add a
 * row above.
 */
export const UNTHEMED_COMPETITION = '#4A5568'

export function getCompetitionColor(externalLeagueId: number | null | undefined): string {
  if (externalLeagueId == null) return UNTHEMED_COMPETITION
  return COMPETITION_COLOR[externalLeagueId] ?? UNTHEMED_COMPETITION
}

/** Whether this competition has been given a colour of its own. */
export function hasCompetitionColor(externalLeagueId: number | null | undefined): boolean {
  return externalLeagueId != null && externalLeagueId in COMPETITION_COLOR
}
