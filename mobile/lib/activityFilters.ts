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

/**
 * How few rows the list may show before it pulls older pages on its own. Mentions are rare, so a
 * chip could otherwise open empty with its rows one page away.
 */
export const FILL_ROWS = 8;
/** …and at most this many pages per chip change, so a member with no mentions at all does not
 * page through their entire history every time they tap it. */
export const FILL_PAGES = 4;

/**
 * Whether the list should fetch the next older page by itself: it shows fewer than FILL_ROWS
 * rows, an older page exists, nothing is loading or has failed, and it has tried fewer than
 * FILL_PAGES times since the chip last changed.
 *
 * ⚠ EVERY CHIP, "ALL" INCLUDED (Ryan, 2026-10-07: "What happened to all the activity?"). "All"
 * used to rely on the list's end-reached signal alone, and that signal fires ONCE per content
 * height. On a cold open it fired while the list was still the copy saved from the last visit,
 * before the cursor to page two was known, so it did nothing — and when the fetch landed with the
 * cursor, the one-row page had not changed height, so it never fired again. A first page holds the
 * last three matchweeks across every league the member plays, so a quiet stretch can leave it a
 * single row, too short to scroll. This re-asks whenever the cursor arrives.
 */
export function shouldFillMore(s: {
  rows: number;
  nextBefore: string | null | undefined;
  loadingMore: boolean;
  loadMoreError: string | null;
  pagesTried: number;
}): boolean {
  if (!s.nextBefore || s.loadingMore || s.loadMoreError) return false;
  return s.rows < FILL_ROWS && s.pagesTried < FILL_PAGES;
}

export type DayGroup = { key: string; label: string; items: ActivityItem[] };

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d: Date, now: Date): string {
  const k = dayKey(d);
  if (k === dayKey(now)) return 'Today';
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (k === dayKey(y)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

function matchweekOf(it: ActivityItem): number | null {
  if (it.activityType !== 'matchweek_story') return null;
  const n = (it.metadata as { matchweek_number?: unknown } | null)?.matchweek_number;
  return typeof n === 'number' ? n : null;
}

/**
 * Split newest-first items into groups for the history.
 *
 * Matchweek stories group by MATCHWEEK ("Matchweek 5 · Sun 20 Sep"), so every
 * pool's result for a weekend sits together even when they settled hours
 * apart. Everything else (mentions, badges, rank moves) groups by device-local
 * day. A group is placed where its newest item falls.
 *
 * ⚠ Matchweek NUMBER, across competitions: Premier League MW4 and La Liga MW4
 * share a group. That is the trial Ryan asked for (2026-09-29) — revisit if a
 * member in two leagues finds it confusing.
 *
 * Items must already be sorted newest first.
 */
export function groupByDay(items: ActivityItem[], now: Date = new Date()): DayGroup[] {
  const out: DayGroup[] = [];
  const byKey = new Map<string, DayGroup>();
  for (const it of items) {
    const d = new Date(it.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const mw = matchweekOf(it);
    const key = mw != null ? `mw-${mw}` : `day-${dayKey(d)}`;
    let g = byKey.get(key);
    if (!g) {
      const shortDate = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      g = { key, label: mw != null ? `Matchweek ${mw} · ${shortDate}` : dayLabel(d, now), items: [] };
      byKey.set(key, g);
      out.push(g);
    }
    g.items.push(it);
  }
  return out;
}
