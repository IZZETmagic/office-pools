// =============================================================
// Form, split by venue
// =============================================================
// The mistakes this guards against, in the order they would ship:
//
//   · the venue filter applied AFTER the limit, so "last five at home" is
//     really "however many of the last five happened to be at home"
//   · form read from AFTER the fixture being looked at
//   · a postponed or abandoned fixture counted as a result
//   · a strip reversed before the slice, showing the five OLDEST
// =============================================================

import { describe, expect, it } from 'vitest'

import { buildMatchForm, FORM_LENGTH, type FormFixture } from '../form'
import type { ClubRef } from '../opponent'

const ARS: ClubRef = { clubId: 'ars', name: 'Arsenal', abbreviation: 'ARS', crestUrl: null }
const CHE: ClubRef = { clubId: 'che', name: 'Chelsea', abbreviation: 'CHE', crestUrl: null }

/** Day `d` of September 2026, so ordering is readable in the test. */
const on = (d: number) => `2026-09-${String(d).padStart(2, '0')}T15:00:00+00:00`

let seq = 0
function fx(over: Partial<FormFixture> = {}): FormFixture {
  seq += 1
  return {
    fixtureId: `f${seq}`,
    kickoffAt: on(seq),
    homeClubId: 'ars',
    awayClubId: 'oth',
    homeGoals: 1,
    awayGoals: 0,
    ...over,
  }
}

const KICKOFF = on(28)

