// How a feed row looks on the web (lib/activity/look.ts) — the app's choices, so a row reads the
// same on both: a move up is green and a move down red, a removal red but a leave only amber, an
// exact result gold; and a time never claims "just now" for a date still to come.

import { describe, expect, it } from 'vitest'
import type { FeedItem, FeedType } from '../feed'
import { readPoolName, relativeTime, resolveColorKey, resolveIcon } from '../look'

const item = (type: FeedType, metadata: Record<string, unknown> | null = null): FeedItem => ({
  activity_id: type, pool_id: 'p1', activity_type: type, title: 't', body: null, icon: '', color_key: 'primary',
  metadata, is_read: true, created_at: '2026-10-07T09:00:00Z',
})

describe('icon and colour', () => {
  it('a rank move up is green with an up arrow; down is red with a down arrow', () => {
    expect([resolveIcon(item('rank_change', { delta: 2 })), resolveColorKey(item('rank_change', { delta: 2 }))]).toEqual(['arrow.up.circle.fill', 'success'])
    expect([resolveIcon(item('rank_change', { delta: -1 })), resolveColorKey(item('rank_change', { delta: -1 }))]).toEqual(['arrow.down.circle.fill', 'error'])
  })
  it('a removal is red — it happened to you; a leave is amber — you chose it', () => {
    expect(resolveColorKey(item('pool_removed'))).toBe('error')
    expect(resolveColorKey(item('pool_left'))).toBe('warning')
  })
  it('results: exact is gold, a miss red, anything else green', () => {
    expect(resolveColorKey(item('prediction_result', { outcome: 'exact' }))).toBe('accent')
    expect(resolveColorKey(item('prediction_result', { outcome: 'miss' }))).toBe('error')
    expect(resolveColorKey(item('prediction_result', { outcome: 'winner' }))).toBe('success')
  })
  it('a matchweek story keeps the colour the server gave it', () => {
    expect(resolveColorKey({ ...item('matchweek_story'), color_key: 'accent' })).toBe('accent')
  })
  it('the pool name comes from the row, and an empty one is none', () => {
    expect(readPoolName(item('pool_joined', { pool_name: 'Bermuda Office' }))).toBe('Bermuda Office')
    expect(readPoolName(item('pool_joined', { pool_name: '' }))).toBeNull()
  })
})

describe('relativeTime', () => {
  const NOW = Date.parse('2026-10-07T12:00:00Z')
  it('counts up through minutes, hours and days, then gives the date', () => {
    expect(relativeTime('2026-10-07T11:59:30Z', NOW)).toBe('just now')
    expect(relativeTime('2026-10-07T11:15:00Z', NOW)).toBe('45m ago')
    expect(relativeTime('2026-10-07T07:00:00Z', NOW)).toBe('5h ago')
    expect(relativeTime('2026-10-04T12:00:00Z', NOW)).toBe('3d ago')
    expect(relativeTime('2026-09-20T12:00:00Z', NOW)).toMatch(/^Sept? 20$/)
  })
  it('a date still to come is shown as a date, never "just now"', () => {
    expect(relativeTime('2026-10-20T12:00:00Z', NOW)).toMatch(/^Oct 20$/)
  })
  it('nonsense in, nothing out', () => {
    expect(relativeTime('not a date', NOW)).toBe('')
  })
})
