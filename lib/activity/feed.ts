// =============================================================
// The Activity feed, on the web — what the page reads and how it groups it
// =============================================================
// Ryan, 2026-10-07: "make an activity page for the web like the react native app" — and leave the
// app's Activity tab alone. So the web reads the SAME route the app does
// (/api/users/[user_id]/activity?v=2&crews=1) and changes nothing on it; this file is the web's
// copy of the app's client-side pieces (mobile/lib/activityFilters.ts, the row shape in
// mobile/lib/useActivity.ts), plus the one thing only the web needs: where a row opens on the web.
//
// The XP rows the app builds on the phone (World Cup only, dormant) are not built here, so the web
// has no Rewards chip — nothing on the server produces a row it would hold.
//
// PURE — tested in __tests__/feed.test.ts.
// =============================================================

import type { ActivityLink, NeedItem } from './needsYou'

/** A row as the route returns it. Mirrors the route's own ActivityItem (snake_case, as sent). */
export type FeedItem = {
  activity_id: string
  pool_id: string | null
  activity_type: FeedType
  title: string
  body: string | null
  icon: string
  color_key: 'primary' | 'success' | 'warning' | 'error' | 'accent'
  metadata: Record<string, unknown> | null
  is_read: boolean
  created_at: string
  /** The APP's screen for the row; the web's comes from webHref. */
  link?: ActivityLink
}

export type FeedType =
  | 'mention'
  | 'rank_change'
  | 'deadline_alert'
  | 'pool_joined'
  | 'pool_left'
  | 'pool_removed'
  | 'level_up'
  | 'streak_milestone'
  | 'badge_earned'
  | 'prediction_result'
  | 'matchday_mvp'
  | 'matchday_recap'
  | 'prediction_submitted'
  | 'points_adjusted'
  | 'xp_gain'
  | 'matchweek_story'
  | 'welcome'

/** One page of the feed, as the route answers with ?v=2. */
export type FeedPage = {
  items: FeedItem[]
  /** First page only. */
  needs_you?: NeedItem[]
  seen_at?: string | null
  /** The cursor for the next older page; null when the whole history is in. */
  next_before?: string | null
}

// ---- the chips ------------------------------------------------

export type FeedFilter = 'all' | 'results' | 'rank' | 'mentions'

export const FILTERS: Array<{ key: FeedFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'results', label: 'Results' },
  { key: 'rank', label: 'Rank' },
  { key: 'mentions', label: 'Mentions' },
]

const TYPES: Record<Exclude<FeedFilter, 'all'>, ReadonlySet<FeedType>> = {
  results: new Set<FeedType>(['matchweek_story', 'prediction_result', 'matchday_recap', 'matchday_mvp', 'streak_milestone']),
  rank: new Set<FeedType>(['rank_change']),
  mentions: new Set<FeedType>(['mention']),
}

/** ⚠ Needs you is never filtered: it sits above the chips. The chips narrow the history only. */
export function matchesFilter(item: FeedItem, filter: FeedFilter): boolean {
  return filter === 'all' || TYPES[filter].has(item.activity_type)
}

export const FILTER_EMPTY: Record<FeedFilter, string> = {
  all: 'Nothing here yet.',
  results: 'Your matchweek results land here once a week is fully scored.',
  rank: 'Rank moves in your pools show up here.',
  mentions: 'When someone @mentions you in Banter, it shows up here.',
}

// ---- the day groups -------------------------------------------

export type DayGroup = { key: string; label: string; items: FeedItem[] }

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(d: Date, now: Date): string {
  const k = dayKey(d)
  if (k === dayKey(now)) return 'Today'
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (k === dayKey(y)) return 'Yesterday'
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
}

function matchweekOf(it: FeedItem): number | null {
  if (it.activity_type !== 'matchweek_story') return null
  const n = (it.metadata as { matchweek_number?: unknown } | null)?.matchweek_number
  return typeof n === 'number' ? n : null
}

/**
 * Split newest-first rows into the history's groups, as the app does: matchweek stories by
 * MATCHWEEK ("Matchweek 5 · Sun 20 Sep"), so every pool's result for a weekend sits together;
 * everything else by the member's own day. A group sits where its newest row falls.
 */
export function groupByDay(items: FeedItem[], now: Date = new Date()): DayGroup[] {
  const out: DayGroup[] = []
  const byKey = new Map<string, DayGroup>()
  for (const it of items) {
    const d = new Date(it.created_at)
    if (Number.isNaN(d.getTime())) continue
    const mw = matchweekOf(it)
    const key = mw != null ? `mw-${mw}` : `day-${dayKey(d)}`
    let g = byKey.get(key)
    if (!g) {
      const shortDate = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      g = { key, label: mw != null ? `Matchweek ${mw} · ${shortDate}` : dayLabel(d, now), items: [] }
      byKey.set(key, g)
      out.push(g)
    }
    g.items.push(it)
  }
  return out
}

