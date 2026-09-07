import type { FixturePick } from './api';
import type { ResultsMatch } from './useTournamentMatches';

// =============================================================
// What a league pick says, in the shape its pool stores it
// =============================================================
// ⚠⚠ TWO PICK SHAPES, AND THE PREDICTION MODE DOES NOT TELL YOU WHICH.
//
// A league pool scoring EXACT SCORES stores `predicted_home_score` /
// `predicted_away_score` and leaves `predicted_outcome` null. A pool scoring
// OUTCOMES stores 'home' | 'draw' | 'away' and leaves both scores null. Both
// report `prediction_mode: 'league_pickem'`, so the mode is no help at all.
//
// Measured against production on 2026-09-07: of one member's 90 league picks,
// 70 were the outcome shape and 20 the scoreline shape — four pools to two. A
// renderer that reaches for `${home}–${away}` therefore prints a dash for the
// MAJORITY of picks, on a screen whose whole purpose is to stop telling members
// they have no pick when they do.
//
// ⚠ THEY ARE ALTERNATIVES, NOT A FALLBACK CHAIN. A null scoreline in an
// outcome pool is not "not filled in yet" — it is null forever, by design.
//
// ⚠ PURE, and in `lib/` so it can be tested: nothing here imports
// `react-native`. See the vitest config's rule for `mobile/**`.
// =============================================================

/** The engine's four scoring tiers, in the words a member reads. */
export function tierLabel(scoreType: string | null): string {
  switch (scoreType) {
    case 'exact': return 'Exact';
    case 'winner_gd': return 'Winner +GD';
    case 'winner': return 'Winner';
    case 'miss': return 'Miss';
    default: return '';
  }
}

/**
 * What the member actually picked.
 *
 * The scoreline is checked first because it is the more specific claim; an
 * outcome pool simply never has one. Falls back to an em dash only when the row
 * carries neither, which the database should not permit and the screen should
 * not crash over.
 */
export function pickLabel(
  pick: Pick<FixturePick, 'predictedHomeScore' | 'predictedAwayScore' | 'predictedOutcome'>,
  match: Pick<ResultsMatch, 'homeTeam' | 'awayTeam'>,
): string {
  if (pick.predictedHomeScore !== null && pick.predictedAwayScore !== null) {
    return `${pick.predictedHomeScore}–${pick.predictedAwayScore}`;
  }
  switch (pick.predictedOutcome) {
    // ⚠ THE CLUB'S NAME, NOT "HOME"/"AWAY". "You picked home" makes a member
    // work out who that was; the fixture already knows.
    case 'home':
      return match.homeTeam?.shortName ?? match.homeTeam?.countryName ?? 'Home win';
    case 'away':
      return match.awayTeam?.shortName ?? match.awayTeam?.countryName ?? 'Away win';
    case 'draw':
      return 'Draw';
    default:
      return '—';
  }
}
