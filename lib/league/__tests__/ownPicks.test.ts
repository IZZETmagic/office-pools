// The regression this file exists for: on `Showdown: Exact Scores` a member
// with all ten scorelines filed was told "0 / 10" and asked to finish picks
// they had already made. The cause was counting the outcomes array alone —
// which is empty, not partial, for a Scores pool.
//
// So the first test is the reported bug, written as the data actually looked
// on 2026-09-01: ten score-shaped rows, zero outcome-shaped ones.

import { describe, it, expect } from 'vitest'

import { ownPickDirections, directionOf } from '../ownPicks'

const MINE = 'entry-mine'
const THEIRS = 'entry-theirs'

const score = (entry_id: string, match_id: string, h: number, a: number) =>
  ({ entry_id, match_id, predicted_home_score: h, predicted_away_score: a })
const tap = (entry_id: string, match_id: string, outcome: 'home' | 'draw' | 'away') =>
  ({ entry_id, match_id, outcome })

describe('a Scores pool files scorelines and NO outcomes', () => {
  it('⚠ counts a full sheet of scorelines as picked', () => {
    // Ten fixtures, ten scorelines, an empty outcomes array — the exact shape
    // that rendered 0 / 10.
    const predictions = Array.from({ length: 10 }, (_, i) => score(MINE, `fx-${i}`, 2, 1))
    const picked = ownPickDirections(MINE, [], predictions)
    expect(picked.size, 'a scoreline IS a pick').toBe(10)
  })

  it('a half-finished sheet is half, not zero', () => {
    const predictions = [score(MINE, 'fx-1', 1, 0), score(MINE, 'fx-2', 0, 0)]
    const picked = ownPickDirections(MINE, [], predictions)
    expect(picked.size).toBe(2)
    expect([...picked.keys()].sort()).toEqual(['fx-1', 'fx-2'])
  })

  it('reads the direction out of the scoreline, for the tendency bar', () => {
    const picked = ownPickDirections(MINE, [], [
      score(MINE, 'fx-1', 2, 1),
      score(MINE, 'fx-2', 0, 0),
      score(MINE, 'fx-3', 1, 3),
    ])
    expect(picked.get('fx-1')).toBe('home')
    expect(picked.get('fx-2')).toBe('draw')
    expect(picked.get('fx-3')).toBe('away')
  })
})

describe('a Results pool still works, unchanged', () => {
  it('counts taps with no predictions array at all', () => {
    const picked = ownPickDirections(MINE, [
      tap(MINE, 'fx-1', 'home'), tap(MINE, 'fx-2', 'draw'),
    ], [])
    expect(picked.size).toBe(2)
    expect(picked.get('fx-2')).toBe('draw')
  })
})

describe('it only ever answers for YOU', () => {
  it('ignores every other entry, in both shapes', () => {
    const picked = ownPickDirections(MINE, [
      tap(THEIRS, 'fx-1', 'home'),
      tap(MINE, 'fx-2', 'away'),
    ], [
      score(THEIRS, 'fx-3', 4, 0),
      score(MINE, 'fx-4', 1, 1),
    ])
    expect([...picked.keys()].sort()).toEqual(['fx-2', 'fx-4'])
  })

  it('a viewer with no entry — a super admin looking in — picks nothing', () => {
    expect(ownPickDirections(null, [tap(MINE, 'fx-1', 'home')], []).size).toBe(0)
    expect(ownPickDirections(undefined, [], [score(MINE, 'fx-1', 1, 0)]).size).toBe(0)
  })
})

describe('the collision rule matches pickLabel', () => {
  it('⚠ a tap wins over a scoreline on the same fixture', () => {
    // The CHECK constraint says a row cannot carry both. This does not depend
    // on that being true, and neither does `DuelsTab`'s `pickLabel` — two
    // readers disagreeing about one row is worse than either answer.
    const picked = ownPickDirections(MINE,
      [tap(MINE, 'fx-1', 'away')],
      [score(MINE, 'fx-1', 3, 0)])
    expect(picked.size, 'one fixture, not two').toBe(1)
    expect(picked.get('fx-1')).toBe('away')
  })
})

describe('directionOf', () => {
  it('a level scoreline is a draw, not a home win', () => {
    expect(directionOf(0, 0)).toBe('draw')
    expect(directionOf(3, 3)).toBe('draw')
  })
  it('the bigger number takes it', () => {
    expect(directionOf(1, 0)).toBe('home')
    expect(directionOf(0, 1)).toBe('away')
  })
})
