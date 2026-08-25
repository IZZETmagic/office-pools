// =============================================================
// Table mode — the seed, and the two things a save refuses outright
// =============================================================
// `seedOrder` decides what a member sees the FIRST time they open the screen,
// and decision 12 (as revised by 17) makes that "the table as it stands, else
// alphabetical". It is worth pinning because the failure mode is silent: a seed
// that quietly drops a club produces a nineteen-club prediction that scores
// slightly low forever, and nothing anywhere would report it.
//
// The scoring arithmetic is NOT tested here. It lives in SQL and is verified
// against a real database by scripts/verify-table-mode.ts — reimplementing it
// in a test would be a second copy of the formula, which is the thing the
// design is specifically avoiding.
// =============================================================

import { describe, it, expect } from 'vitest'
import { seedOrder, saveTablePrediction, type SeasonClub } from '@/lib/league/table'

const club = (id: string, name: string): SeasonClub => ({
  club_id: id, club_name: name, crest_url: null, short_name: null,
})

// Deliberately NOT in alphabetical order, so a test that passes by accident
// because the input was already sorted cannot happen.
const CLUBS = [
  club('c3', 'Cherry Town'),
  club('c1', 'Apple United'),
  club('c4', 'Damson Rovers'),
  club('c2', 'Banana City'),
]

describe('seedOrder', () => {
  it('falls back to alphabetical before a ball is kicked', () => {
    expect(seedOrder(CLUBS, new Map())).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('uses the live table when there is one', () => {
    const standings = new Map([['c4', 1], ['c2', 2], ['c3', 3], ['c1', 4]])
    expect(seedOrder(CLUBS, standings)).toEqual(['c4', 'c2', 'c3', 'c1'])
  })

  it('APPENDS a club the table has not got rather than dropping it', () => {
    // A partial table is the realistic case: a newly promoted club can be
    // missing for a tick, and a prediction with a hole in it is not a
    // prediction — it silently scores nothing for that club, forever.
    const partial = new Map([['c4', 1], ['c2', 2]])
    const seeded = seedOrder(CLUBS, partial)
    expect(seeded).toHaveLength(4)
    expect(seeded.slice(0, 2)).toEqual(['c4', 'c2'])
    // The leftovers keep a stable, explainable order rather than whatever the
    // database happened to return.
    expect(seeded.slice(2)).toEqual(['c1', 'c3'])
  })

  it('never invents or loses a club', () => {
    const seeded = seedOrder(CLUBS, new Map([['c1', 2], ['c2', 1]]))
    expect([...seeded].sort()).toEqual(['c1', 'c2', 'c3', 'c4'])
  })
})

describe('saveTablePrediction refuses two shapes before it touches the database', () => {
  // `null as never` is safe precisely because these two guards return first —
  // if either ever stopped short-circuiting, this test would throw rather than
  // quietly pass, which is the behaviour we want from it.
  const noClient = null as never

  it('an empty ordering is not a prediction', async () => {
    const r = await saveTablePrediction(noClient, 'e1', [])
    expect(r.error).toMatch(/empty ordering/)
    expect(r.stored).toBe(0)
  })

  it('a duplicated club is caught here, not at the constraint', async () => {
    // The constraint would report a POSITION collision, which is true but
    // describes the symptom rather than the mistake.
    const r = await saveTablePrediction(noClient, 'e1', ['c1', 'c2', 'c1'])
    expect(r.error).toMatch(/same club appears twice/)
  })
})
