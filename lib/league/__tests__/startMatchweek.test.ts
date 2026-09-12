import { describe, it, expect } from 'vitest'
import {
  startMatchweekOptions,
  defaultStartMatchweek,
  closesInLabel,
  type StartMatchweekRow,
} from '../startMatchweek'

const NOW = new Date('2026-09-12T12:00:00Z').getTime()
const HOUR = 3_600_000
const DAY = 24 * HOUR

const row = (number: number, lockAtMs: number, label: string | null = null): StartMatchweekRow => ({
  number,
  label,
  lockAt: new Date(lockAtMs).toISOString(),
})

describe('startMatchweekOptions', () => {
  it('offers the open matchweek first and marks it', () => {
    const opts = startMatchweekOptions([row(4, NOW + HOUR), row(5, NOW + 6 * DAY)], NOW)
    expect(opts.map((o) => o.number)).toEqual([4, 5])
    expect(opts[0].isOpenNow).toBe(true)
    expect(opts[1].isOpenNow).toBe(false)
  })

  /**
   * The wizard can sit open across a lock. Ryan created his pool at 01:44 and
   * matchweek 4 locked at 13:00 the same day.
   */
  it('drops a matchweek that has already locked rather than showing it disabled', () => {
    const opts = startMatchweekOptions([row(4, NOW - HOUR), row(5, NOW + 6 * DAY)], NOW)
    expect(opts.map((o) => o.number)).toEqual([5])
    expect(opts[0].isOpenNow).toBe(true)
  })

  /**
   * ⚠ 101 measured a minimum gap of MINUS 121 days between consecutive rounds'
   * kickoffs — a whole round can be moved, so round 29 can lock before 28.
   */
  it('orders by lock time, not by matchweek number', () => {
    const opts = startMatchweekOptions([row(29, NOW + DAY), row(28, NOW + 20 * DAY)], NOW)
    expect(opts.map((o) => o.number)).toEqual([29, 28])
  })

  it("uses the season's own label when it has one", () => {
    const opts = startMatchweekOptions([row(5, NOW + DAY, 'Matchweek 5 (rearranged)')], NOW)
    expect(opts[0].title).toBe('Matchweek 5 (rearranged)')
  })

  it('caps the list', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((n) => row(n, NOW + n * DAY))
    expect(startMatchweekOptions(rows, NOW)).toHaveLength(4)
  })

  it('returns nothing when every matchweek has locked', () => {
    expect(startMatchweekOptions([row(37, NOW - DAY), row(38, NOW - HOUR)], NOW)).toEqual([])
    expect(defaultStartMatchweek([])).toBeNull()
  })
})

describe('defaultStartMatchweek', () => {
  /**
   * ⚠ THE OPEN WEEK, not the next one. Defaulting later would fix the Saturday
   * this was found on and change every ordinary creation — and it would be us
   * deciding how much notice a group needs, which is the decision the screen
   * exists to hand back.
   */
  it('lands on the open matchweek', () => {
    const opts = startMatchweekOptions([row(4, NOW + HOUR), row(5, NOW + 6 * DAY)], NOW)
    expect(defaultStartMatchweek(opts)).toBe(4)
  })
})

describe('closesInLabel', () => {
  it('floors to whole days rather than rounding up', () => {
    // 44 hours is not "in 2 days" — overstating the notice a group has is the
    // one direction this label must not fail in. It floors to 1, which the
    // wording below turns into "tomorrow".
    expect(closesInLabel(new Date(NOW + 44 * HOUR).toISOString(), NOW)).toBe('tomorrow')
    expect(closesInLabel(new Date(NOW + 95 * HOUR).toISOString(), NOW)).toBe('in 3 days')
  })

  /**
   * A consequence of the flooring above rather than a separate rule, and worth
   * pinning: 1 is spoken, so the plural branch can never print "in 1 days".
   */
  it('never says "in 1 days"', () => {
    for (let h = 1; h < 24 * 6; h++) {
      expect(closesInLabel(new Date(NOW + h * HOUR).toISOString(), NOW)).not.toBe('in 1 days')
    }
  })

  it('says today and tomorrow in words', () => {
    expect(closesInLabel(new Date(NOW + 2 * HOUR).toISOString(), NOW)).toBe('today')
    expect(closesInLabel(new Date(NOW + 30 * HOUR).toISOString(), NOW)).toBe('tomorrow')
  })

  it('says closed for an instant already gone', () => {
    expect(closesInLabel(new Date(NOW - HOUR).toISOString(), NOW)).toBe('closed')
  })
})
