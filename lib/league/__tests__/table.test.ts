// =============================================================
// Table mode — the seed, and the two things a save refuses outright
// =============================================================
// `seedOrder` decides what a member sees the FIRST time they open the screen,
// and that is now ALPHABETICAL, always — overturning decision 12 (as revised by
// 17), which seeded from the live table. Pinned here because the property that
// matters is a fairness one and it is invisible in the UI: a pool created in
// November has to open on exactly the list an August pool opened on, or the two
// are playing the same mode at different difficulties.
//
// The second failure mode is silent too: a seed that quietly drops a club
// produces a nineteen-club prediction that scores slightly low forever, and
// nothing anywhere would report it.
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
  it('is alphabetical before a ball is kicked', () => {
    expect(seedOrder(CLUBS)).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('is STILL alphabetical once the season is under way', () => {
    // The whole point of the change. There is no argument to pass a live table
    // through any more, so the only thing this can assert is that mid-season
    // the answer has not moved — a pool created in matchweek 20 opens on the
    // same list as one created in matchweek 1.
    expect(seedOrder(CLUBS)).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('orders by NAME, not by whatever order the clubs arrived in', () => {
    // `CLUBS` is deliberately unsorted, so a seed that just passed the input
    // through would fail here rather than pass by accident.
    expect(seedOrder(CLUBS).map((id) => CLUBS.find((c) => c.club_id === id)!.club_name))
      .toEqual(['Apple United', 'Banana City', 'Cherry Town', 'Damson Rovers'])
  })

  it('never invents or loses a club', () => {
    // A prediction with a hole in it is not a prediction — it silently scores
    // nothing for the missing club, forever.
    const seeded = seedOrder(CLUBS)
    expect(seeded).toHaveLength(CLUBS.length)
    expect([...seeded].sort()).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('does not mutate the clubs it was handed', () => {
    // It sorts a copy. Sorting the caller's array in place would reorder the
    // very list the picking screen renders from.
    const before = CLUBS.map((c) => c.club_id)
    seedOrder(CLUBS)
    expect(CLUBS.map((c) => c.club_id)).toEqual(before)
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
