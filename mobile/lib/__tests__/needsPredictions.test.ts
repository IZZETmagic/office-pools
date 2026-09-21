import { describe, expect, it } from 'vitest'

import { poolNeedsPredictions, type NeedsPredictionsInput } from '../needsPredictions'

/** A World Cup pool, submitted. Each test names only what it changes. */
const base: NeedsPredictionsInput = {
  entryCount: 1,
  predictionMode: 'full_tournament',
  leagueHasSubmitted: null,
  progressiveUnsubmitted: false,
  entryHasSubmitted: true,
}
const at = (over: Partial<NeedsPredictionsInput>) => poolNeedsPredictions({ ...base, ...over })

describe('poolNeedsPredictions', () => {
  it('holds no opinion about a pool the member has no entry in', () => {
    expect(at({ entryCount: 0, entryHasSubmitted: false })).toBe(false)
    // Even when every other signal screams yes.
    expect(at({ entryCount: 0, leagueHasSubmitted: false })).toBe(false)
    expect(at({ entryCount: 0, predictionMode: 'progressive', progressiveUnsubmitted: true })).toBe(false)
  })

  describe('a World Cup pool still reads its own entry', () => {
    it('submitted', () => expect(at({})).toBe(false))
    it('not submitted', () => expect(at({ entryHasSubmitted: false })).toBe(true))
  })

  describe('a progressive pool reads the OPEN ROUND, not the entry', () => {
    // The entry-level flag goes true at the first round and never comes back
    // down, so a newly opened round is invisible to it.
    it('an open round is owed although the entry says submitted', () => {
      expect(at({ predictionMode: 'progressive', progressiveUnsubmitted: true })).toBe(true)
    })
    it('nothing open', () => {
      expect(at({ predictionMode: 'progressive', progressiveUnsubmitted: false })).toBe(false)
    })
  })

  describe('a league pool reads the SERVER, whatever its own entry says', () => {
    // ⚠ THE REGRESSION. `pool_entries.has_submitted_predictions` is false on
    // every league entry in production — all four modes, zero exceptions — so
    // a league pool that reached the World Cup branch below could only ever
    // say "Predictions needed". Last Man Standing is where it shows: one tap,
    // and the card said done (the ring) and not-done (the pill) at once.
    it('submitted — even though the entry flag is false', () => {
      expect(at({
        predictionMode: 'league_pickem',
        leagueHasSubmitted: true,
        entryHasSubmitted: false,
      })).toBe(false)
    })

    it('genuinely owed — `false` is an answer, not a missing value', () => {
      expect(at({
        predictionMode: 'league_pickem',
        leagueHasSubmitted: false,
        entryHasSubmitted: false,
      })).toBe(true)
    })

    it('an entry flag left true by something else cannot overrule the server', () => {
      expect(at({
        predictionMode: 'league_pickem',
        leagueHasSubmitted: false,
        entryHasSubmitted: true,
      })).toBe(true)
    })

    it('a progressive-shaped league pool still takes the server’s answer', () => {
      // Belt and braces: no production pool is both, but the league gate is
      // deliberately ahead of the progressive one, and the order is the rule.
      expect(at({
        predictionMode: 'progressive',
        leagueHasSubmitted: true,
        progressiveUnsubmitted: true,
      })).toBe(false)
    })
  })

  it('NULL falls through to the local count — a stale API must not blank the World Cup', () => {
    // ⚠ Null is "there are no league facts", not "nothing submitted". An API
    // older than `has_submitted` sends null for every pool, and every World Cup
    // card has to keep working against it.
    expect(at({ leagueHasSubmitted: null, entryHasSubmitted: true })).toBe(false)
    expect(at({ leagueHasSubmitted: null, entryHasSubmitted: false })).toBe(true)
  })
})
