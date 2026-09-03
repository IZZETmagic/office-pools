// =============================================================
// The Pick'em matchweek rules
// =============================================================
// Every case below is a bug this codebase has already paid for somewhere, which
// is why they are pinned here rather than left to the screen.
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  fixturesForWeek,
  defaultWeek,
  lastLockedWeek,
  stepWeek,
  weekState,
} from '../pickemWeek'
import type { LeagueMatch, LeagueMatchweek } from '../useLeaguePool'

const NOW = Date.parse('2026-09-03T12:00:00Z')

/** The real Premier League shape, read from production on 2026-09-03. */
const WEEKS: LeagueMatchweek[] = [
  { number: 1, lock_at: '2026-08-21T19:00:00Z', first_kickoff_at: '2026-08-21T20:00:00Z' },
  { number: 2, lock_at: '2026-08-28T19:00:00Z', first_kickoff_at: '2026-08-28T20:00:00Z' },
  { number: 3, lock_at: '2026-09-04T18:00:00Z', first_kickoff_at: '2026-09-04T19:00:00Z' },
  { number: 4, lock_at: '2026-09-12T13:00:00Z', first_kickoff_at: '2026-09-12T14:00:00Z' },
]

function match(id: string, week: number, date: string | null, number = 1): LeagueMatch {
  return {
    match_id: id,
    match_number: number,
    round_number: week,
    match_date: date,
    status: null,
    status_detail: null,
    original_match_date: null,
    home_team_id: 'h',
    away_team_id: 'a',
    home_score_ft: null,
    away_score_ft: null,
    is_completed: false,
    home_team: null,
    away_team: null,
  }
}

describe('weekState', () => {
  it('a passed lock_at is locked — picks are visible pool-wide', () => {
    expect(weekState(WEEKS[0], 3, NOW)).toBe('locked')
    expect(weekState(WEEKS[1], 3, NOW)).toBe('locked')
  })

  it('the open matchweek is open', () => {
    expect(weekState(WEEKS[2], 3, NOW)).toBe('open')
  })

  it('⚠ a FUTURE matchweek is not "locked", though the round-state string says so', () => {
    // The rule the whole module exists for. `pool_round_states` spells an
    // unopened matchweek 'locked' exactly as it spells a closed one, so a screen
    // reading the string would reveal matchweek 30's picks in August. Nothing
    // leaks today only because migration 058 refuses a pick for any week but the
    // open one — a coincidence of another rule, not a reason.
    expect(weekState(WEEKS[3], 3, NOW)).toBe('future')
  })

  it('⚠ the clock outranks the server’s idea of open', () => {
    // If the payload is a few seconds stale across a deadline, the member's own
    // watch is the thing they can check. Locking early is safe; offering picks
    // on a closed week is the failure — the write would be silently skipped by
    // the trigger and they would never know.
    const justPassed = Date.parse('2026-09-04T18:00:01Z')
    expect(weekState(WEEKS[2], 3, justPassed)).toBe('locked')
  })

  it('a matchweek with no lock_at yet is future, not open', () => {
    expect(weekState({ number: 9, lock_at: null, first_kickoff_at: null }, 3, NOW)).toBe('future')
  })

  it('a missing matchweek is future rather than a crash', () => {
    expect(weekState(undefined, 3, NOW)).toBe('future')
  })
})

describe('fixturesForWeek', () => {
  it('takes only that week, in kickoff order', () => {
    const all = [
      match('c', 3, '2026-09-05T14:00:00Z'),
      match('a', 3, '2026-09-04T19:00:00Z'),
      match('x', 4, '2026-09-12T14:00:00Z'),
    ]
    expect(fixturesForWeek(all, 3).map((m) => m.match_id)).toEqual(['a', 'c'])
  })

  it('⚠ a fixture with no kickoff sorts LAST, not first', () => {
    // The exact bug the fixtures list shipped once: NaN comparisons are always
    // false, so a date-less fixture drifted to the front and was rendered as the
    // next game.
    const all = [match('none', 3, null), match('real', 3, '2026-09-04T19:00:00Z')]
    expect(fixturesForWeek(all, 3).map((m) => m.match_id)).toEqual(['real', 'none'])
  })

  it('ties break on match_number so the order is total', () => {
    const all = [
      match('second', 3, '2026-09-04T19:00:00Z', 2),
      match('first', 3, '2026-09-04T19:00:00Z', 1),
    ]
    expect(fixturesForWeek(all, 3).map((m) => m.match_id)).toEqual(['first', 'second'])
  })
})

