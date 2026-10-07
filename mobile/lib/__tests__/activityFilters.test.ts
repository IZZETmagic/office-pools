import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

import { FILL_PAGES, FILL_ROWS, groupByDay, matchesFilter, shouldFillMore } from '../activityFilters'
import type { ActivityItem, ActivityType } from '../useActivity'

const item = (type: ActivityType, createdAt = '2026-09-28T09:00:00Z'): ActivityItem => ({
  activityId: `${type}-${createdAt}`,
  poolId: 'p1',
  activityType: type,
  title: 't',
  body: null,
  icon: 'x',
  colorKey: 'primary',
  metadata: null,
  isRead: true,
  createdAt,
})

describe('matchesFilter', () => {
  it('All keeps everything', () => {
    expect(matchesFilter(item('pool_joined'), 'all')).toBe(true)
  })
  it('each chip keeps only its own kinds', () => {
    expect(matchesFilter(item('matchweek_story'), 'results')).toBe(true)
    expect(matchesFilter(item('mention'), 'results')).toBe(false)
    expect(matchesFilter(item('rank_change'), 'rank')).toBe(true)
    expect(matchesFilter(item('xp_gain'), 'rewards')).toBe(true)
    expect(matchesFilter(item('mention'), 'mentions')).toBe(true)
    expect(matchesFilter(item('pool_joined'), 'mentions')).toBe(false)
  })
})

describe('groupByDay', () => {
  const now = new Date(2026, 8, 28, 12, 0)
  it('labels today and yesterday, then dates', () => {
    const groups = groupByDay(
      [
        item('mention', new Date(2026, 8, 28, 9).toISOString()),
        item('rank_change', new Date(2026, 8, 28, 7).toISOString()),
        item('matchweek_story', new Date(2026, 8, 27, 20).toISOString()),
        item('xp_gain', new Date(2026, 8, 26, 15).toISOString()),
      ],
      now,
    )
    expect(groups.map((g) => g.label.split(' ')[0])).toEqual(['Today', 'Yesterday', 'Saturday'])
    expect(groups[0].items).toHaveLength(2)
  })
  it('groups matchweek stories by matchweek, even when they settled on different days', () => {
    const story = (mw: number, at: Date) => ({
      ...item('matchweek_story', at.toISOString()),
      activityId: `s-${mw}-${at.getTime()}`,
      metadata: { matchweek_number: mw },
    })
    const groups = groupByDay(
      [
        item('mention', new Date(2026, 8, 28, 9).toISOString()),
        story(5, new Date(2026, 8, 20, 22)),
        story(5, new Date(2026, 8, 20, 18)),
        story(4, new Date(2026, 8, 15, 9)),
        story(4, new Date(2026, 8, 14, 22)),
      ],
      now,
    )
    expect(groups.map((g) => g.label.split(' · ')[0])).toEqual(['Today', 'Matchweek 5', 'Matchweek 4'])
    expect(groups[2].items).toHaveLength(2)
  })
  it('drops an unparseable date rather than inventing a day', () => {
    expect(groupByDay([item('mention', 'not a date')], now)).toEqual([])
  })
})

describe('shouldFillMore', () => {
  const short = { rows: 1, nextBefore: '2026-09-20T20:40:02Z', loadingMore: false, loadMoreError: null, pagesTried: 0 }

  it('a list too short to scroll pulls the next page by itself', () => {
    expect(shouldFillMore(short)).toBe(true)
  })
  it('not before the cursor to the next page is known — a list restored from the last visit has none', () => {
    expect(shouldFillMore({ ...short, nextBefore: undefined })).toBe(false)
  })
  it('not at the end of the history, while a page is loading, or after one failed', () => {
    expect(shouldFillMore({ ...short, nextBefore: null })).toBe(false)
    expect(shouldFillMore({ ...short, loadingMore: true })).toBe(false)
    expect(shouldFillMore({ ...short, loadMoreError: 'offline' })).toBe(false)
  })
  it('stops once the screen has enough, or after a few pages', () => {
    expect(shouldFillMore({ ...short, rows: FILL_ROWS })).toBe(false)
    expect(shouldFillMore({ ...short, rows: FILL_ROWS - 1 })).toBe(true)
    expect(shouldFillMore({ ...short, pagesTried: FILL_PAGES })).toBe(false)
  })
})

describe('the Activity tab fills on every chip', () => {
  // Source text, comments stripped: the rule above only helps if the screen asks it for "All" too.
  // Leaving All to the list's end-reached signal is what showed Ryan one row on 2026-10-07.
  it('asks shouldFillMore, and no longer skips All', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'app', '(tabs)', 'activity.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//'))
      .join('\n')
    expect(src).toContain('shouldFillMore(')
    expect(src).not.toMatch(/filter === 'all' \|\| !nextBefore/)
  })
})
