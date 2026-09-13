import { describe, expect, it } from 'vitest'

import type { ClubRef, PickRow } from '../opponent'
import { samePick } from '../readOpponent'

// =============================================================
// When two pools hold two picks for one fixture
// =============================================================
// ## ⚠⚠ THIS RULE DECIDES MOST OF A LIFETIME DOSSIER
//
// Measured against production: 766 revealed prediction rows resolve to 310
// distinct `(user, fixture)` pairs, and on the seeded UX-test pools 180 of those
// 310 come back as disagreements. The seeded picks are RANDOM, so that ratio
// says nothing about real members — but it does say the rule is load-bearing
// rather than an edge case, and a wrong answer here silently halves or doubles
// every denominator on the club-bias card.
// =============================================================

const ARS: ClubRef = { clubId: 'ars', externalClubId: 42, name: 'Arsenal', abbreviation: 'ARS', crestUrl: null }
const CHE: ClubRef = { clubId: 'che', externalClubId: 49, name: 'Chelsea', abbreviation: 'CHE', crestUrl: null }

function pick(over: Partial<PickRow> = {}): PickRow {
  return {
    entry: 'e1',
    fixtureId: 'f1',
    matchweek: 1,
    kickoffAt: '2026-09-01T15:00:00+00:00',
    predictedHome: null,
    predictedAway: null,
    predictedOutcome: null,
    actualHome: 2,
    actualAway: 1,
    homeClub: ARS,
    awayClub: CHE,
    scoreType: null,
    points: null,
    ...over,
  }
}

const score = (h: number, a: number) => pick({ predictedHome: h, predictedAway: a })
const outcome = (o: 'home' | 'draw' | 'away') => pick({ predictedOutcome: o })

describe('two scorelines', () => {
  it('the same scoreline is the same judgement', () => {
    expect(samePick(score(2, 1), score(2, 1))).toBe(true)
  })

  it('⚠ a different scoreline is a conflict even when the WINNER agrees', () => {
    // 2–1 and 3–0 both back the home side, but in a Scores pool the scoreline IS
    // the judgement — they are worth different points and they are different
    // predictions. Collapsing them would let a lifetime signature scoreline be
    // assembled from picks the member never made.
    expect(samePick(score(2, 1), score(3, 0))).toBe(false)
  })

  it('opposite results conflict', () => {
    expect(samePick(score(2, 1), score(0, 2))).toBe(false)
  })
})

describe('⚠⚠ a Scores pool and a Results pool are not a disagreement', () => {
  // Migration 064 made `league_predictions` mutually exclusive per row: a Scores
  // pool files a scoreline with `predicted_outcome` null, a Results pool files
  // the outcome with both scores null. The same member in both files two
  // DIFFERENT-SHAPED rows for one fixture and neither is wrong.
  //
  // Treating the shape difference as a conflict would drop nearly every fixture
  // for anybody who plays both depths — which is the common case, and it would
  // make the lifetime dossier quietly WORSE than the pool one.

  it('2–1 agrees with "home win"', () => {
    expect(samePick(score(2, 1), outcome('home'))).toBe(true)
  })

  it('1–1 agrees with "draw"', () => {
    expect(samePick(score(1, 1), outcome('draw'))).toBe(true)
  })

  it('0–2 agrees with "away win"', () => {
    expect(samePick(score(0, 2), outcome('away'))).toBe(true)
  })

  it('but 2–1 conflicts with "away win"', () => {
    expect(samePick(score(2, 1), outcome('away'))).toBe(false)
  })

  it('and 1–1 conflicts with "home win"', () => {
    expect(samePick(score(1, 1), outcome('home'))).toBe(false)
  })
})

describe('two outcomes', () => {
  it('agree or they do not', () => {
    expect(samePick(outcome('home'), outcome('home'))).toBe(true)
    expect(samePick(outcome('home'), outcome('draw'))).toBe(false)
  })
})

describe('⚠ a row with neither shape never counts as agreement', () => {
  it('an empty pick cannot agree with anything, including another empty one', () => {
    // Migration 064's CHECK refuses a row with both or neither, so this should
    // be unreachable — which is exactly why it must not default to `true`. An
    // unreachable branch that silently agrees is how a bad row becomes a
    // confident statistic.
    expect(samePick(pick(), pick())).toBe(false)
    expect(samePick(pick(), score(2, 1))).toBe(false)
  })
})
