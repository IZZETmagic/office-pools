// =============================================================
// A club's colour, for the two sides of a comparison
// =============================================================
// ⚠ THE PROVIDER CANNOT GIVE US THIS, WHICH IS WHY THE MAP IS BY HAND.
// api-football does send `team.colors.player.primary` on `/fixtures/lineups`,
// but it is the KIT WORN IN THAT MATCH rather than the club's identity, and
// sampled across five real fixtures on 2026-09-07 it was unusable:
//
//   Manchester United  #efede5   off-white — an away kit, not United red
//   Crystal Palace     #e0dede   near-white
//   Sunderland         #dc90a3   pink
//   Manchester City    #abd1f5   very pale
//   Fulham             null      none at all
//
// Six of the nine clubs sampled failed contrast against white text, and several
// were simply the wrong colour for the club. So this is a curated list.
//
// ⚠ EVERY VALUE HERE CLEARS 4.5:1 AGAINST WHITE, checked rather than eyeballed.
// Two are deliberately off the official brand for that reason and are marked
// where they sit: Arsenal's #EF0107 measures 4.49 and Hull's amber #F5A12D only
// 2.10, which would be unreadable as a filled pill.
//
// ⚠ PREMIER LEAGUE ONLY, ON PURPOSE. A club with no entry falls back to the
// app's own pair, so La Liga, Serie A, Bundesliga and Ligue 1 keep working
// exactly as before rather than getting colours nobody has checked.
//
// ⚠ PURE: nothing here imports `react-native`. See the vitest config's rule.
// =============================================================

/**
 * api-football club id → the club's colour.
 *
 * Keyed on the PROVIDER's id, not our uuid, because that is the one identifier
 * that survives a re-import: `league_clubs.club_id` is minted per season.
 */
export const CLUB_COLOR: Record<number, string> = {
  42: '#DB0007',   // Arsenal        ⚠ official #EF0107 measures 4.49:1 — darkened
  66: '#670E36',   // Aston Villa
  35: '#B50E12',   // Bournemouth
  55: '#E30613',   // Brentford
  51: '#0057B8',   // Brighton
  49: '#034694',   // Chelsea
  1346: '#1D5BA4', // Coventry       (sky blue is far too light to fill)
  52: '#1B458F',   // Crystal Palace
  45: '#003399',   // Everton
  36: '#1B1B1B',   // Fulham         (white shirts; the black is the usable half)
  64: '#8F5100',   // Hull City      ⚠ official amber #F5A12D measures 2.10:1
  57: '#3A64A3',   // Ipswich
  63: '#1D428A',   // Leeds
  40: '#C8102E',   // Liverpool
  50: '#1C6FB5',   // Manchester City (sky blue too light to fill)
  33: '#DA291C',   // Manchester United
  34: '#241F20',   // Newcastle
  65: '#C40000',   // Nottingham Forest
  746: '#C81428',  // Sunderland
  47: '#132257',   // Tottenham
};

/**
 * Pull the provider's club id out of a crest URL.
 *
 * ⚠ THE URL IS THE ONLY PLACE THE PHONE HAS THIS. `ResultsTeam` carries a name,
 * an abbreviation and a crest — no club id of any kind — and the crest is
 * `https://media.api-sports.io/football/teams/42.png`, so the id is in the last
 * path segment.
 *
 * ⚠ AND THAT MAKES IT A SOFT DEPENDENCY ON THE PROVIDER'S URL SHAPE. It fails
 * to null rather than throwing, and a null simply means the club keeps the
 * app's default colour — so if api-football ever rehosts its crests the tab
 * loses its club colours and nothing else. The alternative was carrying
 * `external_club_id` through `/api/users/:id/fixtures` into `ResultsTeam`,
 * which is the right long-term fix and needs a deploy.
 */
export function clubIdFromCrestUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  const match = /\/(\d+)\.[a-z]+(?:\?.*)?$/i.exec(url);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

/** The club's colour, or null when it is not one we have checked. */
export function clubColorFromCrestUrl(url: string | null | undefined): string | null {
  const id = clubIdFromCrestUrl(url);
  return id === null ? null : CLUB_COLOR[id] ?? null;
}

/** Perceptual-ish distance between two hexes, 0 = identical. */
function distance(a: string, b: string): number {
  const rgb = (h: string) => {
    const s = h.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  };
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  // Weighted to human sensitivity — green dominates, blue barely registers.
  // Enough to answer "would these read as the same colour", which is all this
  // has to do.
  return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2);
}

/**
 * Below this, two clubs read as the same colour and the comparison stops
 * working.
 *
 * ⚠ THE NUMBER IS MEASURED, NOT PICKED. Computed across all 190 pairings of the
 * twenty clubs above:
 *
 *   Crystal Palace v Leeds       10.9   two near-identical blues
 *   Liverpool v Sunderland       13.1   two reds
 *   Fulham v Newcastle           17.3   two blacks
 *   Everton v Chelsea            39.2   two navies
 *   Liverpool v Nottm Forest     86.0   two reds
 *   Arsenal v Manchester United  89.7   two reds
 *   Man United v Nottm Forest   100.2   two reds  <- the binding constraint
 *   ----------------------------------- 110
 *   Leeds v Manchester City     116.8   navy against mid-blue
 *   Chelsea v Arsenal           415.4   navy against red
 *
 * 110 is the lowest value that catches every same-family pair; the pair setting
 * it is Manchester United against Nottingham Forest at 100.2.
 *
 * ⚠ IT SENDS 51 OF THE 190 PAIRINGS (27%) BACK TO THE APP'S COLOURS, and that
 * is the league rather than the rule: seven of these twenty clubs play in red
 * and six in blue. A lower threshold buys club colour on more fixtures by
 * shipping pairs a viewer cannot tell apart, which is the thing it exists to
 * prevent.
 */
const CLASH_THRESHOLD = 110;

/**
 * The pair of colours to draw a fixture's two sides in.
 *
 * ⚠ A CLASH FALLS BACK RATHER THAN NUDGING A HUE. Seven Premier League clubs
 * play in red, so Arsenal v Manchester United would be two pills a viewer
 * cannot tell apart — which is strictly worse than the app's fixed pair,
 * because the colour would look meaningful while carrying no information.
 * When the two are too close, BOTH revert: keeping one club's colour and
 * defaulting the other would imply the defaulted side simply has no identity.
 */
export function fixturePalette(
  homeCrestUrl: string | null | undefined,
  awayCrestUrl: string | null | undefined,
  fallback: { home: string; away: string },
): { home: string; away: string; usingClubColors: boolean } {
  const home = clubColorFromCrestUrl(homeCrestUrl);
  const away = clubColorFromCrestUrl(awayCrestUrl);

  // Both or neither — one club coloured and the other generic reads as a bug.
  if (!home || !away) return { ...fallback, usingClubColors: false };
  if (distance(home, away) < CLASH_THRESHOLD) {
    return { ...fallback, usingClubColors: false };
  }
  return { home, away, usingClubColors: true };
}
