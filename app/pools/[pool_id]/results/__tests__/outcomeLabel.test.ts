// =============================================================
// How a Results-depth tap reads on screen
// =============================================================
// A league pool at Results depth stores a TAP, not a scoreline. This is the one
// place that turns it into words, so it is the one place the words can be wrong
// — and "wrong" here means a member sees a prediction that is not the one they
// made, which is the failure the depth was designed around (Decision 9 forbids
// encoding home/draw/away as 1-0 / 0-0 / 0-1 for exactly this reason).
// =============================================================

import { describe, it, expect } from 'vitest'
import { outcomeLabel } from '../MatchCard'

const ARSENAL = { country_name: 'Arsenal' }
const CHELSEA = { country_name: 'Chelsea' }

describe('outcomeLabel', () => {
  it('names the club, because that is how a person says it', () => {
    expect(outcomeLabel({ predicted_outcome: 'home', home_team: ARSENAL, away_team: CHELSEA }))
      .toBe('Arsenal win')
    expect(outcomeLabel({ predicted_outcome: 'away', home_team: ARSENAL, away_team: CHELSEA }))
      .toBe('Chelsea win')
  })

  it('says Draw rather than naming nobody', () => {
    expect(outcomeLabel({ predicted_outcome: 'draw', home_team: ARSENAL, away_team: CHELSEA }))
      .toBe('Draw')
  })

  it('falls back to a side when the club is missing, never to a blank', () => {
    // A fixture whose clubs have not resolved yet must still say what was
    // picked — "Home win" is less good than "Arsenal win" and far better than
    // an empty string, which reads as no prediction at all.
    expect(outcomeLabel({ predicted_outcome: 'home', home_team: null, away_team: null }))
      .toBe('Home win')
    expect(outcomeLabel({ predicted_outcome: 'away', home_team: null, away_team: null }))
      .toBe('Away win')
  })

  it('returns null when there is no tap, so a scoreline pool is untouched', () => {
    expect(outcomeLabel({ predicted_outcome: null, home_team: ARSENAL, away_team: CHELSEA })).toBeNull()
    expect(outcomeLabel({ home_team: ARSENAL, away_team: CHELSEA })).toBeNull()
  })
})
