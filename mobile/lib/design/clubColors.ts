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
  64: '#F5A12D',   // Hull City      ⚠ the official amber, restored — ink foreground
  57: '#3A64A3',   // Ipswich
  63: '#FFE100',   // Leeds  ⚠ ink foreground — 11.77:1
  40: '#C8102E',   // Liverpool
  50: '#1C6FB5',   // Manchester City (sky blue too light to fill)
  33: '#DA291C',   // Manchester United
  34: '#241F20',   // Newcastle
  65: '#C40000',   // Nottingham Forest
  746: '#C81428',  // Sunderland
  47: '#132257',   // Tottenham

  // ── Relegated since, and only reachable through a historical seed ────────
  // ⚠ THESE EXIST FOR THE ONBOARDING PRACTICE MATCHWEEK and nothing else today. It runs a real
  // Premier League matchweek from 2018/19, and eight of its twenty clubs are not in the current
  // division — so without these rows `ClubMark` correctly renders NOTHING for eight sides and
  // almost half the picker draws with no colour at all.
  //
  // ⚠ Additive and inert for every current surface: the ids are not otherwise reachable, so no
  // live fixture resolves differently because they are here.
  //
  // ⚠ The ids are api-football's and were inferred from the twelve confirmed above. Confirm them
  // against `importLeagueSeason(39, 2018)` at the same time as the seed's scorelines.
  37: '#0E63AD',   // Huddersfield Town
  38: '#FBEE23',   // Watford         ⚠ pale — takes the hairline
  39: '#FDB913',   // Wolves          ⚠ pale — takes the hairline
  41: '#D71920',   // Southampton
  43: '#0070B5',   // Cardiff City
  44: '#6C1D45',   // Burnley
  46: '#003090',   // Leicester City
  48: '#7A263A',   // West Ham United

  // ── Bundesliga ──────────────────────────────────────────────────────────
  157: '#DC052D',  // Bayern München
  165: '#FDE100',  // Borussia Dortmund  ⚠ ink foreground — the black half was a workaround
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
  533: '#FFE667',  // Villarreal         ⚠ ink foreground — the navy was a workaround
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
  867: '#F5D200',  // Lecce              ⚠ the real yellow — ink foreground
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
 * Relative luminance, WCAG's definition. Shared by everything below.
 */
