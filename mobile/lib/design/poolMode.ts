// =============================================================
// One name and one colour per game mode — the pool card's pill
// =============================================================
// ⚠ MIRRORED FROM lib/design/poolMode.ts + `modeIdentityColor` in
// lib/design/tokens.ts. Mobile is a separate npm project with its own
// lockfile, so it cannot import them — the same constraint that forced
// ./competition.ts, and the same guard watches both:
// lib/design/__tests__/competitionMirror.guard.test.ts (web side) fails if
// the two drift.
//
// ⚠ WHAT THIS REPLACES WAS WRONG, not merely plainer. PoolListItem held a
// three-entry MODE_LABEL — the World Cup's bracket modes — and read it with
// `?? 'Pool'`. Every league pool therefore wore a badge reading the word
// "Pool", which is not a mode, not a game, and not information. Measured
// against production on 2026-09-05: 17 pools, across five competitions.
//
// ## Two levels, not one
//
// `prediction_mode` alone CANNOT name a league pool. All four league games
// carry the same value — `league_pickem` — and which game it actually is
// lives in `league_mode` (migration 077). Every function here therefore takes
// the league mode as an optional second argument.
// =============================================================

import { withLightness } from './oklch';

/** The three World Cup bracket modes. */
const MODE_NAME: Record<string, string> = {
  full_tournament: 'Full',
  progressive: 'Progressive',
  bracket_picker: 'Bracket',
};

/**
 * The four league games. Mirrors `pools_league_mode_ck` (migration 077) — if
 * you widen the CHECK, widen this in the same commit.
 */
export const LEAGUE_MODES = ['pickem', 'showdown', 'last_man_standing', 'table'] as const;
export type LeagueMode = (typeof LEAGUE_MODES)[number];

/**
 * Short labels for the card pill, which is 10px and shares a row with the
 * admin badge, the status tag and the player count. "Last Man Standing"
 * spelled out pushes that row onto a second line on a phone, so it is trimmed
 * here — the pool detail spells it out where there is room.
 */
const LEAGUE_NAME: Record<LeagueMode, string> = {
  pickem: 'Pick’em',
  showdown: 'Showdown',
  last_man_standing: 'Last Man',
  table: 'Table',
};

/**
 * One colour per game mode — all seven.
 *
 * ⚠ VALUES ARE THE WEB'S, NOT CHOICES MADE HERE. The three bracket colours
 * mirror mobile/theme; the four league ones were placed around them in OKLab
 * to a minimum pairwise separation of 28° — see the header of
 * lib/design/tokens.ts (web) for why. The pill is now the ONLY place the mode
 * is coloured, since the rail carries the competition, so telling a Showdown
 * pool from a Last Man Standing one at a glance depends entirely on this.
 */
export const modeIdentityColor: Record<string, string> = {
  full_tournament: '#3B6EFF',
  progressive: '#059669',
  bracket_picker: '#D97706',
  pickem: '#0891B2',
  table: '#7C3AED',
  showdown: '#C026D3',
  last_man_standing: '#E11D48',
};

/**
 * How light the pill's text sits, per theme, and how strong its tint is.
 *
 * Absolute lightness targets rather than deltas off each mode colour: the
 * seven start as much as 0.14 apart in lightness, so a shared delta would
 * leave some pills visibly fainter than others. Targeting one value each way
 * puts every mode between 6.3:1 and 9.2:1 against its own tint — above WCAG
 * AAA for the 10px bold the pill is set in, which is the size that makes this
 * matter. Tints mirror `.mode-pill` in globals.css.
 */
const INK_L_LIGHT = 0.45;
const INK_L_DARK = 0.84;
const TINT_LIGHT = 0.14;
const TINT_DARK = 0.22;

function isPoolMode(mode: string): boolean {
  return mode in MODE_NAME;
}

function isLeagueMode(mode: string | null | undefined): mode is LeagueMode {
  return typeof mode === 'string' && mode in LEAGUE_NAME;
}

/**
 * True for a league pool, whichever game it is playing.
 *
 * Keyed on `prediction_mode` rather than on `league_mode` being non-null,
 * because `league_mode` is the thing most likely to be missing from a caller's
 * SELECT — and a league pool with an unselected league mode must still not be
 * treated as a World Cup pool. Three production pools carry NULL there.
 */
export function isLeaguePoolMode(mode: string | null | undefined): boolean {
  return mode === 'league_pickem';
}

/** Short label, for pills and cards where space is tight. */
export function getModeName(mode: string | null | undefined, leagueMode?: string | null): string {
  if (isLeaguePoolMode(mode)) {
    return isLeagueMode(leagueMode) ? LEAGUE_NAME[leagueMode] : 'League';
  }
  if (typeof mode === 'string' && isPoolMode(mode)) return MODE_NAME[mode];
  // ⚠ NOT the raw column value. `?? 'Pool'` is what this replaced and it is
  // what put the word "Pool" on 17 league cards; returning `mode` instead —
  // the web's old fallback — printed the literal string `league_pickem`.
  return 'Pool';
}

/**
 * Which of the seven identity colours a pool takes.
 *
 * Same fallbacks the web uses: a league pool with no `league_mode` reads as
 * Pick'em (three production pools carry NULL there and all three are Pick'em),
 * and an unrecognised bracket mode reads as full_tournament.
 */
function modeIdentityKey(mode: string | null | undefined, leagueMode?: string | null): string {
  if (isLeaguePoolMode(mode)) return isLeagueMode(leagueMode) ? leagueMode : 'pickem';
  return typeof mode === 'string' && isPoolMode(mode) ? mode : 'full_tournament';
}

/**
 * The pill's two colours for one mode, already resolved for the theme.
 *
 * The web ships three custom properties and lets `.mode-pill` pick between
 * them under `html.dark`; RN has no cascade, so the theme is resolved here and
 * the caller gets the two values it actually paints with.
 */
export function getModeChip(
  mode: string | null | undefined,
  leagueMode: string | null | undefined,
  isDark: boolean,
): { base: string; ink: string; tint: number } {
  const base = modeIdentityColor[modeIdentityKey(mode, leagueMode)];
  return {
    base,
    ink: withLightness(base, isDark ? INK_L_DARK : INK_L_LIGHT),
    tint: isDark ? TINT_DARK : TINT_LIGHT,
  };
}
