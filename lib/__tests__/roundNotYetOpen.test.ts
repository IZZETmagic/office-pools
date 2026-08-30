// =============================================================
// "Why is matchweek 2 not visible?"
// =============================================================
// Reported by Ryan, 30 Aug 2026. Matchweek 2 was the week being PLAYED — eight
// of its ten fixtures already complete — and the Predictions screen answered
// with a padlock and "Matchweek 2 predictions are not yet available. Opens as
// soon as the previous matchweek locks, at its first kickoff." Every word of
// that is about a week that has not started yet.
//
// The cause is that `'locked'` is two states wearing one name, which
// `matchweekToRoundState` documents and every reader then forgot. Confirmed
// against production the same day:
//
//   MW1  completed  10/10  lock 21 Aug
//   MW2  locked      8/10  lock 28 Aug   <- played, and hidden
//   MW3  open        0/10  lock  4 Sep
//   MW4  locked      0/10  lock 12 Sep   <- genuinely not yet available
//
// MW2 and MW4 are the same string. Only the deadline tells them apart.

import { describe, it, expect } from 'vitest'
import { isRoundNotYetOpen } from '@/lib/competitionRounds'

const PAST = '2020-01-01T00:00:00Z'
const FUTURE = '2099-01-01T00:00:00Z'

describe('isRoundNotYetOpen', () => {
  it('is true for a matchweek whose turn has not come', () => {
    // MW4 on the day of the report.
    expect(isRoundNotYetOpen({ state: 'locked', deadline: FUTURE })).toBe(true)
  })

  it('is true for an unopened World Cup round, which has no deadline yet', () => {
    // seedPoolRoundStates writes the six knockout rounds locked with a null
    // deadline; the cascade sets one when it opens them.
    expect(isRoundNotYetOpen({ state: 'locked', deadline: null })).toBe(true)
  })

  it('is FALSE for a matchweek that has already locked — the bug', () => {
    // MW2. Locked, but locked because it started. The member has picks in it
    // and every right to look at them.
    expect(isRoundNotYetOpen({ state: 'locked', deadline: PAST })).toBe(false)
  })

  it('is false for every state that is not locked', () => {
    for (const state of ['open', 'in_progress', 'completed']) {
      expect(isRoundNotYetOpen({ state, deadline: PAST }), state).toBe(false)
      expect(isRoundNotYetOpen({ state, deadline: FUTURE }), state).toBe(false)
      expect(isRoundNotYetOpen({ state, deadline: null }), state).toBe(false)
    }
  })

  it('is false when there is no round at all', () => {
    // The flow renders a synthetic locked placeholder when a key has no state
    // row; null and undefined must not crash it into a padlock either.
    expect(isRoundNotYetOpen(null)).toBe(false)
    expect(isRoundNotYetOpen(undefined)).toBe(false)
  })

  it('treats a deadline exactly now as passed', () => {
    // Boundary. `> new Date()` rather than `>=`, so the instant a matchweek
    // locks it becomes readable rather than spending a tick claiming it has
    // not opened.
    const now = new Date().toISOString()
    expect(isRoundNotYetOpen({ state: 'locked', deadline: now })).toBe(false)
  })
})

describe('the screen asks the predicate, not the string', () => {
  it('gates the lock screen on isRoundNotYetOpen', async () => {
    const { readFileSync } = await import('fs')
    const { resolve } = await import('path')
    const flow = readFileSync(
      resolve(process.cwd(), 'components/predictions/ProgressivePredictionsFlow.tsx'),
      'utf8',
    )
    expect(flow).toContain('{isRoundNotYetOpen(currentRoundState) ? (')
    // The raw comparison is what hid a matchweek that was on.
    expect(flow).not.toContain("currentRoundState?.state === 'locked' ? (")
  })
})