// ---- pages ----------------------------------------------------

/**
 * What the page shows: the list, or — while there is no row to list — loading, a problem, or the
 * empty state.
 *
 * ⚠ "NOTHING ON PAGE ONE" IS NOT "NOTHING". Page one is the last three matchweeks across every
 * league the member plays (lib/activity/page.ts), so it can hold no row while older pages do: a
 * member who sat out the latest weeks. The empty state is only for a history known to be empty
 * (`nextBefore === null`). While an older page exists the list renders, and its sentinel pulls
 * pages until something shows or the history ends (Ryan, 2026-10-07 — the app showed one row and
 * stopped; this page would have said "No activity yet").
 */
export function feedView(s: {
  loading: boolean
  error: string | null
  rows: number
  needs: number
  nextBefore: string | null | undefined
}): 'loading' | 'problem' | 'empty' | 'list' {
  if (s.rows > 0 || s.needs > 0) return 'list'
  if (s.loading) return 'loading'
  if (s.error) return 'problem'
  return s.nextBefore ? 'list' : 'empty'
}

/** A list showing fewer rows than this pulls older pages on its own… */
export const FILL_ROWS = 8
/** …at most this many per chip change, so a member with no mentions doesn't page their whole history. */
export const FILL_PAGES = 4

/**
 * Whether to fetch the next older page without waiting for a scroll: fewer than FILL_ROWS rows,
 * an older page exists, nothing is loading or has failed, and fewer than FILL_PAGES tries since the
 * chip last changed.
 *
 * ⚠ EVERY CHIP, "ALL" INCLUDED (2026-10-07). "All" used to wait for the bottom-of-list observer,
 * and an observer only fires for a page someone is looking at with the sentinel in view — an
 * empty or one-row first page in a background tab never loaded the rest. The app had the same gap
 * from a different cause (mobile/lib/activityFilters.ts, the same rule).
 */
export function shouldFillMore(s: {
  rows: number
  nextBefore: string | null | undefined
  loadingMore: boolean
  loadMoreError: string | null
  pagesTried: number
}): boolean {
  if (!s.nextBefore || s.loadingMore || s.loadMoreError) return false
  return s.rows < FILL_ROWS && s.pagesTried < FILL_PAGES
}

/** Append a page, dropping any row already held — the same id twice is the same event. */
export function appendUnique(prev: FeedItem[], add: FeedItem[]): FeedItem[] {
  const seen = new Set(prev.map((i) => i.activity_id))
  return [...prev, ...add.filter((i) => !seen.has(i.activity_id))]
}

/**
 * A refresh brings page one again; it must not collapse the pages the member has scrolled into.
 * Keep every held row older than page one's edge, and say whether any were kept (then the deeper
 * cursor still holds).
 */
export function refreshPages(held: FeedItem[], fresh: FeedPage): { items: FeedItem[]; keptOlder: boolean } {
  const edge = fresh.next_before ? Date.parse(fresh.next_before) : null
  const older = edge == null ? [] : held.filter((i) => Date.parse(i.created_at) < edge)
  return { items: appendUnique(fresh.items, older), keptOlder: older.length > 0 }
}

// ---- where a row opens on the web -----------------------------

/**
 * The web page for a row or a Needs-you card. The route speaks in the APP's screens
 * (expo-router paths); the web has its own:
 *
 *   a mention                → the pool's Banter tab
 *   a Showdown matchweek     → the duel page, as in the app
 *   a pick / LMS / table     → the pool's Predictions tab, where those are made on the web
 *     entry screen
 *   anything else in a pool  → the pool
 *
 * No link (a pool left or removed from) opens nothing.
 */
export function webHref(link: ActivityLink | null | undefined): string | null {
  if (!link) return null
  const id = link.params?.id
  if (!id) return null
  const pool = `/pools/${encodeURIComponent(id)}`
  switch (link.pathname) {
    case '/pool/[id]':
      return link.params.banter === 'open' ? `${pool}?tab=community` : pool
    case '/pool/[id]/duel/[matchweek]':
      return link.params.matchweek ? `${pool}/duel/${encodeURIComponent(link.params.matchweek)}` : pool
    case '/pool/[id]/pickem/[entryId]':
    case '/pool/[id]/survivor/[entryId]':
    case '/pool/[id]/table/[entryId]':
      return `${pool}?tab=predictions`
    default:
      return pool
  }
}

/** Mentions newer than the last visit — with a Needs-you card, what lights the dot. */
export function unreadMentions(items: FeedItem[], seenAt: string | null): number {
  if (!seenAt) return 0
  return items.filter((i) => i.activity_type === 'mention' && i.created_at > seenAt).length
}