function luminance(hex: string): number {
  const x = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The app's ink, for the one place a club colour needs a dark foreground. */
const INK = '#1B2340';

/**
 * The text colour that can be read ON a club's colour.
 *
 * ⚠⚠ THIS IS WHY LEEDS IS YELLOW AGAIN (2026-09-19). The map used to enforce
 * 4.5:1 against WHITE on every value, because a pill fills with white text —
 * and that single assumption cost five clubs their identity: Hull darkened to
 * brown, Lecce likewise, Dortmund and Villarreal pushed onto their second
 * colour, Leeds onto its blue. Yellow is not unreadable; yellow with WHITE text
 * is. Leeds' #FFE100 measures 1.31 against white and **11.77 against ink**.
 *
 * So the foreground is chosen from the colour rather than the colour bent to
 * suit one foreground. Same two lines the jersey already used for its number.
 */
export function clubInk(colour: string): string {
  return contrast(colour, '#FFFFFF') >= contrast(colour, INK) ? '#FFFFFF' : INK;
}

/**
 * Whether a colour needs a hairline to read as a SHAPE on a surface.
 *
 * ⚠ A BAR IS NOT TEXT. WCAG asks 3:1 of a non-text element that carries
 * meaning, not 4.5 — but Leeds' yellow is 1.31 against the light card, so it
 * needs an outline or it is a gap in the row.
 *
 * ⚠⚠ AND WHICH CLUBS NEED ONE INVERTS WITH THE THEME (Ryan, 2026-09-20). On the
 * light card it is the pale clubs: Leeds, and the twenty-odd white change kits.
 * On the dark card it is the opposite set — Newcastle's #241F20 measures
 * **1.01:1** against #1C2030, which is not a dark bar, it is no bar. The
 * surface is a parameter for that reason; the light card stays the default so
 * no existing caller changes behaviour.
 */
export function clubBarNeedsHairline(colour: string, surface = '#F7F8FC'): boolean {
  return contrast(colour, surface) < 3;
}

/**
 * A club's colour, made legible ON a given surface.
 *
 * ⚠⚠ THIS IS THE DARK-MODE ANSWER, AND IT IS NOT A SECOND PALETTE. Ryan,
 * 2026-09-20: "the teams that have black in the light mode should have white in
 * the dark or we will not be able to see the number." Quite right, and it is
 * more general than the blacks: the people card sets a shirt number in the
 * CLUB'S OWN COLOUR, and measured against the dark surface #1C2030, 77 of our
 * 96 clubs fail even the 3:1 shape bar — never mind the 4.5 that text wants.
 *
 * ⚠ IT LIFTS THE LIGHTNESS AND KEEPS THE HUE, rather than swapping in ink. A
 * club that goes to the theme's foreground has stopped being the club; Everton
 * lifted is still a blue, and that is the whole point of colouring the number.
 *
 * ⚠ AND A BLACK CLUB LIFTS TO WHITE ON ITS OWN, with no special case, because
 * black has no hue to preserve. Newcastle, Fulham, Juventus and Angers all
 * arrive at the same near-white — which is exactly what was asked for and falls
 * out of the general rule rather than sitting beside it.
 *
 * ⚠ ON A LIGHT SURFACE IT NORMALLY DOES NOTHING. Most club colours already
 * clear the bar against white; only the yellows come back darkened.
 */
export function clubOnSurface(colour: string, surface: string, minRatio = 4.5): string {
  if (contrast(colour, surface) >= minRatio) return colour;

  const lighten = luminance(surface) < 0.5;
  const [h, sat, l] = toHsl(colour);

  // ⚠⚠ A BLACK CLUB GOES ALL THE WAY TO WHITE, NOT TO THE FIRST GREY THAT
  // PASSES. Lifting by steps stops the moment it clears 4.5:1, which for
  // Newcastle and Fulham is a muddy #8B8B8B — legible, and not what anybody
  // means by "white in dark mode". There is no hue to preserve below this
  // saturation, so nothing is lost by going to the surface's own foreground,
  // and it is the colour those clubs actually change into anyway.
  if (sat < 0.15) return lighten ? '#E8EAF0' : INK;

  // ⚠ 2% STEPS, NOT A SOLVE. Contrast is not linear in lightness and the loop
  // is 50 iterations at worst on a value that is memo-free but trivial; a
  // closed form here would be arithmetic nobody could check against WCAG.
  for (let i = 1; i <= 50; i++) {
    const next = lighten ? Math.min(1, l + i * 0.02) : Math.max(0, l - i * 0.02);
    const candidate = fromHsl(h, sat, next);
    if (contrast(candidate, surface) >= minRatio) return candidate;
    if (next === 1 || next === 0) break;
  }

  // ⚠ IT CAN FAIL, AND THEN THE SURFACE'S OWN FOREGROUND WINS. A mid-grey club
  // on a mid-grey surface has nowhere to go; losing the club is better than
  // printing something unreadable.
  return lighten ? '#E8EAF0' : INK;
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const rgb = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg];
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}

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

