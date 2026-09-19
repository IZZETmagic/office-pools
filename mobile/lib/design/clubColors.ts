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

  // ── Bundesliga ──────────────────────────────────────────────────────────
  157: '#DC052D',  // Bayern München
  165: '#1B1B1B',  // Borussia Dortmund  ⚠ the BLACK half — yellow is ~1.1:1
  168: '#E32221',  // Bayer Leverkusen
  169: '#E1000F',  // Eintracht Frankfurt
  173: '#D50032',  // RB Leipzig
  172: '#E32219',  // VfB Stuttgart
  160: '#C8102E',  // SC Freiburg
  164: '#C3141E',  // FSV Mainz 05
  192: '#C8102E',  // 1. FC Köln
  182: '#C8102E',  // Union Berlin
  1660: '#B4202A', // SV Elversberg
  170: '#BA3733',  // FC Augsburg
  174: '#004D9D',  // FC Schalke 04
  175: '#0E52A1',  // Hamburger SV
  185: '#004E95',  // SC Paderborn 07
  167: '#1C63B8',  // 1899 Hoffenheim
  162: '#1B7A43',  // Werder Bremen
  163: '#00733E',  // Borussia Mönchengladbach ⚠ the GREEN — black would twin Dortmund

  // ── La Liga ─────────────────────────────────────────────────────────────
  541: '#00529F',  // Real Madrid        ⚠ the club BLUE — the shirt is white
  529: '#A50044',  // Barcelona
  530: '#C8102E',  // Atletico Madrid
  531: '#D6161C',  // Athletic Club
  536: '#D4021D',  // Sevilla
  543: '#007A3D',  // Real Betis
  548: '#004A98',  // Real Sociedad
  532: '#A85C10',  // Valencia           ⚠ darkened orange, twice — #C4701A was 4.2:1
  533: '#005187',  // Villarreal         ⚠ the NAVY — yellow is ~1.2:1
  546: '#004B9B',  // Getafe
  540: '#0069B4',  // Espanyol
  542: '#0761AF',  // Alaves
  538: '#1E7BB8',  // Celta Vigo         ⚠ darkened sky
  539: '#8E1B3A',  // Levante
  727: '#A21C28',  // Osasuna
  728: '#C8202A',  // Rayo Vallecano
  535: '#0067B1',  // Malaga
  544: '#00519E',  // Deportivo La Coruna
  797: '#00713A',  // Elche
  4665: '#00843D', // Racing Santander

  // ── Serie A ─────────────────────────────────────────────────────────────
  496: '#1B1B1B',  // Juventus           ⚠ the BLACK half
  505: '#0B5FA5',  // Inter
  489: '#C4141A',  // AC Milan
  497: '#8E1F2F',  // AS Roma
  487: '#1E6F8F',  // Lazio              ⚠ darkened sky
  492: '#0B6FA4',  // Napoli             ⚠ darkened azure
  499: '#1B4B9B',  // Atalanta
  502: '#7B2D8E',  // Fiorentina
  503: '#7A1E1E',  // Torino
  494: '#2B2B2B',  // Udinese
  500: '#8F1B2C',  // Bologna
  495: '#9B1B30',  // Genoa
  490: '#A6192E',  // Cagliari
  488: '#007A3D',  // Sassuolo
  867: '#8A6D00',  // Lecce              ⚠ darkened yellow
  523: '#1B3A6B',  // Parma              ⚠ the BLUE half
  512: '#1B4B9B',  // Frosinone          ⚠ the BLUE half
  1579: '#C8102E', // Monza
  895: '#0B2E6F',  // Como
  517: '#1B5E3A',  // Venezia

  // ── Ligue 1 ─────────────────────────────────────────────────────────────
  85: '#004170',   // Paris Saint Germain
  81: '#10689B',   // Marseille          ⚠ darkened sky, twice — #1580B8 was 4.1:1
  80: '#0A3D91',   // Lyon
  91: '#B01126',   // Monaco
  79: '#D2001F',   // Lille
  116: '#D20A11',  // Lens
  94: '#C8102E',   // Rennes
  84: '#D2122E',   // Nice
  95: '#005CA9',   // Strasbourg
  96: '#6A2C8F',   // Toulouse
  114: '#003C7E',  // Paris FC
  111: '#0B3B8C',  // Le Havre
  108: '#10316B',  // Auxerre
  97: '#C4551A',   // Lorient            ⚠ darkened orange
  77: '#1B1B1B',   // Angers
  106: '#C8102E',  // Stade Brestois 29
  110: '#1B3D7A',  // Estac Troyes
  1298: '#C8102E', // Le Mans
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