describe('the venue split', () => {
  it('filters by venue BEFORE taking the last five', () => {
    // ⚠⚠ Six home wins, then six away defeats, all before the boundary. Taking
    // the last five overall and keeping the home ones yields NOTHING and would
    // report "no home form" for a club with six home wins behind it.
    const fixtures = [
      ...Array.from({ length: 6 }, (_, i) =>
        fx({ kickoffAt: on(i + 1), homeClubId: 'ars', awayClubId: 'oth', homeGoals: 2, awayGoals: 0 }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        fx({ kickoffAt: on(i + 10), homeClubId: 'oth', awayClubId: 'ars', homeGoals: 3, awayGoals: 0 }),
      ),
    ]
    const form = buildMatchForm(fixtures, { homeClub: ARS, awayClub: CHE, kickoffAt: KICKOFF })
    expect(form.home.played).toBe(6)
    expect(form.home.won).toBe(6)
    expect(form.home.strip).toEqual(['W', 'W', 'W', 'W', 'W'])
  })

  it('reports the away side at ITS end, not overall', () => {
    const fixtures = [
      // Chelsea away: two defeats.
      fx({ kickoffAt: on(1), homeClubId: 'oth', awayClubId: 'che', homeGoals: 2, awayGoals: 0 }),
      fx({ kickoffAt: on(2), homeClubId: 'oth', awayClubId: 'che', homeGoals: 1, awayGoals: 0 }),
      // Chelsea at home: two wins, which must NOT appear in the away split.
      fx({ kickoffAt: on(3), homeClubId: 'che', awayClubId: 'oth', homeGoals: 3, awayGoals: 0 }),
      fx({ kickoffAt: on(4), homeClubId: 'che', awayClubId: 'oth', homeGoals: 2, awayGoals: 1 }),
    ]
    const form = buildMatchForm(fixtures, { homeClub: ARS, awayClub: CHE, kickoffAt: KICKOFF })
    expect(form.away.played).toBe(2)
    expect(form.away.lost).toBe(2)
    expect(form.away.strip).toEqual(['L', 'L'])
    // And the overall fallback still sees all four.
    expect(form.away.overallPlayed).toBe(4)
  })

  it('carries goals per game at that venue only', () => {
    const fixtures = [
      fx({ kickoffAt: on(1), homeClubId: 'ars', awayClubId: 'oth', homeGoals: 3, awayGoals: 1 }),
      fx({ kickoffAt: on(2), homeClubId: 'ars', awayClubId: 'oth', homeGoals: 1, awayGoals: 1 }),
      // Away, and must not move the home average.
      fx({ kickoffAt: on(3), homeClubId: 'oth', awayClubId: 'ars', homeGoals: 5, awayGoals: 0 }),
    ]
    const form = buildMatchForm(fixtures, { homeClub: ARS, awayClub: CHE, kickoffAt: KICKOFF })
    expect(form.home.goalsForPerGame).toBe(2)
    expect(form.home.goalsAgainstPerGame).toBe(1)
  })

  it('reports null per-game rather than zero when nothing was played there', () => {
    const form = buildMatchForm([], { homeClub: ARS, awayClub: CHE, kickoffAt: KICKOFF })
    expect(form.home.played).toBe(0)
    expect(form.home.goalsForPerGame).toBeNull()
    expect(form.home.strip).toEqual([])
  })
})

describe('the boundary', () => {
  it('never shows a result from after the fixture being looked at', () => {
    // ⚠ Opening last month's game must show the games leading INTO it. A
    // fixture after the boundary is its future, not its build-up.
    const fixtures = [
      fx({ kickoffAt: on(1), homeClubId: 'ars', awayClubId: 'oth', homeGoals: 1, awayGoals: 0 }),
      fx({ kickoffAt: on(20), homeClubId: 'ars', awayClubId: 'oth', homeGoals: 4, awayGoals: 0 }),
    ]
    const form = buildMatchForm(fixtures, {
      homeClub: ARS, awayClub: CHE, kickoffAt: on(10),
    })
    expect(form.home.played).toBe(1)
    expect(form.home.goalsForPerGame).toBe(1)
  })

  it('excludes the fixture being looked at, even at the same instant', () => {
    const fixtures = [fx({ kickoffAt: KICKOFF, homeClubId: 'ars', awayClubId: 'che' })]
    const form = buildMatchForm(fixtures, { homeClub: ARS, awayClub: CHE, kickoffAt: KICKOFF })
    expect(form.home.played).toBe(0)
  })
})

describe('what counts as a result', () => {
  it('ignores a fixture with no score, however it is flagged', () => {
    // ⚠ A postponed fixture can carry `is_completed` and an abandoned one can
    // carry goals. Two scores present is the only claim a result exists.
    const fixtures = [
      fx({ kickoffAt: on(1), homeClubId: 'ars', homeGoals: null, awayGoals: null }),
      fx({ kickoffAt: on(2), homeClubId: 'ars', homeGoals: 2, awayGoals: 0 }),
    ]
    const form = buildMatchForm(fixtures, { homeClub: ARS, awayClub: CHE, kickoffAt: KICKOFF })
    expect(form.home.played).toBe(1)
    expect(form.seasonPlayed).toBe(1)
  })

  it('drops a fixture whose kickoff will not parse', () => {
    const fixtures = [
      fx({ kickoffAt: 'not a date', homeClubId: 'ars', homeGoals: 9, awayGoals: 0 }),
      fx({ kickoffAt: on(2), homeClubId: 'ars', homeGoals: 1, awayGoals: 0 }),
    ]
    const form = buildMatchForm(fixtures, { homeClub: ARS, awayClub: CHE, kickoffAt: KICKOFF })
    expect(form.home.played).toBe(1)
  })
})

describe('the strip', () => {
  it('shows the five most recent, oldest first', () => {
    // ⚠ Reversing before the slice takes the five OLDEST and reads as a club
    // whose form never changed.
    const outcomes: [number, number][] = [
      [0, 1], // L, oldest of seven
      [0, 1], // L
      [1, 1], // D
      [2, 0], // W
      [2, 0], // W
      [1, 1], // D
      [3, 0], // W, most recent
    ]
    const fixtures = outcomes.map(([h, a], i) =>
      fx({ kickoffAt: on(i + 1), homeClubId: 'ars', awayClubId: 'oth', homeGoals: h, awayGoals: a }),
    )
    const form = buildMatchForm(fixtures, { homeClub: ARS, awayClub: CHE, kickoffAt: KICKOFF })
    expect(form.home.strip).toHaveLength(FORM_LENGTH)
    expect(form.home.strip).toEqual(['D', 'W', 'W', 'D', 'W'])
  })
})