// =============================================================
// The change colour — what a club wears when the home side clashes
// =============================================================
// ⚠⚠ THIS IS WHY IT EXISTS: 27% OF FIXTURES CURRENTLY HAVE NO CLUB COLOUR AT
// ALL. Measured across all five leagues on 2026-09-19 — 234 of 876 possible
// pairings fall past `CLASH_THRESHOLD` and revert BOTH sides to the app's
// fixed pair. Bundesliga is the worst at 39%. That is not a rounding error on
// an edge case; it is a quarter of the football.
//
// Real football solved this long before we did, and the answer is not to nudge
// a hue: the AWAY SIDE CHANGES. So does ours.
//
// ⚠⚠ THESE ARE THE REAL 2026/27 AWAY SHIRTS, WHICH MEANS THIS MAP EXPIRES.
// I argued for "traditional" change colours instead — Arsenal's yellow — on the
// grounds that an away kit is a marketing decision taken fresh every summer.
// Ryan asked for the actual kits, and looking them up settled the argument
// against me on the facts: Arsenal's 2026/27 away shirt is NAVY, Manchester
// United's is royal blue, Crystal Palace have swapped to black. "Traditional"
// would have shipped a yellow Arsenal that does not exist this season.
//
// ⚠⚠ SO SOMEBODY HAS TO REVISIT THIS EVERY AUGUST. That is the price of the
// accuracy and it is not optional — a stale entry is worse than an empty one,
// because an empty one falls back to something true. `ALT_SEASON` below is the
// reminder; the test suite checks it against nothing, because no test can know
// what Umbro did in June.
//
// ⚠ WHAT IS SOURCED AND WHAT IS NOT. The COLOUR of each shirt comes from two
// independent 2026/27 kit round-ups that agree with each other (planetfootball
// and flashscore, read 2026-09-19). The exact HEX is mine — "cream" and "royal
// blue" are words, not values — so every one of these wants Ryan's eye on a
// real screen before it is trusted.
//
// ⚠⚠ COVERAGE IS 79 CLUBS OF 96, AND THE 17 GAPS ARE NOT RESEARCH FAILURES.
// Every one of the missing clubs was looked up and found; they are absent
// because their 2026/27 away shirt is THE SAME COLOUR FAMILY AS THEIR OWN, so
// it could not resolve anything: Tottenham (navy away, navy primary), Leeds
// (yellow/yellow), Newcastle (navy/near-black), Sevilla, Rayo Vallecano,
// Leipzig, Stuttgart, Köln, Paderborn's neighbours in red, Real Betis, Racing
// Santander and Werder Bremen in green, Hamburger SV, Marseille, Paris FC and
// Le Havre in blue, Celta Vigo (navy away, sky-blue primary). The guard test
// below refuses them; that refusal is correct and the entries were deleted
// after being written. Only SV Elversberg is a true blank — the club described
// its shirt as "traditional away colours with gold accents" and named none.
//
// ⚠⚠ HOW THIS WAS SOURCED, AND WHY IT CHANGED HALFWAY. The first pass used
// editorial round-ups, which cover England well and the continent barely:
// `footballkitarchive` refuses every request, and `bundesliga.com` and
// `ligue1.com` publish their own kit round-ups as IMAGE GALLERIES with no
// colour named in the text. Ryan suggested going to the shops instead. Club
// shops are worse — they render products client-side — but the RETAIL LISTINGS
// are not: a product URL reads `701242828-pumablack-flaxen` and a Nike title
// reads "Black/Midwest Gold". One search per club, and the colourway is
// unambiguous. That is where the other 64 came from.
//
// ⚠⚠ ONE SOURCE WAS CAUGHT BEING WRONG AND IS NOT USED. A kit gallery returned
// a confident, complete La Liga list — Real Madrid grey, Racing Santander blue
// — and two other sources say dark green for one and green for the other. The
// same site answered "not shown" for the other three leagues, so that list was
// not read off the page. Anything sourced only from it was discarded.
//
// ⚠ WHAT IS SOURCED AND WHAT IS NOT. The COLOUR of each shirt is sourced. The
// exact HEX is mine — "cream", "grape brown" and "petrol green" are words, not
// values — so these want Ryan's eye on a real screen. Bayer Leverkusen is
// marked in the map as the one whose tone is genuinely a guess.
//
// ⚠ A CLUB WITH NO ENTRY IS UNAFFECTED, which is what makes filling this safe
// to do one club at a time.
//
// ⚠ AND A THIRD OF THEM ARE PALE, which the primary map never had to deal
// with. `clubInk` picks a dark foreground and `clubBarNeedsHairline` draws the
// outline that stops an off-white bar reading as an empty slot — the same two
// mechanisms Leeds' yellow already uses.
// =============================================================

/** The season these kits are from. ⚠ Re-check every August. */
export const ALT_SEASON = '2026/27';

