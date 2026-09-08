// =============================================================
// A bye is not a draw
// =============================================================
// `DUEL_BYE === DUEL_TIE === 250` by design (migration 121), so every one of
// these is a test that the record is read STRUCTURALLY — `entry_b IS NULL` —
// rather than by value. The web shipped the value version: a member with one
// bye read "0W 0T 0L · 1 bye" in the card header and picked up a T in the table
// three inches below it.

import { describe, it, expect } from 'vitest'

import { buildDuelRecords, duelMovement } from '../duelRecord'
import { DUEL_WIN, DUEL_TIE, DUEL_LOSS, DUEL_BYE } from '../duelPoints'
import type { DuelRow } from '../duels'

const duel = (over: Partial<DuelRow> & { duel_id: string; matchweek_number: number }): DuelRow => ({
  entry_a: 'me', entry_b: 'them',
  points_a: null, points_b: null,
  accuracy_a: null, accuracy_b: null,
  settled_at: null,
  ...over,
} as DuelRow)

describe('buildDuelRecords', () => {
  it('counts a bye as a bye, never as a tie', () => {
    // The bug, in one assertion. A bye pays DUEL_BYE, which IS DUEL_TIE.
    expect(DUEL_BYE).toBe(DUEL_TIE)
    const r = buildDuelRecords([
      duel({
        duel_id: 'd1', matchweek_number: 1, entry_b: null,
        points_a: DUEL_BYE, settled_at: '2026-08-20T00:00:00Z',
      }),
    ]).get('me')!
    expect(r.byes).toBe(1)
    expect(r.tied).toBe(0)
    expect(r.won + r.lost).toBe(0)
    // ...and it still PAYS. A bye is worth a draw, it is just not one.
    expect(r.duelPoints).toBe(DUEL_TIE)
    expect(r.form).toEqual(['bye'])
  })

  it('reads won / tied / lost off the points column, not a literal', () => {
    // ⚠ A win has been 500 since 121. `headToHead()` survived that sweep still
    // comparing against 3 and would have scored every meeting as a loss.
    const rows = buildDuelRecords([
      duel({
        duel_id: 'd1', matchweek_number: 1,
        points_a: DUEL_WIN, points_b: DUEL_LOSS, settled_at: '2026-08-20T00:00:00Z',
      }),
      duel({
        duel_id: 'd2', matchweek_number: 2,
        points_a: DUEL_TIE, points_b: DUEL_TIE, settled_at: '2026-08-27T00:00:00Z',
      }),
    ])
    expect(rows.get('me')).toMatchObject({ won: 1, tied: 1, lost: 0, byes: 0 })
    expect(rows.get('them')).toMatchObject({ won: 0, tied: 1, lost: 1, byes: 0 })
  })

  it('orders form by settled_at, never by matchweek number', () => {
    // ⚠ Rounds are played out of numerical order — 101 measured a minimum gap of
    // minus 121 days. A strip sorted by number shows results in an order they
    // never happened in.
    const r = buildDuelRecords([
      duel({
        duel_id: 'd9', matchweek_number: 9,
        points_a: DUEL_WIN, points_b: DUEL_LOSS, settled_at: '2026-08-01T00:00:00Z',
      }),
      duel({
        duel_id: 'd3', matchweek_number: 3,
        points_a: DUEL_LOSS, points_b: DUEL_WIN, settled_at: '2026-09-01T00:00:00Z',
      }),
    ]).get('me')!
    // Matchweek 9 was PLAYED first, so it comes first.
    expect(r.form).toEqual(['won', 'lost'])
  })

  it('gives an unsettled duel a row on zero rather than no row at all', () => {
    // The same call migration 085 makes: an UPDATE where an INSERT was needed
    // made entries vanish from the leaderboard instead of sitting last.
    const rows = buildDuelRecords([duel({ duel_id: 'd1', matchweek_number: 1 })])
    expect(rows.get('me')).toMatchObject({ won: 0, tied: 0, lost: 0, byes: 0, duelPoints: 0 })
    expect(rows.get('them')).toBeDefined()
  })

  it("prefers the engine's stored duel points to its own sum", () => {
    // A rescore moves `league_entry_totals.duel_points`; a table that kept
    // adding up the per-duel column would part company with the leaderboard.
    const rows = buildDuelRecords(
      [duel({
        duel_id: 'd1', matchweek_number: 1,
        points_a: DUEL_WIN, points_b: DUEL_LOSS, settled_at: '2026-08-20T00:00:00Z',
      })],
      new Map([['me', 1234]]),
    )
    expect(rows.get('me')!.duelPoints).toBe(1234)
    // No stored row for `them` — the local sum is the fallback, not a zero.
    expect(rows.get('them')!.duelPoints).toBe(DUEL_LOSS)
  })
})

