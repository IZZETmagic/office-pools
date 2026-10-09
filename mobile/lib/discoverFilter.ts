// =============================================================
// WHICH PUBLIC POOLS DOES DISCOVER SHOW, AND IN WHAT ORDER?
// =============================================================
// Discover's half of the Pools tab filter sheet. The competition and game
// rules are the same as My Pools' and come from lib/poolsFilter.ts; the rest
// are Discover's own, built on what card A shows (lib/discoverCard.ts):
// prediction style, pool size, when it starts, and when its picks lock.
//
// ⚠ NO STATUS AND NO PICKS. Discover only lists open pools you are not in —
// useDiscoverPools asks for `status = 'open'` and, since 2026-10-09, drops the
// pools you have joined — so both would read the same for every row, a control
// that cannot change anything.
//
// ⚠ "LOCKS" SORTS ON THE NEXT LOCK, NEVER ON `prediction_deadline`. A league
// pool's deadline is the end of its season (May 2027 on both public pools on
// 2026-10-09); the lock that matters to a joiner is the next matchweek's.
//
// ⚠ NO REACT NATIVE IMPORTS — see lib/needsPredictions.ts.
// =============================================================

import { discoverCardFacts, predictionStyleOf, type CardPool, type SeasonClock } from './discoverCard';
import { poolTypeOf, type CompetitionFilter, type TypeFilter } from './poolsFilter';
import type { DiscoverPool } from './useDiscoverPools';

/** "popular" is the order Discover has always used: most members first. */
export type DiscoverSort = 'popular' | 'newest' | 'name' | 'locks';
export type StyleFilter = 'all' | 'results' | 'scores';
export type SizeFilter = 'all' | 'small' | 'medium' | 'large';
export type StartsFilter = 'all' | 'now' | 'later';

export type DiscoverFilters = {
  competition: CompetitionFilter;
  type: TypeFilter;
  style: StyleFilter;
  size: SizeFilter;
  starts: StartsFilter;
  sort: DiscoverSort;
};

export const DEFAULT_DISCOVER_FILTERS: DiscoverFilters = {
  competition: 'all',
  type: 'all',
  style: 'all',
  size: 'all',
  starts: 'all',
  sort: 'popular',
};

export type DiscoverFilterablePool = Pick<
  DiscoverPool,
  | 'poolName'
  | 'predictionMode'
  | 'leagueMode'
  | 'leagueDepth'
  | 'leagueStartMatchweek'
  | 'leagueTableLockAt'
  | 'predictionDeadline'
  | 'externalLeagueId'
  | 'brandName'
  | 'memberCount'
  | 'createdAt'
> & { seasonClock: SeasonClock | null };

/**
 * Under 10, 10–49, 50 and up. A pool of mates, a big group, a crowd — the
 * numbers are the member counts from migration 184, which a non-member can now
 * actually read.
 */
export function sizeOf(memberCount: number): Exclude<SizeFilter, 'all'> {
  if (memberCount < 10) return 'small';
  if (memberCount < 50) return 'medium';
  return 'large';
}

/**
 * 'later' when the pool's first matchweek is after the one open now, else
 * 'now' — a tournament pool and a pool already under way are both something
 * you would be playing in straight away.
 */
export function startsOf(pool: CardPool & { seasonClock: SeasonClock | null }, now: Date): Exclude<StartsFilter, 'all'> {
  return discoverCardFacts(pool, pool.seasonClock, now).matchweek?.startsAt != null ? 'later' : 'now';
}

/** The pools Discover shows for a search and a set of filters, in order. */
export function applyDiscoverFilters<T extends DiscoverFilterablePool>(
  pools: T[],
  filters: DiscoverFilters,
  search: string,
  now: Date,
): T[] {
  const q = search.trim().toLowerCase();
  const next = pools.filter((p) => {
    if (filters.competition !== 'all' && p.externalLeagueId !== filters.competition) return false;
    if (filters.type !== 'all' && poolTypeOf(p) !== filters.type) return false;
    // A pool with no weekly score picks has no style, so it matches neither.
    if (filters.style !== 'all' && predictionStyleOf(p) !== filters.style) return false;
    if (filters.size !== 'all' && sizeOf(p.memberCount) !== filters.size) return false;
    if (filters.starts !== 'all' && startsOf(p, now) !== filters.starts) return false;
    if (q && !p.poolName.toLowerCase().includes(q)) return false;
    return true;
  });

  // Computed once per pool, not once per comparison.
  const lockMs = new Map<T, number>();
  if (filters.sort === 'locks') {
    for (const p of next) {
      const lockAt = discoverCardFacts(p, p.seasonClock, now).lockAt;
      lockMs.set(p, lockAt ? new Date(lockAt).getTime() : Number.POSITIVE_INFINITY);
    }
  }

  next.sort((a, b) => {
    // Branded pools lead, whatever the sort — the same sponsorship rule as My
    // Pools, and the rule Discover has always had.
    const aBranded = a.brandName ? 0 : 1;
    const bBranded = b.brandName ? 0 : 1;
    if (aBranded !== bBranded) return aBranded - bBranded;

    switch (filters.sort) {
      case 'locks': {
        // Nothing waiting to lock is +Infinity, so it goes last; ties fall
        // back to the name.
        const la = lockMs.get(a) ?? Number.POSITIVE_INFINITY;
        const lb = lockMs.get(b) ?? Number.POSITIVE_INFINITY;
        if (la !== lb) return la < lb ? -1 : 1;
        return a.poolName.localeCompare(b.poolName);
      }
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'name':
        return a.poolName.localeCompare(b.poolName);
      case 'popular':
      default:
        if (a.memberCount !== b.memberCount) return b.memberCount - a.memberCount;
        return a.poolName.localeCompare(b.poolName);
    }
  });

  return next;
}

/** Filters narrowing the list — the badge. Sort reorders and search has its own ×. */
export function countDiscoverFilters(filters: DiscoverFilters): number {
  return (
    (filters.competition !== 'all' ? 1 : 0) +
    (filters.type !== 'all' ? 1 : 0) +
    (filters.style !== 'all' ? 1 : 0) +
    (filters.size !== 'all' ? 1 : 0) +
    (filters.starts !== 'all' ? 1 : 0)
  );
}

/** Every filter back to "all", keeping the sort. */
export function clearDiscoverFilters(filters: DiscoverFilters): DiscoverFilters {
  return { ...DEFAULT_DISCOVER_FILTERS, sort: filters.sort };
}
