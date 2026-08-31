// The card's headline is a function of two numbers, so it is worth testing
// harder than anything else in the recap. A wrong verdict term is not a visual
// bug — it is the product asserting something untrue about somebody's week.

import { describe, it, expect } from 'vitest'

import {
  duelScoreline, duelVerdict, decisiveFixture, ONE_FIXTURE,
} from '../duelVerdict'
import { DUEL_WIN, DUEL_TIE, DUEL_LOSS, DUEL_BYE } from '../duelPoints'

/** Results depth: every fixture is 100 or 0. */
const results = (...hits: (0 | 1)[]) =>
  new Map(hits.map((h, i) => [i + 1, h * 100]))
/** Scores depth: 100 exact, 75 right margin, 50 right winner, 0 miss. */
const scores = (...pts: number[]) => new Map(pts.map((p, i) => [i + 1, p]))

describe('the scoreline counts fixtures, not points', () => {
  it('one point per fixture outscored', () => {
    const s = duelScoreline(results(1, 1, 1, 0, 0), results(1, 0, 0, 1, 0))
    expect(s.yourFixtures).toBe(2)   // 2 and 3
    expect(s.theirFixtures).toBe(1)  // 4
    expect(s.levelFixtures).toBe(2)  // 1 (both hit) and 5 (both missed)
    expect(s.yourPoints).toBe(300)
    expect(s.theirPoints).toBe(200)
  })

  it('⚠ counts the UNION, so a fixture only the opponent played still counts', () => {
    // An entry with no pick has no `league_match_scores` row at all. Iterating
    // one member's keys would hand the other fewer fixtures than they won.
    const you = new Map([[1, 100]])
    const them = new Map([[1, 0], [2, 100], [3, 100]])
    const s = duelScoreline(you, them)
    expect(s.theirFixtures, 'fixtures 2 and 3 must not vanish').toBe(2)
    expect(s.yourFixtures).toBe(1)
    expect(s.theirPoints).toBe(200)
  })

  it('survives a member with no rows at all', () => {
    const s = duelScoreline(undefined, results(1, 1))
    expect(s).toMatchObject({ yourFixtures: 0, theirFixtures: 2, yourPoints: 0, theirPoints: 200 })
  })
})

describe('the verdict term', () => {
  const v = (you: Map<number, number>, them: Map<number, number>, points: number) =>
    duelVerdict(duelScoreline(you, them), points, false)

  it('one fixture in it is a SPLIT DECISION', () => {
    expect(v(results(1, 1, 1, 1), results(1, 1, 1, 0), DUEL_WIN).term).toBe('SPLIT DECISION')
  })

  it('three fixtures is a DECISION', () => {
    expect(v(results(1, 1, 1, 1), results(1, 0, 0, 0), DUEL_WIN).term).toBe('DECISION')
  })

  it('four or more is UNANIMOUS', () => {
    expect(v(results(1, 1, 1, 1, 1), results(1, 0, 0, 0, 0), DUEL_WIN).term)
      .toBe('UNANIMOUS DECISION')
  })

  it('level is a DRAW whatever the fixtures did', () => {
    expect(v(results(1, 0, 1, 0), results(0, 1, 0, 1), DUEL_TIE).term).toBe('DRAW')
  })

  it('a SHUTOUT is the opponent scoring NOTHING, not merely losing badly', () => {
    expect(v(results(1, 1), results(0, 0), DUEL_WIN).term).toBe('SHUTOUT')
    // Losing 500-100 is wide, but they scored. That is a decision, not a shutout.
    expect(v(scores(100, 100, 100, 100, 100), scores(100, 0, 0, 0, 0), DUEL_WIN).term)
      .not.toBe('SHUTOUT')
  })

  it('a bye is its own thing and is never inferred from the points', () => {
    // DUEL_BYE is DUEL_TIE, so nothing downstream can tell them apart.
    expect(DUEL_BYE).toBe(DUEL_TIE)
    const bye = duelVerdict(duelScoreline(results(1, 1), undefined), DUEL_BYE, true)
    expect(bye.term).toBe('BYE')
    expect(bye.outcome).toBe('bye')
  })

  it('the outcome comes from the engine, not from the scoreline', () => {
    // Even where the fixtures look level, what the engine paid decides.
    expect(v(results(1, 1), results(1, 1), DUEL_LOSS).outcome).toBe('lost')
    expect(v(results(1, 1), results(1, 1), DUEL_WIN).outcome).toBe('won')
  })

  it('band edges land on the fixture, since a fixture caps at 100 in both depths', () => {
    const at = (margin: number) =>
      duelVerdict(
        { yourFixtures: 1, theirFixtures: 0, levelFixtures: 0,
          yourPoints: 400 + margin, theirPoints: 400 },
        DUEL_WIN, false,
      ).term
    expect(at(ONE_FIXTURE)).toBe('SPLIT DECISION')
    expect(at(ONE_FIXTURE + 1)).toBe('DECISION')
    expect(at(ONE_FIXTURE * 3)).toBe('DECISION')
    expect(at(ONE_FIXTURE * 3 + 1)).toBe('UNANIMOUS DECISION')
  })
})

