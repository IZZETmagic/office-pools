import { describe, it, expect } from 'vitest'
import { pageWeeks, slicePage } from '../page'

const wk = (n: number, at: string, season = 's1') => ({ seasonId: season, matchweekNumber: n, settledAt: at })
const it_ = (at: string) => ({ created_at: at })

describe('pageWeeks', () => {
  const weeks = [
    wk(5, '2026-09-20T22:00:00Z'),
    wk(4, '2026-09-14T22:00:00Z'),
    wk(4, '2026-09-15T09:00:00Z', 'laliga'),
    wk(3, '2026-08-31T22:00:00Z'),
    wk(2, '2026-08-24T22:00:00Z'),
    wk(1, '2026-08-17T22:00:00Z'),
  ]

  it('takes three matchweek NUMBERS, keeping both leagues of a number together', () => {
    const p = pageWeeks(weeks, null)
    expect(p.weeks.map((w) => w.matchweekNumber)).toEqual([5, 4, 4, 3])
    expect(p.floor).toBe('2026-08-31T22:00:00Z')
    expect(p.olderWeeks).toBe(true)
  })

  it('continues strictly before the cursor', () => {
    const p = pageWeeks(weeks, '2026-08-31T22:00:00Z')
    expect(p.weeks.map((w) => w.matchweekNumber)).toEqual([2, 1])
    expect(p.olderWeeks).toBe(false)
  })

  it('treats the Postgres and JavaScript spellings of one instant as equal', () => {
    const pg = [wk(5, '2026-09-20T22:00:01.146606+00:00'), wk(4, '2026-09-14T22:00:00+00:00')]
    // The cursor comes back from the app in JS form, milliseconds only.
    const p = pageWeeks(pg, '2026-09-20T22:00:01.146Z')
    expect(p.weeks.map((w) => w.matchweekNumber)).toEqual([4])
  })

  it('returns nothing once the weeks run out', () => {
    expect(pageWeeks(weeks, '2026-08-01T00:00:00Z')).toEqual({ weeks: [], floor: null, olderWeeks: false })
  })
})

describe('slicePage', () => {
  const items = ['2026-09-28', '2026-09-20', '2026-09-10', '2026-08-31', '2026-08-20', '2026-07-19'].map((d) =>
    it_(`${d}T12:00:00Z`),
  )

  it('cuts at the week floor and points the next page at it', () => {
    const r = slicePage(items, null, '2026-08-31T12:00:00Z', false)
    expect(r.page).toHaveLength(4)
    expect(r.nextBefore).toBe('2026-08-31T12:00:00Z')
  })

  it('has more when older weeks remain even if no older item was computed', () => {
    const r = slicePage(items.slice(0, 2), null, '2026-09-20T12:00:00Z', true)
    expect(r.nextBefore).toBe('2026-09-20T12:00:00Z')
  })

  it('falls back to a fixed number of items when there are no weeks', () => {
    const r = slicePage(items, '2026-09-01T00:00:00Z', null, false, 2)
    expect(r.page.map((i) => i.created_at.slice(0, 10))).toEqual(['2026-08-31', '2026-08-20'])
    expect(r.nextBefore).toBe('2026-08-20T12:00:00Z')
  })

  it('ends the feed with no cursor', () => {
    const r = slicePage(items, '2026-08-01T00:00:00Z', null, false)
    expect(r).toEqual({ page: [it_('2026-07-19T12:00:00Z')], nextBefore: null })
  })

  it('keeps items tied on the floor on the same page', () => {
    const tied = [it_('2026-09-20T12:00:00Z'), it_('2026-09-20T12:00:00Z'), it_('2026-09-01T12:00:00Z')]
    const r = slicePage(tied, null, '2026-09-20T12:00:00Z', false)
    expect(r.page).toHaveLength(2)
  })
})
