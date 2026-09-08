// =============================================================
// How often a live fixture is asked "what happened?"
// =============================================================
// This function exists because `res.changed` fires every minute of a live
// match — the RPC compares the live clock — so steps 7b3 and 7b4 were asking
// the provider about every fixture, every minute, all match.
//
// Two ways to get it wrong, and both are quiet:
//   · too loose and the quota goes, which nobody sees until the month ends;
//   · too tight and a goal is late on screen, which everybody sees.
//
// So the tests split into "must always fetch" and "must not".
// =============================================================

import { describe, expect, it } from 'vitest'

import {
  EVENTS_EVERY_MINUTES,
  shouldRefetch,
  STATS_EVERY_MINUTES,
  type LiveGateInput,
} from '../liveGate'

/** A live fixture at 1-0, on a minute that is not a heartbeat. */
function live(over: Partial<LiveGateInput> = {}): LiveGateInput {
  return {
    priorStatus: 'live',
    priorHomeGoals: 1,
    priorAwayGoals: 0,
    status: 'live',
    homeGoals: 1,
    awayGoals: 0,
    isCompleted: false,
    elapsed: 37, // 37 is not divisible by 3 or 10
    ...over,
  }
}

describe('shouldRefetch — the moments that must never wait', () => {
  it('⚠ a goal fetches immediately, on any minute', () => {
    expect(shouldRefetch(live({ homeGoals: 2, elapsed: 37 }), EVENTS_EVERY_MINUTES)).toBe(true)
    expect(shouldRefetch(live({ awayGoals: 1, elapsed: 41 }), EVENTS_EVERY_MINUTES)).toBe(true)
    // Even on the slowest heartbeat.
    expect(shouldRefetch(live({ homeGoals: 2, elapsed: 37 }), STATS_EVERY_MINUTES)).toBe(true)
  })

  it('a status change fetches immediately', () => {
    expect(shouldRefetch(live({ status: 'completed', elapsed: 37 }), EVENTS_EVERY_MINUTES)).toBe(true)
    expect(shouldRefetch(live({ priorStatus: 'scheduled', elapsed: null }), EVENTS_EVERY_MINUTES)).toBe(true)
  })

  it('⚠ the completion tick always fetches — it is the reconciliation pass', () => {
    // A VAR-disallowed goal that restores the previous score changes no column,
    // so it produces no `changed` row of its own. Full time is the only chance
    // to notice the timeline still carries a goal that never stood.
    expect(shouldRefetch(live({ isCompleted: true, elapsed: 37 }), STATS_EVERY_MINUTES)).toBe(true)
  })

  it('⚠ a fixture we have never held is always fetched', () => {
    // No prior row means nothing stored and nothing to compare; a heartbeat
    // skip would leave it blank until its next goal.
    expect(shouldRefetch(live({ priorStatus: null, elapsed: 37 }), EVENTS_EVERY_MINUTES)).toBe(true)
  })
})

describe('shouldRefetch — the ticks it now skips', () => {
  it('⚠ skips a minute where only the clock moved', () => {
    // This is the whole saving.
    expect(shouldRefetch(live({ elapsed: 37 }), EVENTS_EVERY_MINUTES)).toBe(false)
    expect(shouldRefetch(live({ elapsed: 38 }), EVENTS_EVERY_MINUTES)).toBe(false)
  })

  it('fetches on the heartbeat minute', () => {
    expect(shouldRefetch(live({ elapsed: 36 }), EVENTS_EVERY_MINUTES)).toBe(true)
    expect(shouldRefetch(live({ elapsed: 39 }), EVENTS_EVERY_MINUTES)).toBe(true)
  })

  it('⚠ a null clock is a NO, not a zero', () => {
    // Before kickoff and after full time the provider sends no elapsed minute.
    // Treating null as 0 makes `0 % 3` true and fetches on every idle tick —
    // exactly the bug this function removes.
    expect(shouldRefetch(live({ elapsed: null }), EVENTS_EVERY_MINUTES)).toBe(false)
    expect(shouldRefetch(live({ elapsed: null }), STATS_EVERY_MINUTES)).toBe(false)
  })

  it('kick-off itself is a heartbeat minute', () => {
    expect(shouldRefetch(live({ elapsed: 0 }), EVENTS_EVERY_MINUTES)).toBe(true)
  })

  it('statistics are asked for far less often than events', () => {
    const minutes = Array.from({ length: 90 }, (_, i) => i + 1)
    const events = minutes.filter((m) => shouldRefetch(live({ elapsed: m }), EVENTS_EVERY_MINUTES))
    const stats = minutes.filter((m) => shouldRefetch(live({ elapsed: m }), STATS_EVERY_MINUTES))
    expect(events.length).toBe(30)
    expect(stats.length).toBe(9)
  })

  it('⚠ the whole match costs what it should', () => {
    // 90 quiet minutes, against ~100 + ~100 calls before. This is the number
    // the change exists to move.
    const quiet = Array.from({ length: 90 }, (_, i) => i + 1)
    const cost =
      quiet.filter((m) => shouldRefetch(live({ elapsed: m }), EVENTS_EVERY_MINUTES)).length +
      quiet.filter((m) => shouldRefetch(live({ elapsed: m }), STATS_EVERY_MINUTES)).length
    expect(cost).toBe(39)
    expect(cost).toBeLessThan(60)
  })
})
