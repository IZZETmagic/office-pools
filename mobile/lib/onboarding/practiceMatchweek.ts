// =============================================================
// The practice matchweek — a season that has already been played
// =============================================================
// ⭐ THE IDEA, AND WHY IT IS A PAST SEASON. Onboarding opens on the user DOING the thing the app is
// for, before any account, any feature list and any price — the single biggest lever in the
// onboarding literature is moving sign-up behind the first real act. Ours is a matchweek of picks.
//
// It cannot be the CURRENT matchweek: anyone who follows the football would be picking results they
// already know, and the leaderboard that follows would be meaningless. It cannot be an invented
// fixture list either — the product's fifth gate is that *all uncertainty is inherited from the
// sporting event*, and a made-up fixture inherits nothing.
//
// So it is a real matchweek from a season far enough back that almost nobody remembers it, and we
// SAY SO on the first screen. "You could look them up. It would rather spoil it." Disclosing it is
// what turns it from a trick into a game.
//
// ⚠⚠ THE SCORELINES BELOW ARE UNVERIFIED. The fixture list is genuine Premier League matchweek 6,
// 2018/19 (29–30 September 2018) and is attested across several sources. The ten RESULTS are
// placeholders: the two sources that carry them were paywalled when this was written. **Before this
// ships, replace `score`/`outcome` from `importLeagueSeason(39, 2018)` and have a person read them.**
// A practice week that teaches the wrong answer is worse than no practice week.
//
// ⚠ A CHECKED-IN SEED, NOT AN IMPORT. `importLeagueSeason` writes to `league_fixtures`, which is
// what the live product reads — historical fixtures sitting in those tables is the same shape as
// the placeholder-kickoff bug. Use the importer to FETCH, then paste the answer here.
//
// ⚠ THE CLUB IDS ARE api-football's, and they are load-bearing: `clubColorFromCrestUrl` parses the
// last path segment of `crestUrl` to find a colour. The twelve that already had colours confirm the
// mapping (33 Man Utd, 35 Bournemouth, 49 Chelsea…); the eight relegated-since clubs were added to
// `lib/design/clubColors.ts` for this seed and their ids should be confirmed against the importer's
// output at the same time as the scores.
// =============================================================

export type PracticeClub = {
  /** api-football's id. Only used to resolve the club's colour — see the banner. */
  id: number;
  /** The full name. The accessible label, never the visible one in the picker. */
  name: string;
  /** What `OutcomePicker` actually renders. `shortClubName`'s output. */
  shortName: string;
  abbr: string;
};

export type PracticeFixture = {
  key: string;
  home: PracticeClub;
  away: PracticeClub;
  kickoff: string;
  /** ⚠ UNVERIFIED — see the banner. */
  score: string;
  /** ⚠ UNVERIFIED — see the banner. */
  outcome: 'home' | 'draw' | 'away';
  scout: PracticeScout;
};

export type PracticeScout = {
  homeForm: ('W' | 'D' | 'L')[];
  awayForm: ('W' | 'D' | 'L')[];
  commonScore: string;
  avgGoals: string;
  bttsPct: string;
  /** How the practice week's takers split. Percentages, summing to 100. */
  crowd: { home: number; draw: number; away: number };
};

/** ⚠ The crest URL is never fetched — it is how the colour is looked up. */
export function crestUrl(id: number): string {
  return `https://media.api-sports.io/football/teams/${id}.png`;
}

const C = {
  BOU: { id: 35, name: 'AFC Bournemouth', shortName: 'Bournemouth', abbr: 'BOU' },
  CRY: { id: 52, name: 'Crystal Palace', shortName: 'Crystal Palace', abbr: 'CRY' },
  ARS: { id: 42, name: 'Arsenal', shortName: 'Arsenal', abbr: 'ARS' },
  WAT: { id: 38, name: 'Watford', shortName: 'Watford', abbr: 'WAT' },
  CAR: { id: 43, name: 'Cardiff City', shortName: 'Cardiff', abbr: 'CAR' },
  BUR: { id: 44, name: 'Burnley', shortName: 'Burnley', abbr: 'BUR' },
  CHE: { id: 49, name: 'Chelsea', shortName: 'Chelsea', abbr: 'CHE' },
  LIV: { id: 40, name: 'Liverpool', shortName: 'Liverpool', abbr: 'LIV' },
  EVE: { id: 45, name: 'Everton', shortName: 'Everton', abbr: 'EVE' },
  FUL: { id: 36, name: 'Fulham', shortName: 'Fulham', abbr: 'FUL' },
  HUD: { id: 37, name: 'Huddersfield Town', shortName: 'Huddersfield', abbr: 'HUD' },
  TOT: { id: 47, name: 'Tottenham Hotspur', shortName: 'Spurs', abbr: 'TOT' },
  MCI: { id: 50, name: 'Manchester City', shortName: 'Man City', abbr: 'MCI' },
  BHA: { id: 51, name: 'Brighton & Hove Albion', shortName: 'Brighton', abbr: 'BHA' },
  NEW: { id: 34, name: 'Newcastle United', shortName: 'Newcastle', abbr: 'NEW' },
  LEI: { id: 46, name: 'Leicester City', shortName: 'Leicester', abbr: 'LEI' },
  WHU: { id: 48, name: 'West Ham United', shortName: 'West Ham', abbr: 'WHU' },
  MUN: { id: 33, name: 'Manchester United', shortName: 'Man Utd', abbr: 'MUN' },
  WOL: { id: 39, name: 'Wolverhampton Wanderers', shortName: 'Wolves', abbr: 'WOL' },
  SOU: { id: 41, name: 'Southampton', shortName: 'Southampton', abbr: 'SOU' },
} satisfies Record<string, PracticeClub>;

