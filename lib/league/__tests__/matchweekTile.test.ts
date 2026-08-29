// =============================================================
// The card's matchweek tile
// =============================================================
// Ryan, 2026-08-29, on a Premier League card during the second weekend of the
// season: "Why is the premier league in Match week 3?? when teams are only just
// playing for the second time right now?"
//
// The tile had been handed the OPEN matchweek — correct for "what can I still
// pick", wrong under a label that reads as "where is the season". These pin the
// distinction, because the two numbers agree four days a week and the bug is
// invisible on those days.

import { describe, it, expect } from 'vitest'
import { matchweekTile } from '@/lib/league/matchweekTile'

describe('matchweekTile — the number under the word "Matchweek"', () => {
  it('shows the matchweek being played, not the one open for picks', () => {
    // The exact card Ryan was looking at: MW2 being played, MW3 open.
    expect(matchweekTile({
      inPlayMatchweekNumber: 2,
      openMatchweekNumber: 3,
      matchweekCount: 38,
    })).toEqual({ number: 2, caption: 'in play' })
  })

  it('falls back to the open matchweek between rounds', () => {
    expect(matchweekTile({
      inPlayMatchweekNumber: null,
      openMatchweekNumber: 3,
      matchweekCount: 38,
    })).toEqual({ number: 3, caption: 'of 38' })
  })

  it('says the season is over rather than showing a bare dash', () => {
    expect(matchweekTile({
      inPlayMatchweekNumber: null,
      openMatchweekNumber: null,
      matchweekCount: 38,
    })).toEqual({ number: null, caption: 'Season over' })
  })

  it('reads the season length from the season, never 38', () => {
    // Bundesliga is eighteen clubs and 34 rounds.
    expect(matchweekTile({
      openMatchweekNumber: 5,
      matchweekCount: 34,
    }).caption).toBe('of 34')
  })

  it('degrades to "this week" when the count is missing', () => {
    // A card is decoration around a link: an unreadable count must not blank
    // the caption or print "of 0".
    expect(matchweekTile({ openMatchweekNumber: 5, matchweekCount: 0 }).caption).toBe('this week')
    expect(matchweekTile({ openMatchweekNumber: 5 }).caption).toBe('this week')
  })

  it('treats a World Cup card’s absent fields as a finished season, not a crash', () => {
    expect(matchweekTile({})).toEqual({ number: null, caption: 'Season over' })
  })
})
