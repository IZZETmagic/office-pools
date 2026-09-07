// =============================================================
// What a league pick says
// =============================================================
// One tiny function, tested hard, because it decides what the Predictions tab
// prints for a member who HAS predicted — and the failure mode is a dash rather
// than a crash.
//
// The shape that would have shipped: assume a scoreline. Against production on
// 2026-09-07 that renders "—" for 70 of one member's 90 picks, because four of
// their six pools score outcomes and store no scoreline at all. Both shapes
// report `prediction_mode: 'league_pickem'`, so nothing upstream warns you.
// =============================================================

import { describe, it, expect } from 'vitest';

import { pickLabel, tierLabel } from '../leaguePickLabel';
import type { ResultsTeam } from '../useTournamentMatches';

const team = (shortName: string | null, countryName = 'Full Name'): ResultsTeam => ({
  countryName,
  countryCode: null,
  flagUrl: null,
  shortName,
});

const MATCH = { homeTeam: team('Forest'), awayTeam: team('Spurs') };

describe('pickLabel — the scoreline shape', () => {
  it('renders a scoreline with an en dash', () => {
    expect(
      pickLabel({ predictedHomeScore: 2, predictedAwayScore: 1, predictedOutcome: null }, MATCH),
    ).toBe('2–1');
  });

  it('renders a 0-0 rather than treating zero as absent', () => {
    // `0` is falsy, and a `||` chain here would fall through to the outcome
    // branch and print an em dash over a perfectly good goalless prediction.
    expect(
      pickLabel({ predictedHomeScore: 0, predictedAwayScore: 0, predictedOutcome: null }, MATCH),
    ).toBe('0–0');
  });

  it('prefers the scoreline when a row somehow carries both', () => {
    expect(
      pickLabel({ predictedHomeScore: 3, predictedAwayScore: 0, predictedOutcome: 'home' }, MATCH),
    ).toBe('3–0');
  });
});

describe('pickLabel — the outcome shape', () => {
  it('⚠ names the CLUB, not "home" or "away"', () => {
    // "You picked home" makes a member work out who that was.
    expect(
      pickLabel({ predictedHomeScore: null, predictedAwayScore: null, predictedOutcome: 'home' }, MATCH),
    ).toBe('Forest');
    expect(
      pickLabel({ predictedHomeScore: null, predictedAwayScore: null, predictedOutcome: 'away' }, MATCH),
    ).toBe('Spurs');
  });

  it('says Draw', () => {
    expect(
      pickLabel({ predictedHomeScore: null, predictedAwayScore: null, predictedOutcome: 'draw' }, MATCH),
    ).toBe('Draw');
  });

  it('falls back to the full club name when there is no short one', () => {
    const m = { homeTeam: team(null, 'Nottingham Forest'), awayTeam: team(null, 'Tottenham') };
    expect(
      pickLabel({ predictedHomeScore: null, predictedAwayScore: null, predictedOutcome: 'home' }, m),
    ).toBe('Nottingham Forest');
  });

  it('falls back again when the club is missing entirely', () => {
    const m = { homeTeam: null, awayTeam: null };
    expect(
      pickLabel({ predictedHomeScore: null, predictedAwayScore: null, predictedOutcome: 'away' }, m),
    ).toBe('Away win');
  });
});

describe('pickLabel — neither shape', () => {
  it('⚠ a HALF scoreline is not a scoreline', () => {
    // The database should not permit it; the screen must not print "2–null".
    expect(
      pickLabel({ predictedHomeScore: 2, predictedAwayScore: null, predictedOutcome: null }, MATCH),
    ).toBe('—');
  });

  it('is an em dash when the row carries nothing at all', () => {
    expect(
      pickLabel({ predictedHomeScore: null, predictedAwayScore: null, predictedOutcome: null }, MATCH),
    ).toBe('—');
  });
});

describe('tierLabel', () => {
  it('names each of the engine\'s four tiers', () => {
    expect(tierLabel('exact')).toBe('Exact');
    expect(tierLabel('winner_gd')).toBe('Winner +GD');
    expect(tierLabel('winner')).toBe('Winner');
    expect(tierLabel('miss')).toBe('Miss');
  });

  it('is blank for an unscored fixture, which is not a tier', () => {
    expect(tierLabel(null)).toBe('');
  });

  it('is blank rather than echoing a tier the engine invents later', () => {
    expect(tierLabel('something_new')).toBe('');
  });
});
