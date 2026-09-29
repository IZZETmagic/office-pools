import { describe, expect, it } from 'vitest'

import { groupByDay, matchesFilter } from '../activityFilters'
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
