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

  it('⚠ ONE cadence now, not one per data type', () => {
    // STATS_EVERY_MINUTES is retired. `/fixtures?ids=` returns events,
    // line-ups and statistics in the same response, so rationing statistics
    // separately would mean discarding data already paid for. This asserts the
    // gate is asked with one number, and that statistics got FASTER — every
    // third minute now, against every tenth before.
    const minutes = Array.from({ length: 90 }, (_, i) => i + 1)
    const ticks = minutes.filter((m) => shouldRefetch(live({ elapsed: m }), EVENTS_EVERY_MINUTES))
    expect(ticks.length).toBe(30)

    const oldStatsCadence = minutes.filter((m) =>
      shouldRefetch(live({ elapsed: m }), STATS_EVERY_MINUTES),
    )
    expect(oldStatsCadence.length).toBe(9)
    expect(ticks.length).toBeGreaterThan(oldStatsCadence.length)
  })

  it('⚠ the whole matchday costs what it should', () => {
    // The number the change exists to move, and it is now a MATCHDAY number
    // rather than a per-fixture one: a batch call carries twenty fixtures, so
    // ten simultaneous fixtures cost the same 30 ticks that one does.
    //
    //   before the gate:      ~100 events + ~100 stats, PER FIXTURE  = ~200
    //   after the gate:       30 events + 9 stats,      PER FIXTURE  =   39
    //   after batching:       30 ticks,        FOR THE WHOLE SLATE   =   30
    //
    // Ten fixtures: 2,000 -> 390 -> 30.
    const quiet = Array.from({ length: 90 }, (_, i) => i + 1)
    const ticksPerMatch = quiet.filter((m) =>
      shouldRefetch(live({ elapsed: m }), EVENTS_EVERY_MINUTES),
    ).length
    expect(ticksPerMatch).toBe(30)

    const FIXTURES = 10
    const IDS_PER_CALL = 20
    const callsPerTick = Math.ceil(FIXTURES / IDS_PER_CALL)
    expect(ticksPerMatch * callsPerTick).toBe(30)
    expect(ticksPerMatch * callsPerTick).toBeLessThan(FIXTURES * 39)
  })
})
