// The web Activity page's feed logic (lib/activity/feed.ts). Pinned: the chips keep only their own
// kinds and never hide Needs you; the history groups as the app's does (by day, matchweek stories
// by matchweek); a refresh keeps the pages already scrolled into; and every row opens a page that
// exists on the web — a mention the pool's Banter, a Showdown week its duel page, an entry screen
// the Predictions tab.

import { describe, expect, it } from 'vitest'
import {
  appendUnique, feedView, FILL_PAGES, FILL_ROWS, groupByDay, matchesFilter, refreshPages, shouldFillMore,
  unreadMentions, webHref, type FeedItem, type FeedType,
} from '../feed'

const item = (type: FeedType, created_at = '2026-09-28T09:00:00Z', extra: Partial<FeedItem> = {}): FeedItem => ({
  activity_id: `${type}-${created_at}`,
  pool_id: 'p1',
  activity_type: type,
  title: 't',
  body: null,
  icon: 'x',
  color_key: 'primary',
  metadata: null,
  is_read: true,
  created_at,
  ...extra,
})

describe('the chips', () => {
  it('All keeps everything', () => {
    expect(matchesFilter(item('pool_joined'), 'all')).toBe(true)
  })
  it('each chip keeps only its own kinds', () => {
    expect(matchesFilter(item('matchweek_story'), 'results')).toBe(true)
    expect(matchesFilter(item('mention'), 'results')).toBe(false)
    expect(matchesFilter(item('rank_change'), 'rank')).toBe(true)
    expect(matchesFilter(item('mention'), 'mentions')).toBe(true)
    expect(matchesFilter(item('pool_joined'), 'mentions')).toBe(false)
  })
})

describe('the history\'s groups', () => {
  const now = new Date(2026, 8, 28, 12, 0)
  it('labels today and yesterday, then dates', () => {
    const groups = groupByDay(
      [
        item('mention', new Date(2026, 8, 28, 9).toISOString()),
        item('rank_change', new Date(2026, 8, 28, 7).toISOString()),
        item('pool_joined', new Date(2026, 8, 27, 20).toISOString()),
        item('points_adjusted', new Date(2026, 8, 26, 15).toISOString()),
      ],
      now,
    )
    expect(groups.map((g) => g.label.split(' ')[0])).toEqual(['Today', 'Yesterday', 'Saturday'])
    expect(groups[0].items).toHaveLength(2)
  })
  it('groups matchweek stories by matchweek, even when they settled on different days', () => {
    const story = (mw: number, at: Date) => item('matchweek_story', at.toISOString(), {
      activity_id: `s-${mw}-${at.getTime()}`,
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

describe('pages', () => {
  const a = item('mention', '2026-10-07T09:00:00Z', { activity_id: 'a' })
  const b = item('rank_change', '2026-10-01T09:00:00Z', { activity_id: 'b' })
  const c = item('pool_joined', '2026-09-20T09:00:00Z', { activity_id: 'c' })

  it('an appended page drops rows already held', () => {
    expect(appendUnique([a, b], [b, c]).map((i) => i.activity_id)).toEqual(['a', 'b', 'c'])
  })

  it('a refresh keeps the older pages already scrolled into', () => {
    const r = refreshPages([a, b, c], { items: [a, b], next_before: '2026-10-01T00:00:00Z' })
    expect(r.items.map((i) => i.activity_id)).toEqual(['a', 'b', 'c'])
    expect(r.keptOlder).toBe(true)
  })

  it('a refresh that brings the whole history keeps nothing extra', () => {
    const r = refreshPages([a, b, c], { items: [a, b, c], next_before: null })
    expect(r.items.map((i) => i.activity_id)).toEqual(['a', 'b', 'c'])
    expect(r.keptOlder).toBe(false)
  })
})

describe('where a row opens on the web', () => {
  const link = (pathname: string, params: Record<string, string>) => ({ pathname, params })

  it('a mention opens the pool\'s Banter', () => {
    expect(webHref(link('/pool/[id]', { id: 'p1', banter: 'open' }))).toBe('/pools/p1?tab=community')
  })
  it('a Showdown week opens its duel page, as in the app', () => {
    expect(webHref(link('/pool/[id]/duel/[matchweek]', { id: 'p1', matchweek: '6' }))).toBe('/pools/p1/duel/6')
  })
  it('the app\'s entry screens open the Predictions tab, where those are made on the web', () => {
    for (const p of ['/pool/[id]/pickem/[entryId]', '/pool/[id]/survivor/[entryId]', '/pool/[id]/table/[entryId]']) {
      expect(webHref(link(p, { id: 'p1', entryId: 'e1' }))).toBe('/pools/p1?tab=predictions')
    }
  })
  it('anything else in a pool opens the pool; no link opens nothing', () => {
    expect(webHref(link('/pool/[id]', { id: 'p1' }))).toBe('/pools/p1')
    expect(webHref(link('/pool/[id]/something-new', { id: 'p1' }))).toBe('/pools/p1')
    expect(webHref(undefined)).toBeNull()
    expect(webHref(link('/pool/[id]', {}))).toBeNull()
  })
})

describe('the dot\'s mention half', () => {
  it('counts only mentions newer than the last visit — none before a first visit', () => {
    const items = [
      item('mention', '2026-10-07T10:00:00Z'),
      item('mention', '2026-10-05T10:00:00Z', { activity_id: 'old' }),
      item('rank_change', '2026-10-07T11:00:00Z'),
    ]
    expect(unreadMentions(items, '2026-10-06T00:00:00Z')).toBe(1)
    expect(unreadMentions(items, null)).toBe(0)
  })
})

describe('what the page shows', () => {
  const none = { loading: false, error: null, rows: 0, needs: 0, nextBefore: null }

  it('rows or Needs-you cards are the list, whatever else is going on', () => {
    expect(feedView({ ...none, rows: 1 })).toBe('list')
    expect(feedView({ ...none, needs: 1, loading: true })).toBe('list')
  })
  it('nothing yet: loading, then a problem if the first page failed', () => {
    expect(feedView({ ...none, loading: true, nextBefore: undefined })).toBe('loading')
    expect(feedView({ ...none, error: 'Failed', nextBefore: undefined })).toBe('problem')
  })
  it('an empty first page with older pages behind it is NOT empty — the list loads them', () => {
    expect(feedView({ ...none, nextBefore: '2026-09-20T20:40:02Z' })).toBe('list')
  })
  it('the empty state only once the whole history is known to be empty', () => {
    expect(feedView(none)).toBe('empty')
  })
})

describe('filling a short list', () => {
  const short = { rows: 0, nextBefore: '2026-09-20T20:40:02Z', loadingMore: false, loadMoreError: null, pagesTried: 0 }

  it('a list too short to scroll pulls the next page without waiting for a scroll — All included', () => {
    expect(shouldFillMore(short)).toBe(true)
  })
  it('not before the cursor is known, at the end, while loading, or after a failure', () => {
    expect(shouldFillMore({ ...short, nextBefore: undefined })).toBe(false)
    expect(shouldFillMore({ ...short, nextBefore: null })).toBe(false)
    expect(shouldFillMore({ ...short, loadingMore: true })).toBe(false)
    expect(shouldFillMore({ ...short, loadMoreError: 'offline' })).toBe(false)
  })
  it('stops once the list has enough rows, or after a few pages', () => {
    expect(shouldFillMore({ ...short, rows: FILL_ROWS })).toBe(false)
    expect(shouldFillMore({ ...short, pagesTried: FILL_PAGES })).toBe(false)
  })
})
