// =============================================================
// ACTIVITY PAGING — what one page of the feed is
// =============================================================
// A page is THREE MATCHWEEKS, plus everything else that happened in the same
// stretch of time (mentions, badges, rank moves). A matchweek is the unit the
// tab is read in — the history groups by it — so counting items instead would
// cut a weekend in half across two pages (Ryan, 2026-09-30).
//
// When no settled matchweek is left (a World Cup-only member, or the older end
// of anyone's history) a page falls back to FORTY items by time.
//
// The cursor is a timestamp: a page holds `floor <= created_at < before`, and
// the next request sends `before = floor`. Strictly-less on the next page, so a
// whole season's stories sharing one `ranks_snapshot_at` never split or repeat.
//
// Disclosure gate: "Older activity loads as you scroll, and stops at the start
// of your history." The feed is a finite personal record with an end marker.
//
// PURE — tested in lib/activity/__tests__/page.test.ts.
// =============================================================

import type { SettledWeek } from './matchweekStories'

/**
 * ⚠ COMPARE AS NUMBERS, NEVER AS STRINGS. Postgres hands back microseconds with
 * `+00:00` ("…01.146606+00:00") and JavaScript writes milliseconds with `Z`
 * ("…01.146Z"). As strings '6' < 'Z', so a week sitting exactly on the cursor
 * compared as older than itself and showed up on two pages. At millisecond
 * resolution both spellings are the same instant.
 */
const ms = (iso: string) => Date.parse(iso)

export const PAGE_MATCHWEEKS = 3
export const PAGE_ITEMS_FALLBACK = 40

/**
 * The settled weeks on this page: walking back from `before`, everything up to
 * (not including) the fourth distinct matchweek NUMBER. Numbers, not
 * (season, number) pairs, because the app groups by number — Premier League
 * MW4 and La Liga MW4 are one heading, so they are one page's worth.
 */
export function pageWeeks(
  weeks: SettledWeek[],
  before: string | null,
  size = PAGE_MATCHWEEKS,
): { weeks: SettledWeek[]; floor: string | null; olderWeeks: boolean } {
  const candidates = weeks
    .filter((w) => before == null || ms(w.settledAt) < ms(before))
    .sort((a, b) => ms(b.settledAt) - ms(a.settledAt))
  const numbers = new Set<number>()
  const picked: SettledWeek[] = []
  for (const w of candidates) {
    if (!numbers.has(w.matchweekNumber) && numbers.size === size) break
    numbers.add(w.matchweekNumber)
    picked.push(w)
  }
  if (picked.length === 0) return { weeks: [], floor: null, olderWeeks: false }
  const floor = picked[picked.length - 1].settledAt
  return { weeks: picked, floor, olderWeeks: candidates.length > picked.length }
}

/**
 * Cut one page out of newest-first items. `weekFloor` (from `pageWeeks`) sets
 * the page's bottom edge when there are matchweeks; otherwise the fortieth item
 * does. Ties on the floor stay together on this page.
 */
export function slicePage<T extends { created_at: string }>(
  items: T[],
  before: string | null,
  weekFloor: string | null,
  olderWeeks: boolean,
  fallback = PAGE_ITEMS_FALLBACK,
): { page: T[]; nextBefore: string | null } {
  const candidates = items.filter((i) => before == null || ms(i.created_at) < ms(before))
  const floor =
    weekFloor ?? (candidates.length > fallback ? candidates[fallback - 1].created_at : null)
  if (floor == null) return { page: candidates, nextBefore: null }
  const page = candidates.filter((i) => ms(i.created_at) >= ms(floor))
  const more = olderWeeks || candidates.some((i) => ms(i.created_at) < ms(floor))
  return { page, nextBefore: more ? floor : null }
}
