// =============================================================
// A bye is not a draw
// =============================================================
// `DUEL_BYE === DUEL_TIE === 250` by design (migration 121), so every one of
// these is a test that the record is read STRUCTURALLY — `entry_b IS NULL` —
// rather than by value. The web shipped the value version: a member with one
// bye read "0W 0T 0L · 1 bye" in the card header and picked up a T in the table
// three inches below it.

import { describe, it, expect } from 'vitest'

import { buildDuelRecords } from '../duelRecord'
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
