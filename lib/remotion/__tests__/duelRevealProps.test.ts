// =============================================================
// The reveal's record, and the bye that must not inflate it
// =============================================================
// The gate itself (`league_duel_is_revealed`) is a database call and is covered
// by the route's integration, not here. What IS here is the one piece of real
// arithmetic in the module: a season record that no column holds, counted from
// settled duels — including the case that quietly gets it wrong.
// =============================================================

import { describe, it, expect } from 'vitest'
import { tallySeason } from '@/lib/remotion/duelRevealProps'
import { DUEL_WIN, DUEL_TIE, DUEL_BYE, DUEL_LOSS } from '@/lib/league/duelPoints'

const ME = 'me'

describe('tallySeason', () => {
  it('counts wins, ties and losses from either side of the row', () => {
    const s = tallySeason(
      ME,
      [
        { entry_a: ME, entry_b: 'x', points_a: DUEL_WIN, points_b: DUEL_LOSS },
        { entry_a: 'y', entry_b: ME, points_a: DUEL_WIN, points_b: DUEL_LOSS },
        { entry_a: ME, entry_b: 'z', points_a: DUEL_TIE, points_b: DUEL_TIE },
      ],
      { duel_points: 1250, final_rank: 2 },
    )
    expect(s).toEqual({ duelPoints: 1250, rank: 2, won: 1, tied: 1, lost: 1 })
  })

  it('⚠ does NOT count a bye as a tie', () => {
    // The regression this exists for: DUEL_BYE === DUEL_TIE, so anything reading
    // the points calls a bye a tie. In an odd-sized pool everybody gets one
    // every cycle, so the whole pool's record would drift upward together.
    expect(DUEL_BYE).toBe(DUEL_TIE)
    const s = tallySeason(
      ME,
      [{ entry_a: ME, entry_b: null, points_a: DUEL_BYE, points_b: null }],
      { duel_points: DUEL_BYE, final_rank: 4 },
    )
    expect(s.tied).toBe(0)
    expect(s.won + s.lost).toBe(0)
  })

  it('ignores duels the entry is not in', () => {
    const s = tallySeason(
      ME,
      [{ entry_a: 'a', entry_b: 'b', points_a: DUEL_WIN, points_b: DUEL_LOSS }],
      null,
    )
    expect(s).toEqual({ duelPoints: 0, rank: null, won: 0, tied: 0, lost: 0 })
  })

  it('survives a settled row with null points rather than counting it as a loss', () => {
    // `duelResult(null)` is null, so it falls through every branch. A duel the
    // engine has not priced is not a defeat.
    const s = tallySeason(
      ME,
      [{ entry_a: ME, entry_b: 'x', points_a: null, points_b: null }],
      null,
    )
    expect(s.won + s.tied + s.lost).toBe(0)
  })

  it('reports an unranked entry as null rather than 0', () => {
    expect(tallySeason(ME, [], { duel_points: 0, final_rank: null }).rank).toBeNull()
  })
})
