// =============================================================
// Competition rounds — the league round model.
// =============================================================
// The failure this file exists to prevent is quiet, not loud. Every call site
// resolves a round's fixtures as `ROUND_MATCH_STAGES[key] ?? []`. A matchweek
// key is not in that map, so it coalesces to `[]` — a round that opens,
// contains no fixtures, accepts no predictions, and reports no error. Same
// shape as the zero-scoring league pool: valid-looking emptiness.
//
// So the assertions here are mostly "does this select the RIGHT fixtures",
// plus the two ordering traps that would misfire a whole season.
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  matchweekKey,
  matchweekNumber,
  isMatchweekKey,
  bracketRoundDefs,
  leagueRoundDefs,
  roundDefsFor,
  roundLabel,
  matchesInRound,
  nextRoundKey,
  sortRoundKeys,
  type RoundableMatch,
} from '@/lib/competitionRounds'

function league(roundNumber: number | null, n = 1): RoundableMatch[] {
  return Array.from({ length: n }, () => ({ stage: 'regular_season', round_number: roundNumber }))
}

describe('matchweek keys', () => {
  it('round-trips', () => {
    expect(matchweekKey(12)).toBe('mw_12')
    expect(matchweekNumber('mw_12')).toBe(12)
    expect(isMatchweekKey('mw_38')).toBe(true)
  })

  it('rejects anything that would not round-trip identically', () => {
    // Each of these, if coerced, would produce a SECOND pool_round_states row
    // for a matchweek that already has one.
    for (const bad of ['mw_012', 'mw_0', 'mw_', 'mw_x', 'MW_12', 'mw_1.5', 'mw_-3', 'group', 'final', '']) {
      expect(matchweekNumber(bad), bad).toBeNull()
    }
  })
})

describe('leagueRoundDefs — derived from fixtures, not a constant', () => {
  it('produces one round per distinct matchweek, in order', () => {
    const matches = [...league(3, 10), ...league(1, 10), ...league(2, 10)]
    const defs = leagueRoundDefs(matches)
    expect(defs.map((d) => d.key)).toEqual(['mw_1', 'mw_2', 'mw_3'])
    expect(defs.map((d) => d.order)).toEqual([0, 1, 2])
    expect(defs[1].label).toBe('Matchweek 2')
  })

  it('handles the real league shapes without any per-league code', () => {
    // 20 clubs -> 38 (EPL, La Liga, Serie A); 18 -> 34 (Bundesliga, Ligue 1);
    // 24 -> 46 (Championship). Verified against api-football 2026-08-14.
    for (const count of [34, 38, 46]) {
      const matches = Array.from({ length: count }, (_, i) => league(i + 1)).flat()
      expect(leagueRoundDefs(matches)).toHaveLength(count)
    }
  })

  it('skips fixtures with no matchweek — that is how play-off rounds arrive', () => {
    // Bundesliga / Ligue 1 / Eredivisie / Championship all carry a "Final" or
    // "Semi-finals" round whose label has no trailing ordinal, so the importer
    // stores round_number = NULL. Those are not matchweeks.
    const defs = leagueRoundDefs([...league(1), ...league(null, 2), ...league(2)])
    expect(defs.map((d) => d.key)).toEqual(['mw_1', 'mw_2'])
  })

  it('ignores non-league fixtures even if they carry a round_number', () => {
    const defs = leagueRoundDefs([
      ...league(1),
      { stage: 'quarter_final', round_number: 2 },
    ])
    expect(defs.map((d) => d.key)).toEqual(['mw_1'])
  })
})