/** api-football club id → the colour that club changes into. */
export const CLUB_ALT_COLOR: Record<number, string> = {
  // ── Premier League ──────────────────────────────────────────────────────
  42: '#16264F',   // Arsenal            navy
  66: '#1B1B1B',   // Aston Villa        black, gold
  35: '#6C4BB6',   // Bournemouth        purple
  55: '#1C2B4A',   // Brentford          navy, cream pinstripes
  51: '#F0F0F0',   // Brighton           white  ⚠ pale
  49: '#1B1B1B',   // Chelsea            black, Midwest Gold
  1346: '#EFEFEA', // Coventry           off-white  ⚠ pale
  52: '#1B1B1B',   // Crystal Palace     black
  45: '#F0F0F0',   // Everton            white  ⚠ pale
  36: '#C8102E',   // Fulham             red and black
  64: '#F0F0F0',   // Hull City          white  ⚠ pale
  57: '#EFE6D2',   // Ipswich            cream  ⚠ pale
  40: '#F0F0F0',   // Liverpool          white  ⚠ pale
  50: '#1B1B1B',   // Manchester City    black, flaxen gold
  33: '#1F5AC4',   // Manchester United  royal blue
  65: '#14452B',   // Nottingham Forest  dark green
  746: '#E86FA0',  // Sunderland         pink and black

  // ── La Liga ─────────────────────────────────────────────────────────────
  541: '#174A2E',  // Real Madrid        dark green
  529: '#32204F',  // Barcelona          black-to-purple gradient
  530: '#1B1B1B',  // Atletico Madrid    black, volt green
  531: '#1B1B1B',  // Athletic Club      black
  548: '#1B1B1B',  // Real Sociedad      black
  532: '#17325E',  // Valencia           deep blue, orange trim
  533: '#BFC4CC',  // Villarreal         light grey  ⚠ pale
  546: '#6B1F2E',  // Getafe             maroon
  540: '#C41E28',  // Espanyol           red
  542: '#1B1B1B',  // Alaves             black
  539: '#F0F0F0',  // Levante            white  ⚠ pale
  727: '#F2ECE0',  // Osasuna            cream  ⚠ pale
  535: '#DE9A94',  // Malaga             dusty rose
  544: '#1B1B1B',  // Deportivo          black
  797: '#6B3FA0',  // Elche              purple

  // ── Serie A ─────────────────────────────────────────────────────────────
  // ⚠ "There's a lot of white, obviously" — nss sports on this season's Serie
  // A away shirts. Fifteen of these twenty are white or cream; Udinese is the
  // only side to pick a real colour.
  496: '#F0A8C0',  // Juventus           pink, black trim
  505: '#F0F0F0',  // Inter              white, blue pinstripes  ⚠ pale
  489: '#F0F0F0',  // AC Milan           white  ⚠ pale
  497: '#F2F0EA',  // AS Roma            off-white, yellow-red band  ⚠ pale
  487: '#F0F0F0',  // Lazio              white  ⚠ pale
  492: '#F0F0F0',  // Napoli             white  ⚠ pale
  499: '#F0F0F0',  // Atalanta           white  ⚠ pale
  502: '#F0F0F0',  // Fiorentina         white, purple trim  ⚠ pale
  503: '#F0F0F0',  // Torino             white, maroon  ⚠ pale
  494: '#1B3A6B',  // Udinese            navy
  500: '#F0F0F0',  // Bologna            white  ⚠ pale
  495: '#F0F0F0',  // Genoa              white  ⚠ pale
  490: '#F0F0F0',  // Cagliari           white  ⚠ pale
  488: '#F0F0F0',  // Sassuolo           white  ⚠ pale
  867: '#F0F0F0',  // Lecce              white  ⚠ pale
  523: '#F2CE1B',  // Parma              yellow and blue
  512: '#F0F0F0',  // Frosinone          white  ⚠ pale
  1579: '#F0F0F0', // Monza              white  ⚠ pale
  895: '#F0F0F0',  // Como               white, navy trim  ⚠ pale
  517: '#F2EFE6',  // Venezia            off-white  ⚠ pale

  // ── Bundesliga ──────────────────────────────────────────────────────────
  157: '#F0F0F0',  // Bayern München     white, navy collar  ⚠ pale
  165: '#1B1B1B',  // Borussia Dortmund  black, yellow accents
  168: '#5E9B86',  // Bayer Leverkusen   ⚠⚠ APPROXIMATE. New Balance name the
                   //                    colours "Terrarium", "Light Surf",
                   //                    "Faded Teal" — a teal-green family is
                   //                    certain, the exact tone is a guess
  169: '#F0F0F0',  // Eintracht Frankfurt white  ⚠ pale
  160: '#F0F0F0',  // SC Freiburg        white, red pinstripes  ⚠ pale
  164: '#F0F0F0',  // FSV Mainz 05       white  ⚠ pale
  182: '#4A4A4A',  // Union Berlin       dark grey
  170: '#10635E',  // FC Augsburg        petrol green
  174: '#F0F0F0',  // FC Schalke 04      white, navy  ⚠ pale
  185: '#C41E28',  // SC Paderborn 07    red and gold
  167: '#F1EEE6',  // 1899 Hoffenheim    off-white  ⚠ pale
  163: '#1B1B1B',  // M'gladbach         black, dark green

  // ── Ligue 1 ─────────────────────────────────────────────────────────────
  85: '#F0F0F0',   // Paris Saint Germain white, red-navy stripe  ⚠ pale
  80: '#C0272D',   // Lyon               red
  91: '#4E2E3C',   // Monaco             grape brown, purple
  79: '#F0F0F0',   // Lille              white  ⚠ pale
  116: '#1B1B1B',  // Lens               black, green
  94: '#F0F0F0',   // Rennes             white, black cross  ⚠ pale
  84: '#F0F0F0',   // Nice               white  ⚠ pale
  95: '#F0F0F0',   // Strasbourg         white  ⚠ pale
  96: '#F0F0F0',   // Toulouse           white, pink pinstripes  ⚠ pale
  108: '#1B1B1B',  // Auxerre            black
  97: '#F0F0F0',   // Lorient            white  ⚠ pale
  77: '#F0F0F0',   // Angers             white, silver  ⚠ pale
  106: '#F0F0F0',  // Stade Brestois 29  white  ⚠ pale
  110: '#F2EFE6',  // Estac Troyes       cream  ⚠ pale
  1298: '#F2CE1B', // Le Mans            yellow, red chest band
};

