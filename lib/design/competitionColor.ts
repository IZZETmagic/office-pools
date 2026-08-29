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
// ## ⚠ THE STRIPE IS THE ONLY THING THAT SAYS WHICH COMPETITION
//
// Neither pool card names the competition — not on the dashboard, not on the
// pools list. So two competitions sharing a colour is not a polish problem, it
// is a member unable to tell a La Liga pool from a Bundesliga one. That is what
// went wrong: La Liga was #EE2737 and the Bundesliga #D20515, which are 0.069
// apart in OKLab and 3.2° of hue. Different strings, one colour.
//
// ## ⚠ EACH COLOUR OWNS A BAND, NOT A POINT
//
// `getPoolStripe` lifts the top stop by STRIPE_TOP_LIFT (0.14), so a stripe
// covers a RANGE of lightness and every separation check has to compare all
// four stop pairings. This is not a detail — it is why the obvious fix failed.
// Moving the yielding league to a coral looks right on paper and is wrong on
// the card, because a bright red's own top stop is already a coral. Two
// competitions can be 0.16 apart at their bases and still draw overlapping bars.
//
// Sweeping the hue circle against that constraint, the red band and the
// blue/navy band each hold about two competitions and both are full. There is
// no free slot at the bright end of red. The room that exists is BELOW the
// bright red, which is where the Bundesliga now sits.
//
// ⚠ SO THE PALETTE IS NEARLY OUT OF SPACE. Seven competitions fit; the ~40 the
// programme is heading for do not, at any threshold. The next competition that
// cannot be placed is the signal to stop making a five-pixel bar carry this and
// put the crest on the card — the URL already exists, from this same key.
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
 * one a person would name if asked what colour that league "is" — EXCEPT where
 * two competitions would name the same one, and then the tie is broken by which
 * brand has a second true answer. Only La Liga did.
 */
export const COMPETITION_COLOR: Record<number, string> = {
  // The Premier League's own purple. Their brand palette pairs it with a cyan
  // and a pink, but the purple is the one that reads as "Premier League" alone.
  [LEAGUE_ID.premierLeague]: '#3D195B',

  // La Liga keeps the bright red. Ryan's call, 2026-08-29 — he tried it the
  // other way round and did not like a dark La Liga.
  [LEAGUE_ID.laLiga]: '#EE2737',

  // ⚠ THE DEEP END OF RED, and the second choice on purpose. Asked what colour
  // these two leagues are, everybody says red about both, and they shipped
  // 0.069 apart — one colour on the card. One of them has to yield, and the
  // pair below is the whole reason it is this one rather than La Liga:
  //
  //   · red is where both brands actually live, so the yielding league stays in
  //     the family and just moves down out of the other's band. Deep red is
  //     still a Bundesliga red — #A00D1E, one step brighter, is already only
  //     0.058 from La Liga, so this is about as light as the slot goes.
  //   · black — the Bundesliga's real partner colour — is not available. It is
  //     Ligue 1's ONLY answer, whereas the Bundesliga has red. A near-black
  //     here would just move the collision onto Ligue 1.
  //
  // 0.069 → 0.133 against La Liga.
  [LEAGUE_ID.bundesliga]: '#7A1020',

  [LEAGUE_ID.serieA]: '#0067B1',

  // Ligue 1's current identity is essentially monochrome, and this is now the
  // near-black that says so. It used to be a navy — #091C3E, picked because
  // black "would disappear" on a dark card — but a stand-in colour in a full
  // family is what put it 0.069 from the Champions League, the same collision
  // as the reds and one competition further down the road. A near-black is both
  // truer to the brand and the only free ground left below everything else.
  //
  // ⚠ THIS IS WHY THE BUNDESLIGA COULD NOT HAVE THE BLACK it pairs with its
  // red. Ligue 1 has no second answer; the Bundesliga does.
  [LEAGUE_ID.ligue1]: '#101215',

  // Deepened from #0B1E64, which sat 0.086 from the Premier League's purple —
  // two dark bars that read alike at five pixels. The Premier League's purple
  // is fixed, so the navy moved. Still the midnight the starball sits on, just
  // further down and more saturated.
  [LEAGUE_ID.championsLeague]: '#050B5E',

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

/**
 * How far apart two stripes must be, as an OKLab distance between their
 * CLOSEST stops.
 *
 * Enforced by lib/design/__tests__/competitionColor.test.ts over every pair,
 * the unthemed fallback included. It is a floor, not a target: the palette's
 * tightest pair is the Premier League against the unthemed slate at 0.093, and
 * that one survives because purple-against-grey differs in chroma by 3.4× —
 * a difference plain ΔE under-weights. Anything nearer than this has always
 * been a genuine collision.
 *
 * ⚠ WHEN THIS TEST FAILS ON A NEW COMPETITION, the answer is not to lower the
 * number. It is that the palette is full — see the header.
 */
export const MIN_STRIPE_SEPARATION = 0.09

export function getCompetitionColor(externalLeagueId: number | null | undefined): string {
  if (externalLeagueId == null) return UNTHEMED_COMPETITION
  return COMPETITION_COLOR[externalLeagueId] ?? UNTHEMED_COMPETITION
}

/** Whether this competition has been given a colour of its own. */
export function hasCompetitionColor(externalLeagueId: number | null | undefined): boolean {
  return externalLeagueId != null && externalLeagueId in COMPETITION_COLOR
}

/**
 * Every competition that has a colour, as ids.
 *
 * Exported so the separation guard iterates the real table rather than a
 * hand-kept list — a competition added above is checked without anyone
 * remembering to add it to the test.
 */
export const THEMED_COMPETITION_IDS: number[] = Object.keys(COMPETITION_COLOR).map(Number)
