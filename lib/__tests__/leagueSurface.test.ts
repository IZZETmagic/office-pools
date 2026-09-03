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
    // reaching for `leagueMode` as the discriminant. THREE production pools
    // carry a season id with a NULL mode — `galacticoco`, `uffff` and the
    // archived `MFWs PL Pool`, counted 2026-09-03 — and sending those to the
    // World Cup wizard is the exact defect this closes: their picks live in
    // `league_predictions`, which that wizard never touches, so it renders empty
    // with nothing on screen to explain why.
    //
    // ⚠ ASSERTED AS "not the wizard", NOT as one specific surface. It used to
    // demand `league-read-only` for every mode, which made it fail the moment
    // Table mode got a real picker on 2026-09-03 — a correct change breaking a
    // test that was pinning today's answer rather than the rule. A mode is
    // allowed to gain its own surface; none of them is allowed to gain the
    // World Cup's.
    const modes = [null, 'pickem', 'showdown', 'table', 'last_man_standing'] as const
    for (const m of modes) {
      expect(
        predictionSurfaceFor({ isLeague: true, leagueMode: m }),
        `leagueMode=${m} must not reach the World Cup wizard`,
      ).not.toBe('world-cup')
    }
  })

  it('table mode gets its own picker; every other league mode is read-only', () => {
    // The mode may choose BETWEEN league surfaces — it just may never decide
    // whether this is a league at all, which is what `isLeague` is for.
    expect(predictionSurfaceFor({ isLeague: true, leagueMode: 'table' })).toBe('league-table')
    for (const m of [null, 'pickem', 'showdown', 'last_man_standing'] as const) {
      expect(
        predictionSurfaceFor({ isLeague: true, leagueMode: m }),
        `leagueMode=${m} has had no picker design pass`,
      ).toBe('league-read-only')
    }
  })
})