/** The club's change colour, or null when nobody has supplied one. */
export function clubAltColorFromCrestUrl(url: string | null | undefined): string | null {
  const id = clubIdFromCrestUrl(url);
  return id === null ? null : CLUB_ALT_COLOR[id] ?? null;
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
 * Which colour family a hex belongs to — "red", "blue", "dark" and so on.
 *
 * ⚠⚠ THIS IS A SECOND, COARSER QUESTION THAN `distance`. The threshold asks
 * "would these two read as the SAME colour"; this asks "are these two the same
 * KIND of colour", which is the thing a viewer actually notices at a glance
 * across a fixture list. Everton's #003399 and Manchester City's #1C6FB5 are
 * 135 apart — comfortably distinct by the threshold — and are still two blues.
 *
 * ⚠ HUE IS MEANINGLESS AT THE EXTREMES, so saturation and lightness are asked
 * first. An almost-grey has a hue the maths will happily report and the eye
 * cannot see, and #1B1B1B (Fulham) is not "a red" because its hue rounds to 0.
 * Anything desaturated is light/grey/dark by lightness alone.
 *
 * ⚠ THE DARK CUTOFF IS 0.15, NOT 0.22, AND IT WAS MEASURED. At 0.22 Tottenham's
 * navy (lightness 0.208) fell into "dark" alongside two blacks, which is both
 * wrong on its face and cost the rule the pairs it exists for — Spurs against
 * the league's other blues. At 0.15 navy is blue and the blacks are still dark.
 */
export function colourFamily(hex: string): string {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  // ⚠⚠ LIGHTNESS IS ASKED BEFORE SATURATION, AND THAT ORDER IS A BUG FIX.
  // `s` is divided by `1 - |2l - 1|`, which collapses towards zero at both ends
  // of the scale — so at lightness 0.94 a six-point difference between channels
  // reports as 20% saturation. #EDEFF3, an off-white away shirt, came back as
  // BLUE, which would have had a white change kit rejected for clashing with a
  // blue home side: exactly backwards. Nothing in the primary map is near-white
  // so this never bit until the real kits arrived.
  if (l > 0.85) return 'light';
  if (l < 0.15) return 'dark';
  if (s < 0.18) return l > 0.7 ? 'light' : l < 0.35 ? 'dark' : 'grey';

  let hue: number;
  if (d === 0) hue = 0;
  else if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;

  if (hue >= 345 || hue < 15) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 160) return 'green';
  if (hue < 200) return 'teal';
  if (hue < 260) return 'blue';
  if (hue < 300) return 'purple';
  return 'claret'; // 300–345: Aston Villa, and the darker end of pink
}

