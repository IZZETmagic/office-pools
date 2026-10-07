// How a feed row looks on the web — its icon, its colour, its time. The web's copy of the decisions
// in the app's mobile/components/activity/ActivityCard.tsx (resolveIcon, resolveColorKey,
// relativeTime), so a row reads the same on both. The icon names are the app's SF Symbol names;
// components/ui/Icon maps each to its Hugeicons glyph.
//
// PURE — tested in __tests__/look.test.ts.

import type { FeedItem } from './feed'

export type ColorKey = FeedItem['color_key']

const meta = (item: FeedItem) => (item.metadata ?? {}) as Record<string, unknown>

export function resolveIcon(item: FeedItem): string {
  const m = meta(item)
  switch (item.activity_type) {
    case 'matchweek_story':
    case 'matchday_recap':
      return 'calendar.badge.checkmark'
    case 'mention':
      return 'at.circle.fill'
    case 'rank_change': {
      const delta = m.delta
      if (typeof delta === 'number') return delta > 0 ? 'arrow.up.circle.fill' : 'arrow.down.circle.fill'
      return 'arrow.up.arrow.down.circle.fill'
    }
    case 'deadline_alert':
      return 'clock.badge.exclamationmark.fill'
    case 'pool_joined':
      return 'person.badge.plus'
    case 'pool_left':
      return 'rectangle.portrait.and.arrow.right'
    case 'pool_removed':
      return 'person.crop.circle.badge.xmark'
    case 'level_up':
      return 'star.circle.fill'
    case 'streak_milestone':
      return m.streak_type === 'cold' ? 'snowflake' : 'flame.fill'
    case 'badge_earned':
      return 'trophy.circle.fill'
    case 'prediction_result':
      return m.outcome === 'miss' ? 'xmark.circle.fill' : 'checkmark.circle.fill'
    case 'matchday_mvp':
      return 'crown.fill'
    case 'prediction_submitted':
      return 'paperplane.circle.fill'
    case 'points_adjusted':
      return 'slider.horizontal.3'
    case 'xp_gain':
      return m.source === 'badge' ? 'rosette' : m.source === 'bonus' ? 'sparkles' : 'chart.line.uptrend.xyaxis'
    case 'welcome':
      return 'hand.wave.fill'
  }
}

export function resolveColorKey(item: FeedItem): ColorKey {
  const m = meta(item)
  switch (item.activity_type) {
    case 'matchweek_story':
      return item.color_key
    case 'mention':
    case 'pool_joined':
    case 'welcome':
      return 'primary'
    case 'rank_change':
      return typeof m.delta === 'number' && m.delta > 0 ? 'success' : 'error'
    case 'deadline_alert':
      return 'warning'
    case 'pool_left':
      // Soft amber: the member chose this; not an error.
      return 'warning'
    case 'pool_removed':
      // Red: this happened TO the member.
      return 'error'
    case 'level_up':
    case 'badge_earned':
    case 'matchday_mvp':
      return 'accent'
    case 'streak_milestone':
      return m.streak_type === 'cold' ? 'primary' : 'warning'
    case 'prediction_result':
      return m.outcome === 'exact' ? 'accent' : m.outcome === 'miss' ? 'error' : 'success'
    case 'matchday_recap':
      return typeof m.exact === 'number' && m.exact > 0 ? 'accent' : 'primary'
    case 'prediction_submitted':
      return 'success'
    case 'points_adjusted':
      return typeof m.adjustment === 'number' && m.adjustment > 0 ? 'success' : 'warning'
    case 'xp_gain':
      return m.source === 'match' ? 'success' : 'accent'
  }
}

export function readPoolName(item: FeedItem): string | null {
  const v = meta(item).pool_name
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** "just now", "5m ago", "3h ago", "2d ago", then "Oct 1". A future date shows as a date, never "just now". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = (now - t) / 1000
  const date = () => {
    const d = new Date(t)
    return `${d.toLocaleString('en-GB', { month: 'short' })} ${d.getDate()}`
  }
  if (s < 0) return date()
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return date()
}
