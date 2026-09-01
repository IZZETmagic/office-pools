// =============================================================
// A render is an authorization surface
// =============================================================
// The endpoint takes an id from the caller and hands back a file. These pin the
// two decisions that cannot be got wrong: who the card calls "you", and when a
// render is refused outright.
//
// The IO half (`buildDuelRecapProps`) needs a database and is not covered here;
// what IS covered is every branch that decides an outcome, extracted as pure
// functions for exactly that reason.
// =============================================================

import { describe, it, expect } from 'vitest'
import { orient, toProps, type DuelRow } from '@/lib/remotion/duelRecapProps'
import { DUEL_WIN, DUEL_LOSS, DUEL_BYE } from '@/lib/league/duelPoints'

const A = 'entry-a'
const B = 'entry-b'

function duel(over: Partial<DuelRow> = {}): DuelRow {
  return {
    duel_id: 'd1',
    pool_id: 'p1',
    matchweek_number: 4,
    entry_a: A,
    entry_b: B,
    accuracy_a: 400,
    accuracy_b: 200,
    points_a: DUEL_WIN,
    points_b: DUEL_LOSS,
    settled_at: '2026-08-31T20:59:00Z',
    ...over,
  }
}

const sideA = { name: 'Marcus Bell', person: { user_id: 'u-a', full_name: 'Marcus Bell', username: 'Marcus' } }
const sideB = { name: 'Mia Torres', person: { user_id: 'u-b', full_name: 'Mia Torres', username: 'Mia T' } }

describe('orient — which side is "you"', () => {
  it('finds the viewer on either side', () => {
    expect(orient(duel(), [A])).toEqual({ youIsA: true })
    expect(orient(duel(), [B])).toEqual({ youIsA: false })
  })

  it('refuses a duel the viewer is not in', () => {
    // ⚠ Membership is necessary, not sufficient. A member of the pool who is
    // not in THIS duel must not get a card telling them they won it.
    expect(orient(duel(), ['someone-else'])).toBeNull()
    expect(orient(duel(), [])).toBeNull()
  })

  it('never matches the empty slot of a bye', () => {
    // `entry_b` null is the bye. An empty viewer id list must not coincide with
    // it, and neither must anything else.
    expect(orient(duel({ entry_b: null }), [B])).toBeNull()
    expect(orient(duel({ entry_b: null }), [A])).toEqual({ youIsA: true })
  })

  it('handles a multi-entry member', () => {
    expect(orient(duel(), ['other-entry', B])).toEqual({ youIsA: false })
  })
})

describe('toProps — the card describes the viewer, not entry A', () => {
  it('reads the winner as "you" when the viewer is A', () => {
    const p = toProps(duel(), true, 'The Office', sideA, sideB)
    expect(p.you.name).toBe('Marcus Bell')
    expect(p.you.score).toBe(400)
    expect(p.them!.name).toBe('Mia Torres')
    expect(p.them!.score).toBe(200)
    expect(p.points).toBe(DUEL_WIN)
  })

  it('MIRRORS when the viewer is B — the same row, the other story', () => {
    // ⚠ The regression this exists for: one orientation for everybody would
    // tell the loser they won. Same row, same scores, opposite reading.
    const p = toProps(duel(), false, 'The Office', sideA, sideB)
    expect(p.you.name).toBe('Mia Torres')
    expect(p.you.score).toBe(200)
    expect(p.them!.name).toBe('Marcus Bell')
    expect(p.them!.score).toBe(400)
    expect(p.points).toBe(DUEL_LOSS)
  })

  it('carries a bye through as them: null, not as a 0–0 draw', () => {
    const p = toProps(
      duel({ entry_b: null, accuracy_b: null, points_a: DUEL_BYE, points_b: null }),
      true, 'The Office', sideA, null,
    )
    expect(p.them).toBeNull()
    expect(p.points).toBe(DUEL_BYE)
  })

  it('defaults a null accuracy to 0 rather than rendering NaN', () => {
    const p = toProps(duel({ accuracy_a: null }), true, 'The Office', sideA, sideB)
    expect(p.you.score).toBe(0)
  })

  it('passes the matchweek and pool name straight through', () => {
    const p = toProps(duel({ matchweek_number: 12 }), true, 'Showdown Duels', sideA, sideB)
    expect(p.matchweek).toBe(12)
    expect(p.poolName).toBe('Showdown Duels')
  })
})