describe('duelMovement', () => {
  const settled = (
    id: string, mw: number, a: string, b: string | null,
    pa: number, pb: number | null, at: string,
  ): DuelRow => duel({
    duel_id: id, matchweek_number: mw,
    entry_a: a, entry_b: b, points_a: pa, points_b: pb, settled_at: at,
  })

  it('measures against the board WITHOUT the last settled week', () => {
    // MW1: A beats B (A 500, B 0). MW2: B beats A (both on 500, A ahead on... a
    // tie, so B climbs past nobody) — use a third member to make it move.
    const duels = [
      settled('d1', 1, 'A', 'B', DUEL_WIN, DUEL_LOSS, '2026-08-20T00:00:00Z'),
      settled('d2', 1, 'C', 'D', DUEL_LOSS, DUEL_WIN, '2026-08-20T00:00:00Z'),
      // Second week: C wins, A loses. C goes 0 -> 500, A stays 500.
      settled('d3', 2, 'C', 'A', DUEL_WIN, DUEL_LOSS, '2026-08-27T00:00:00Z'),
      settled('d4', 2, 'B', 'D', DUEL_WIN, DUEL_LOSS, '2026-08-27T00:00:00Z'),
    ]
    // After both weeks: A 500, B 500, C 500, D 500 — all level, so the order is
    // whatever the caller renders. Pass one explicitly.
    const moved = duelMovement(duels, ['C', 'A', 'B', 'D'])
    // Before MW2: A 500 (1st), D 500 (2nd), B 0, C 0. C was 3rd or 4th and is
    // now 1st, so C climbed. A was 1st and is now 2nd, so A fell.
    expect(moved.get('C')).toBeGreaterThan(0)
    expect(moved.get('A')).toBeLessThan(0)
  })

  it('picks the most recently SETTLED week, not the highest-numbered one', () => {
    // ⚠ Rounds are played out of numerical order — 101 measured a minimum gap
    // of minus 121 days. Matchweek 9 here was played FIRST.
    const duels = [
      settled('d1', 9, 'A', 'B', DUEL_WIN, DUEL_LOSS, '2026-08-01T00:00:00Z'),
      settled('d2', 3, 'B', 'A', DUEL_WIN, DUEL_LOSS, '2026-09-01T00:00:00Z'),
    ]
    // The latest SETTLED week is 3. Removing it leaves week 9: A 500, B 0.
    // Now both are on 500, so the caller's order decides — B first.
    const moved = duelMovement(duels, ['B', 'A'])
    expect(moved.get('B')).toBe(1)   // was 2nd, now 1st
    expect(moved.get('A')).toBe(-1)  // was 1st, now 2nd
  })

  it('says nothing before anything has settled', () => {
    // Every position is a tie nobody moved into; an arrow would invent a story.
    expect(duelMovement([duel({ duel_id: 'd1', matchweek_number: 1 })], ['me']).size).toBe(0)
  })

  it('gives no arrow to a member who was not on the board before', () => {
    const duels = [
      settled('d1', 1, 'A', 'B', DUEL_WIN, DUEL_LOSS, '2026-08-20T00:00:00Z'),
    ]
    // Removing week 1 leaves nothing, so nobody has a prior position.
    expect(duelMovement(duels, ['A', 'B']).size).toBe(0)
  })
})