describe('⚠ the scoreline can disagree with the result, and it must be flagged', () => {
  it('Scores depth: more fixtures, fewer points, duel lost', () => {
    // Six fixtures at 50 (right winner) = 300, against four at 100 = 400.
    const you = scores(50, 50, 50, 50, 50, 50, 0, 0, 0, 0)
    const them = scores(0, 0, 0, 0, 0, 0, 100, 100, 100, 100)
    const s = duelScoreline(you, them)
    expect(s.yourFixtures).toBe(6)
    expect(s.theirFixtures).toBe(4)
    expect(s.yourPoints).toBeLessThan(s.theirPoints)

    const verdict = duelVerdict(s, DUEL_LOSS, false)
    expect(verdict.outcome).toBe('lost')
    expect(verdict.scorelineDisagrees, 'the card would show 6-4 over "they beat you"').toBe(true)
  })

  it('Results depth: it can never disagree, since every fixture is 100 or 0', () => {
    for (const [a, b] of [[4, 2], [1, 5], [3, 3]] as const) {
      const you = results(...Array.from({ length: 10 }, (_, i) => (i < a ? 1 : 0) as 0 | 1))
      const them = results(...Array.from({ length: 10 }, (_, i) => (i >= 10 - b ? 1 : 0) as 0 | 1))
      const s = duelScoreline(you, them)
      const points = s.yourPoints > s.theirPoints ? DUEL_WIN
        : s.yourPoints === s.theirPoints ? DUEL_TIE : DUEL_LOSS
      expect(duelVerdict(s, points, false).scorelineDisagrees, `${a} v ${b}`).toBe(false)
    }
  })
})

describe('the decisive fixture', () => {
  it('is the tightest game that would have flipped the result', () => {
    // Margin 100. Fixture 4 (diff 100, swing 200) flips it; fixture 1 is level.
    const n = decisiveFixture(results(1, 1, 1, 1, 0), results(1, 1, 1, 0, 0))
    expect(n).toBe(4)
  })

  it('⚠ is NULL when no single fixture decided it, rather than naming one anyway', () => {
    // Won by three fixtures: flipping any one still leaves a lead.
    expect(decisiveFixture(results(1, 1, 1, 1), results(1, 0, 0, 0))).toBeNull()
  })

  it('is null on a draw — nothing was decided', () => {
    expect(decisiveFixture(results(1, 0), results(0, 1))).toBeNull()
  })

  it('prefers the CLOSEST qualifying fixture when several would flip it', () => {
    // Margin 50. Both fixture 1 (diff 50, swing 100) and fixture 2 (diff 100,
    // swing 200) would flip it; the tightest is the truer story.
    const you = scores(100, 100)
    const them = scores(50, 0)
    // you 200, them 50 -> margin 150; swing must exceed 150.
    // f1 swing 100 (no), f2 swing 200 (yes) -> f2.
    expect(decisiveFixture(you, them)).toBe(2)
  })
})