const scout = (
  homeForm: string,
  awayForm: string,
  commonScore: string,
  avgGoals: string,
  bttsPct: string,
  crowd: [number, number, number],
): PracticeScout => ({
  homeForm: homeForm.split('') as ('W' | 'D' | 'L')[],
  awayForm: awayForm.split('') as ('W' | 'D' | 'L')[],
  commonScore,
  avgGoals,
  bttsPct,
  crowd: { home: crowd[0], draw: crowd[1], away: crowd[2] },
});

export const PRACTICE_MATCHWEEK = {
  competition: 'Premier League',
  season: '2018/19',
  matchweek: 6,
  fixtures: [
    { key: 'bou-cry', home: C.BOU, away: C.CRY, kickoff: 'Sat 15:00', score: '2–1', outcome: 'home',
      scout: scout('WDWLW', 'LDWDL', '1–1', '2.8', '54', [41, 27, 32]) },
    { key: 'ars-wat', home: C.ARS, away: C.WAT, kickoff: 'Sat 15:00', score: '2–0', outcome: 'home',
      scout: scout('WWWDL', 'WDLDW', '2–1', '2.6', '61', [72, 18, 10]) },
    { key: 'car-bur', home: C.CAR, away: C.BUR, kickoff: 'Sat 15:00', score: '2–2', outcome: 'draw',
      scout: scout('LLDLD', 'LDLLW', '1–1', '2.3', '58', [35, 31, 34]) },
    { key: 'che-liv', home: C.CHE, away: C.LIV, kickoff: 'Sat 17:30', score: '1–1', outcome: 'draw',
      scout: scout('WWDWW', 'WWWWW', '1–1', '2.4', '62', [34, 19, 47]) },
    { key: 'eve-ful', home: C.EVE, away: C.FUL, kickoff: 'Sat 15:00', score: '3–0', outcome: 'home',
      scout: scout('DWDLW', 'LLDLW', '2–0', '2.7', '49', [64, 22, 14]) },
    { key: 'hud-tot', home: C.HUD, away: C.TOT, kickoff: 'Sat 15:00', score: '0–2', outcome: 'away',
      scout: scout('LDLLD', 'WLWWL', '0–2', '2.5', '41', [13, 21, 66]) },
    { key: 'mci-bha', home: C.MCI, away: C.BHA, kickoff: 'Sat 15:00', score: '2–0', outcome: 'home',
      scout: scout('WWWWD', 'DLDWL', '2–0', '2.9', '38', [86, 10, 4]) },
    { key: 'new-lei', home: C.NEW, away: C.LEI, kickoff: 'Sat 15:00', score: '0–2', outcome: 'away',
      scout: scout('LDLDL', 'WLWDL', '1–1', '2.4', '56', [30, 29, 41]) },
    { key: 'whu-mun', home: C.WHU, away: C.MUN, kickoff: 'Sat 12:30', score: '3–1', outcome: 'home',
      scout: scout('LLDWD', 'WLLDW', '1–2', '2.8', '63', [21, 23, 56]) },
    { key: 'wol-sou', home: C.WOL, away: C.SOU, kickoff: 'Sat 15:00', score: '2–0', outcome: 'home',
      scout: scout('DWDWL', 'LDLDL', '1–0', '2.1', '44', [58, 26, 16]) },
  ] satisfies PracticeFixture[],
} as const;

/** 100 a correct call. The practice week does not score exact scorelines — see the results screen. */
export const POINTS_PER_CORRECT = 100;

/**
 * ⚠⚠ THEY ARE OURS AND EVERY ROW SAYS SO. The practice board needs rivals and we have no real
 * picks for a 2018 matchweek, so these three are invented — which is fine, and presenting them as
 * members would not be. The tooltip test is the whole argument: *"these people aren't real, we made
 * them so the app looks busy"* does not survive being said out loud, so each row is labelled and the
 * only number doing persuasive work (`PRACTICE_TAKERS`) is a real count.
 */
export const PRACTICE_CREW = [
  { name: 'Priya Nair', username: 'priyan', points: 800, level: 7, levelName: 'Regular' },
  { name: 'Dev Patel', username: 'devp', points: 600, level: 5, levelName: 'Squad' },
  { name: 'Marcus Thorne', username: 'mthorne', points: 400, level: 3, levelName: 'Rookie' },
] as const;

/**
 * ⚠ A PLACEHOLDER FOR A REAL COUNT. This should be `select count(*)` over everyone who has
 * completed the practice week, not a constant — the whole reason this line is allowed to persuade
 * is that it is true. Until the table exists, the UI must not print it.
 */
export const PRACTICE_TAKERS: number | null = null;
