// =============================================================
// Which prediction surface a pool gets on a phone
// =============================================================
// `mobile/lib/leagueSurface.ts` decides between the league picker, an honest
// "not on the phone yet" placeholder, and the World Cup wizard. Three rules,
// each of which is a bug that has already happened somewhere in this codebase.
//
// ⚠ Tested from the ROOT suite because that is where vitest runs; the module
// under test is pure and has no React Native import, which is exactly why it was
// pulled out of the 900-line screen it used to live inside.
// =============================================================

import { describe, it, expect } from 'vitest'
import { predictionSurfaceFor } from '../../mobile/lib/leagueSurface'

describe('predictionSurfaceFor', () => {
  it('a World Cup pool gets the World Cup wizard', () => {
    expect(predictionSurfaceFor({ isLeague: false, leagueMode: null })).toBe('world-cup')
  })

  it('⚠ NO league pool reaches the World Cup wizard — including a NULL mode', () => {
    // The rule that matters, and the one most likely to be got wrong by someone
    // reaching for `leagueMode` as the discriminant. Two production pools carry
    // a season id with a NULL mode (created before migration 077), and sending
    // those to the World Cup wizard is the exact defect this closes: their picks
    // live in `league_predictions`, which that wizard never touches, so it
    // renders empty with nothing on screen to explain why.
    const modes = [null, 'pickem', 'showdown', 'table', 'last_man_standing'] as const
    for (const m of modes) {
      expect(
        predictionSurfaceFor({ isLeague: true, leagueMode: m }),
        `leagueMode=${m} must not reach the World Cup wizard`,
      ).toBe('league-read-only')
    }
  })
})