describe('matchesInRound — the silent-empty trap', () => {
  const season: RoundableMatch[] = [
    { stage: 'regular_season', round_number: 1 },
    { stage: 'regular_season', round_number: 1 },
    { stage: 'regular_season', round_number: 2 },
    { stage: 'quarter_final', round_number: null },
  ]

  it('selects a matchweek by round_number, not by stage', () => {
    expect(matchesInRound(season, 'mw_1')).toHaveLength(2)
    expect(matchesInRound(season, 'mw_2')).toHaveLength(1)
  })

  it('returns nothing for a matchweek that has no fixtures', () => {
    expect(matchesInRound(season, 'mw_9')).toHaveLength(0)
  })

  it('still selects bracket rounds by stage', () => {
    expect(matchesInRound(season, 'quarter_final')).toHaveLength(1)
    expect(matchesInRound(season, 'group')).toHaveLength(0)
  })

  it('does not let a bracket fixture leak into a matchweek', () => {
    const withCup: RoundableMatch[] = [{ stage: 'final', round_number: 1 }]
    expect(matchesInRound(withCup, 'mw_1')).toHaveLength(0)
  })
})

describe('nextRoundKey — replaces the static ROUND_ORDER map', () => {
  const season = Array.from({ length: 38 }, (_, i) => matchweekKey(i + 1))

  it('advances through a season and stops at the end', () => {
    expect(nextRoundKey('mw_1', season)).toBe('mw_2')
    expect(nextRoundKey('mw_9', season)).toBe('mw_10')
    expect(nextRoundKey('mw_37', season)).toBe('mw_38')
    expect(nextRoundKey('mw_38', season)).toBeNull()
  })

  it('ends the season at the right matchweek for a shorter league', () => {
    // Bundesliga: 34, not 38. A static map would have run off the end.
    const bundesliga = Array.from({ length: 34 }, (_, i) => matchweekKey(i + 1))
    expect(nextRoundKey('mw_33', bundesliga)).toBe('mw_34')
    expect(nextRoundKey('mw_34', bundesliga)).toBeNull()
  })

  it('steps over a gap rather than dead-ending on it', () => {
    expect(nextRoundKey('mw_2', ['mw_1', 'mw_2', 'mw_4'])).toBe('mw_4')
  })

  it('returns null for a key that is not in the season', () => {
    expect(nextRoundKey('mw_99', season)).toBeNull()
  })

  it('still walks the World Cup bracket in order', () => {
    const wc = ['final', 'group', 'round_16', 'round_32', 'semi_final', 'third_place', 'quarter_final']
    expect(nextRoundKey('group', wc)).toBe('round_32')
    expect(nextRoundKey('semi_final', wc)).toBe('third_place')
    expect(nextRoundKey('final', wc)).toBeNull()
  })
})

describe('sortRoundKeys — the lexical trap', () => {
  it('orders matchweeks numerically, not as strings', () => {
    // The bug this prevents: a lexical sort gives mw_1, mw_10, mw_11, ... mw_2,
    // which would open matchweek 10 second and run the season out of order.
    const shuffled = ['mw_10', 'mw_2', 'mw_1', 'mw_21', 'mw_3']
    expect(sortRoundKeys(shuffled)).toEqual(['mw_1', 'mw_2', 'mw_3', 'mw_10', 'mw_21'])
  })

  it('keeps bracket keys in competition order, not alphabetical', () => {
    expect(sortRoundKeys(['final', 'group', 'quarter_final'])).toEqual(['group', 'quarter_final', 'final'])
  })

  it('does not drop unrecognised keys', () => {
    const out = sortRoundKeys(['mw_2', 'something_new', 'mw_1'])
    expect(out).toHaveLength(3)
    expect(out.slice(0, 2)).toEqual(['mw_1', 'mw_2'])
  })
})

describe('roundLabel', () => {
  it('never shows a member a raw matchweek key', () => {
    expect(roundLabel('mw_12')).toBe('Matchweek 12')
  })

  it('keeps the World Cup labels', () => {
    expect(roundLabel('quarter_final')).toBe('Quarter Finals')
  })

  it('falls back to the key for anything unknown', () => {
    expect(roundLabel('who_knows')).toBe('who_knows')
  })
})

describe('roundDefsFor — dispatch on format', () => {
  it('gives the bracket its seven rounds regardless of fixtures', () => {
    expect(roundDefsFor('groups_knockout', [])).toHaveLength(bracketRoundDefs().length)
  })

  it('gives a league its matchweeks', () => {
    const defs = roundDefsFor('league', [...league(1), ...league(2)])
    expect(defs.map((d) => d.key)).toEqual(['mw_1', 'mw_2'])
  })
})
