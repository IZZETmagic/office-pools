// =============================================================
// Which game a Last Man Standing pick was made against
// =============================================================
// A pick has always been four columns — round, entry, matchweek, club — and the
// OPPONENT was never one of them. Every screen re-derived it from whichever
// matchweek was OPEN at the moment of the read, so a pick from three weeks ago
// was narrated by next weekend's fixture. Migration 115 freezes the game onto
// the pick at settle; `decidingFixture` is the client half, used while the week
// is still unsettled and the fixture can still legitimately move.
//
// ⚠ THE TWO HALVES MUST ORDER IDENTICALLY. If they disagree, a pick is narrated
// by one fixture on Saturday and a different one the moment the week settles —
// the same bug arriving by another door.
// =============================================================

import { describe, it, expect } from 'vitest'
import { decidingFixture, lmsPickKey, type FixtureRow } from '../lms'

const ARSENAL = 'club-ars'
const FULHAM = 'club-ful'
const SPURS = 'club-tot'

const fx = (over: Partial<FixtureRow> & { fixture_id: string }): FixtureRow => ({
  matchweek_id: 'mw-2',
  home_club_id: ARSENAL,
  away_club_id: FULHAM,
  kickoff_at: '2026-08-29T14:00:00Z',
  home_goals: null,
  away_goals: null,
  is_completed: false,
  ...over,
})

describe('decidingFixture', () => {
  it('returns the only fixture when there is only one', () => {
    const one = fx({ fixture_id: 'f1' })
    expect(decidingFixture([one], ARSENAL)).toBe(one)
  })

  it('has nothing to return when the club did not play', () => {
    // A real state, not a gap: under these rules you cannot be beaten by a
    // match that was not played, so the caller says so rather than erroring.
    expect(decidingFixture([], ARSENAL)).toBeUndefined()
  })

  it('picks the game they WON when a club has two in one matchweek', () => {
    // ⚠ A club CAN hold two fixtures in one matchweek: `planRehome` attaches a
    // makeup game to the weekend before and has no clash guard. The engine's
    // verdict is EXISTS-based — won ANY completed game — so the fixture we show
    // has to be the one that produced it, or the record contradicts the result
    // printed beside it.
    const lost = fx({ fixture_id: 'f-lost', is_completed: true, home_goals: 0, away_goals: 2,
                      kickoff_at: '2026-08-29T14:00:00Z' })
    const won = fx({ fixture_id: 'f-won', away_club_id: SPURS, is_completed: true,
                     home_goals: 3, away_goals: 1, kickoff_at: '2026-09-02T19:00:00Z' })
    expect(decidingFixture([lost, won], ARSENAL)?.fixture_id).toBe('f-won')
  })

  it('reads a win from the away side too', () => {
    const away = fx({ fixture_id: 'f-away', home_club_id: SPURS, away_club_id: ARSENAL,
                      is_completed: true, home_goals: 1, away_goals: 2 })
    const drew = fx({ fixture_id: 'f-drew', is_completed: true, home_goals: 1, away_goals: 1,
                      kickoff_at: '2026-08-28T14:00:00Z' })
    expect(decidingFixture([drew, away], ARSENAL)?.fixture_id).toBe('f-away')
  })

  it('prefers a completed game to a postponed one when neither was won', () => {
    // The completed one is the reason they went out. The postponed one explains
    // nothing.
    const postponed = fx({ fixture_id: 'f-pp', kickoff_at: '2026-08-28T14:00:00Z' })
    const beaten = fx({ fixture_id: 'f-beat', away_club_id: SPURS, is_completed: true,
                        home_goals: 0, away_goals: 1, kickoff_at: '2026-08-30T14:00:00Z' })
    expect(decidingFixture([postponed, beaten], ARSENAL)?.fixture_id).toBe('f-beat')
  })

  it('falls back to the earliest kickoff when nothing has been played', () => {
    // Pre-lock this is every case, and it must match what the picker grid showed
    // — `readMatchweekFixtureByClub` orders by kickoff and takes the first.
    const later = fx({ fixture_id: 'f-late', kickoff_at: '2026-09-02T19:00:00Z' })
    const earlier = fx({ fixture_id: 'f-early', away_club_id: SPURS, kickoff_at: '2026-08-29T12:30:00Z' })
    expect(decidingFixture([later, earlier], ARSENAL)?.fixture_id).toBe('f-early')
  })

  it('is deterministic when two candidates are otherwise identical', () => {
    // ⚠ The point of the whole change. An unordered answer meant the same club
    // showed a different opponent between two loads of the same screen.
    const a = fx({ fixture_id: 'aaa', kickoff_at: null })
    const b = fx({ fixture_id: 'bbb', away_club_id: SPURS, kickoff_at: null })
    expect(decidingFixture([a, b], ARSENAL)?.fixture_id).toBe('aaa')
    expect(decidingFixture([b, a], ARSENAL)?.fixture_id).toBe('aaa')
  })

  it('sorts a null kickoff last rather than first', () => {
    const scheduled = fx({ fixture_id: 'f-sched', kickoff_at: '2026-08-29T14:00:00Z' })
    const undated = fx({ fixture_id: 'a-undated', away_club_id: SPURS, kickoff_at: null })
    expect(decidingFixture([undated, scheduled], ARSENAL)?.fixture_id).toBe('f-sched')
  })

  it('does not mutate the array it was handed', () => {
    const a = fx({ fixture_id: 'f1', is_completed: true, home_goals: 0, away_goals: 1 })
    const b = fx({ fixture_id: 'f2', away_club_id: SPURS, is_completed: true, home_goals: 2, away_goals: 0 })
    const rows = [a, b]
    decidingFixture(rows, ARSENAL)
    expect(rows[0]).toBe(a)
  })
})

describe('lmsPickKey', () => {
  it('keys per entry, so two members cannot collide on the same matchweek', () => {
    expect(lmsPickKey({ entry_id: 'e1', matchweek_number: 2 }))
      .not.toBe(lmsPickKey({ entry_id: 'e2', matchweek_number: 2 }))
  })
})
