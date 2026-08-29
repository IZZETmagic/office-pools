// =============================================================
// pickBestEntry must sort on the leaderboard the CARD reads
// =============================================================
// The module's own header records this failing once: best-by-`total_points`, a
// column v2 scoring never writes, degenerated to "whichever entry the database
// returned first". It then failed the same way one layer along — `current_rank`
// and `scored_total_points` live on `pool_entries`, which is the leaderboard
// only for a **prod** pool. For a league entry both are NULL in production, so
// a member with two entries got an arbitrary one, and the card showed that
// entry's points and form dots under a rank belonging to the other.
//
// Measured on production while fixing it: passing the scoring map moved
// "Showdown: Exact Scores" from 0 points at rank 6 to 50 points at rank 1.
// =============================================================

import { describe, it, expect } from 'vitest'
import { pickBestEntry } from '@/lib/bestEntry'

/** Two league entries, exactly as `pool_entries` holds them: nothing at all. */
const LEAGUE_ENTRIES = [
  { entry_id: 'e1', current_rank: null, scored_total_points: null },
  { entry_id: 'e2', current_rank: null, scored_total_points: null },
]

describe('a league pool', () => {
  it('⚠ picks arbitrarily without the scoring map — the bug', () => {
    // Not an assertion that this is correct. It pins WHY the argument exists:
    // with every sort key null the reduce keeps the first row it was handed,
    // and the order rows arrive in is not a leaderboard.
    expect(pickBestEntry(LEAGUE_ENTRIES)?.entry_id).toBe('e1')
  })

  it('picks the league leader when given the map', () => {
    const scored = new Map([
      ['e1', { current_rank: 7, scored_total_points: 20 }],
      ['e2', { current_rank: 1, scored_total_points: 140 }],
    ])
    expect(pickBestEntry(LEAGUE_ENTRIES, scored)?.entry_id).toBe('e2')
  })

  it('breaks a rank tie on the scored points from the same source', () => {
    const scored = new Map([
      ['e1', { current_rank: 3, scored_total_points: 20 }],
      ['e2', { current_rank: 3, scored_total_points: 90 }],
    ])
    expect(pickBestEntry(LEAGUE_ENTRIES, scored)?.entry_id).toBe('e2')
  })

  it('sorts an unranked entry last even against a poor rank', () => {
    const scored = new Map([['e2', { current_rank: 19, scored_total_points: 4 }]])
    expect(pickBestEntry(LEAGUE_ENTRIES, scored)?.entry_id).toBe('e2')
  })
})

describe('a prod pool is unchanged', () => {
  const PROD_ENTRIES = [
    { entry_id: 'a', current_rank: 4, scored_total_points: 10 },
    { entry_id: 'b', current_rank: 2, scored_total_points: 30 },
    { entry_id: 'c', current_rank: null, scored_total_points: 99 },
  ]

  it('still reads pool_entries when no map is passed', () => {
    expect(pickBestEntry(PROD_ENTRIES)?.entry_id).toBe('b')
  })

  it('is byte-identical with an empty map', () => {
    // The prod path passes a map that has no rows for these entries. It must
    // behave exactly as the no-argument call, or 623 World Cup pools change.
    expect(pickBestEntry(PROD_ENTRIES, new Map())).toEqual(pickBestEntry(PROD_ENTRIES))
  })

  it('falls back per entry, not all-or-nothing', () => {
    // A half-populated map is the realistic case mid-migration: one entry has a
    // shadow row and the other does not. Each entry uses the best source it has
    // rather than the whole comparison reverting.
    const scored = new Map([['a', { current_rank: 1, scored_total_points: 500 }]])
    expect(pickBestEntry(PROD_ENTRIES, scored)?.entry_id).toBe('a')
  })

  it('returns null for no entries', () => {
    expect(pickBestEntry([], new Map())).toBeNull()
  })
})
