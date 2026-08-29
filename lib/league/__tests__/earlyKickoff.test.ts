// =============================================================
// earlyKickoff — the round that locks long before it is played
// =============================================================
// The cases that matter are the NEGATIVE ones. This note appears above a
// deadline on the picking screen, so a detector that fires on an ordinary
// weekend would put a caveat on 38 rounds out of 38 and teach members to ignore
// it — which is worse than never having written it.
// =============================================================

import { describe, it, expect } from 'vitest'
import { earlyKickoff } from '@/lib/league/earlyKickoff'

/** La Liga 2026/27 matchweek 6, verbatim from the feed. */
const LA_LIGA_MW6 = [
  '2026-09-03T19:00:00Z',
  ...Array.from({ length: 9 }, () => '2026-09-16T15:00:00Z'),
]

/** Premier League 2026/27 matchweek 1 — an ordinary weekend. */
const PL_WEEKEND = [
  '2026-08-21T19:00:00Z',
  '2026-08-22T11:30:00Z', '2026-08-22T14:00:00Z', '2026-08-22T14:00:00Z',
  '2026-08-22T14:00:00Z', '2026-08-22T16:30:00Z',
  '2026-08-23T13:00:00Z', '2026-08-23T13:00:00Z', '2026-08-23T15:30:00Z',
  '2026-08-24T19:00:00Z',
]

describe('earlyKickoff', () => {
  it('flags the real La Liga matchweek 6', () => {
    const r = earlyKickoff(LA_LIGA_MW6)
    expect(r).not.toBeNull()
    expect(r!.count).toBe(1)
    expect(r!.leadDays).toBe(13)
    expect(r!.bulkAt).toBe('2026-09-16T15:00:00.000Z')
  })

  it('does NOT flag an ordinary Friday-to-Monday weekend', () => {
    // The whole round spans three days. If this fired, the note would appear on
    // essentially every round in every league and mean nothing.
    expect(earlyKickoff(PL_WEEKEND)).toBeNull()
  })

  it('does not flag a round played entirely on one day', () => {
    expect(earlyKickoff(Array.from({ length: 10 }, () => '2026-09-13T15:00:00Z'))).toBeNull()
  })

  it('is not fooled by a LATE straggler', () => {
    // A midweek make-up played AFTER the bulk does not move the lock at all —
    // the lock is the earliest kickoff. Only early fixtures matter here.
    const late = [
      ...Array.from({ length: 9 }, () => '2026-09-12T15:00:00Z'),
      '2026-09-30T19:00:00Z',
    ]
    expect(earlyKickoff(late)).toBeNull()
  })

  it('counts more than one early fixture', () => {
    const two = [
      '2026-09-01T19:00:00Z', '2026-09-02T19:00:00Z',
      ...Array.from({ length: 8 }, () => '2026-09-16T15:00:00Z'),
    ]
    expect(earlyKickoff(two)!.count).toBe(2)
  })

  it('returns null rather than guessing on a tiny round', () => {
    // Two fixtures have no "bulk" to be early of.
    expect(earlyKickoff(['2026-09-03T19:00:00Z', '2026-09-16T15:00:00Z'])).toBeNull()
    expect(earlyKickoff([])).toBeNull()
  })

  it('ignores unparseable dates instead of throwing', () => {
    const r = earlyKickoff(['nonsense', ...LA_LIGA_MW6])
    expect(r!.count).toBe(1)
  })
})