describe('defaultWeek', () => {
  it('opens on the week you can act on', () => {
    expect(defaultWeek(WEEKS, 3, null, NOW)).toBe(3)
  })

  it('⚠ OPEN BEATS IN-PLAY — this is a picker, not a viewer', () => {
    // The matchday case, and the one rule that separates this from the LMS
    // leaderboard's. On a Saturday matchweek 2 is being played while 3 is the
    // one you can still pick for; opening on 2 shows ten locked fixtures and no
    // way to make the picks the member came to make.
    expect(defaultWeek(WEEKS, 3, 2, NOW)).toBe(3)
  })

  it('follows the football when nothing is open', () => {
    expect(defaultWeek(WEEKS, null, 2, NOW)).toBe(2)
  })

  it('with nothing open or in play, opens on the last week that locked', () => {
    const seasonOver = Date.parse('2027-06-01T00:00:00Z')
    expect(defaultWeek(WEEKS, null, null, seasonOver)).toBe(4)
  })

  it('before a ball is kicked, opens on the first week rather than nothing', () => {
    const preSeason = Date.parse('2026-08-01T00:00:00Z')
    expect(defaultWeek(WEEKS, null, null, preSeason)).toBe(1)
  })

  it('an empty season yields null rather than NaN', () => {
    expect(defaultWeek([], null, null, NOW)).toBeNull()
  })
})

describe('stepWeek', () => {
  it('walks the list in both directions', () => {
    expect(stepWeek(WEEKS, 3, -1)).toBe(2)
    expect(stepWeek(WEEKS, 3, 1)).toBe(4)
  })

  it('stops at the ends', () => {
    expect(stepWeek(WEEKS, 1, -1)).toBeNull()
    expect(stepWeek(WEEKS, 4, 1)).toBeNull()
  })

  it('⚠ steps to the next EXISTING week, not to n ± 1', () => {
    // Stepping arithmetically onto a number with no row renders a week the
    // member cannot navigate out of in that direction.
    const gapped: LeagueMatchweek[] = [
      { number: 1, lock_at: null, first_kickoff_at: null },
      { number: 7, lock_at: null, first_kickoff_at: null },
    ]
    expect(stepWeek(gapped, 1, 1)).toBe(7)
  })
})

describe('lastLockedWeek', () => {
  it('is the ceiling on what a rival may show', () => {
    // MW1 and MW2 have locked, MW3 is open. A rival's picks are browsable up to
    // 2 and no further — 3 is the week they can still change.
    expect(lastLockedWeek(WEEKS, NOW)).toBe(2)
  })

  it('⚠ NULL before the first lock — no rival card should open at all', () => {
    const preSeason = Date.parse('2026-08-01T00:00:00Z')
    expect(lastLockedWeek(WEEKS, preSeason)).toBeNull()
  })

  it('⚠ takes the MAX, not "the one before open"', () => {
    // A whole round can be moved, so the highest locked number is not reliably
    // one below the open week. Here 4 locked while 3 is still to come.
    const moved: LeagueMatchweek[] = [
      { number: 3, lock_at: '2026-12-01T12:00:00Z', first_kickoff_at: null },
      { number: 4, lock_at: '2026-08-20T12:00:00Z', first_kickoff_at: null },
    ]
    expect(lastLockedWeek(moved, NOW)).toBe(4)
  })

  it('an empty season is null rather than -Infinity', () => {
    expect(lastLockedWeek([], NOW)).toBeNull()
  })
})