/**
 * ⚠ THE ONE QUESTION THE PALETTE ASKS, and it is deliberately the OR of the
 * two measures rather than either alone. Two colours are too alike if they read
 * as the same colour OR if they are the same kind of colour. The first catches
 * Arsenal against Manchester United; the second catches Everton against
 * Manchester City, which the first waves through.
 */
function readsAsTheSame(a: string, b: string): boolean {
  return distance(a, b) < CLASH_THRESHOLD || colourFamily(a) === colourFamily(b);
}

/**
 * The pair of colours to draw a fixture's two sides in.
 *
 * ⚠ A CLASH FALLS BACK RATHER THAN NUDGING A HUE. Seven Premier League clubs
 * play in red, so Arsenal v Manchester United would be two pills a viewer
 * cannot tell apart — which is strictly worse than the app's fixed pair,
 * because the colour would look meaningful while carrying no information.
 * When the two are too close, BOTH revert: keeping one club's colour and
 * defaulting the other would imply the defaulted side simply has no identity.
 *
 * ⚠⚠ BUT FIRST THE AWAY SIDE CHANGES, WHICH IS WHAT FOOTBALL DOES (2026-09-19).
 * A clash is only a fallback once the away club has no usable change colour.
 * See `CLUB_ALT_COLOR` — the map is nearly empty, so today this fires for one
 * club and everything else behaves exactly as it did.
 *
 * ⚠⚠ AND THAT MAKES THIS ASYMMETRIC ON PURPOSE. It was not: swapping the two
 * sides used to swap the two colours and change nothing else. It cannot stay
 * that way, because "who changes" is a fact about which side is at HOME.
 * Arsenal at Old Trafford wear yellow; Manchester United at the Emirates do
 * not wear yellow, they wear red and Arsenal keep theirs. The invariant that
 * replaces it is narrower and still worth holding: THE HOME SIDE ALWAYS KEEPS
 * ITS OWN COLOUR, and only the away side is ever asked to move.
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
  if (!readsAsTheSame(home, away)) return { home, away, usingClubColors: true };

  // ⚠ THE CHANGE KIT HAS TO CLEAR THE SAME BAR — both halves of it. A second
  // colour that reads as the home side's, or is simply another shade of the
  // same family, is not a solution; it is the same problem in a new shirt.
  const change = clubAltColorFromCrestUrl(awayCrestUrl);
  if (change && !readsAsTheSame(home, change)) {
    return { home, away: change, usingClubColors: true };
  }

  // ⚠⚠ ONLY A HARD CLASH LOSES THE COLOURS. This is the line that keeps the
  // family rule from being a regression: it widens when a club CHANGES kit, and
  // must not widen when a fixture gives up its colours altogether. Everton and
  // Manchester City are two blues with no change colour between them — 135
  // apart, which a viewer can tell apart perfectly well. They keep them.
  if (distance(home, away) < CLASH_THRESHOLD) return { ...fallback, usingClubColors: false };
  return { home, away, usingClubColors: true };
}
