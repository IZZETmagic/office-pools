// The Activity tab's filter chips — which rows each one keeps, and how the
// history is split into day groups. PURE, tested in
// lib/__tests__/activityFilters.test.ts.
//
// ⚠ Needs You is NOT filtered. It sits above the chips and always shows every
// open decision; the chips only narrow the history underneath.

import type { ActivityItem, ActivityType } from './useActivity';

export type ActivityFilter = 'all' | 'results' | 'rank' | 'rewards' | 'mentions';

export const FILTERS: Array<{ key: ActivityFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'results', label: 'Results' },
  { key: 'rank', label: 'Rank' },
  { key: 'rewards', label: 'Rewards' },
  { key: 'mentions', label: 'Mentions' },
];

const TYPES: Record<Exclude<ActivityFilter, 'all'>, ReadonlySet<ActivityType>> = {
  results: new Set<ActivityType>([
    'matchweek_story',
    'prediction_result',
    'matchday_recap',
    'matchday_mvp',
    'streak_milestone',
  ]),
  rank: new Set<ActivityType>(['rank_change']),
  rewards: new Set<ActivityType>(['xp_gain', 'badge_earned', 'level_up']),
  mentions: new Set<ActivityType>(['mention']),
};

export function matchesFilter(item: ActivityItem, filter: ActivityFilter): boolean {
  return filter === 'all' || TYPES[filter].has(item.activityType);
}

export type DayGroup = { key: string; label: string; items: ActivityItem[] };

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Split newest-first items into device-local days: "Today", "Yesterday", then
 * "Sunday 27 Sep". Items must already be sorted newest first.
 */
export function groupByDay(items: ActivityItem[], now: Date = new Date()): DayGroup[] {
  const today = dayKey(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = dayKey(y);

  const out: DayGroup[] = [];
  for (const it of items) {
    const d = new Date(it.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const k = dayKey(d);
    let g = out[out.length - 1];
    if (!g || g.key !== k) {
      const label =
        k === today
          ? 'Today'
          : k === yesterday
            ? 'Yesterday'
            : d.toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
                ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
              });
      g = { key: k, label, items: [] };
      out.push(g);
    }
    g.items.push(it);
  }
  return out;
}
