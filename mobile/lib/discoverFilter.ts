// =============================================================
// WHICH PUBLIC POOLS DOES DISCOVER SHOW, AND IN WHAT ORDER?
// =============================================================
// Discover's half of the Pools tab filter sheet. The competition and game
// rules are the same as My Pools' and come from lib/poolsFilter.ts; what
// differs is what is left out and how it sorts.
//
// ⚠ NO STATUS AND NO PICKS. Discover only lists open pools you have not
// committed to (useDiscoverPools asks for `status = 'open'`), so both would
// read the same for every row — a control that cannot change anything.
//
// ⚠ NO "CLOSING SOON". A league pool's `prediction_deadline` is the end of its
// season (May 2027 on both public pools on 2026-10-09), so sorting by it would
// put a nine-month horizon on the same footing as a World Cup deadline and
// teach nobody anything.
//
// ⚠ NO REACT NATIVE IMPORTS — see lib/needsPredictions.ts.
// =============================================================

import { poolTypeOf, type CompetitionFilter, type TypeFilter } from './poolsFilter';
import type { DiscoverPool } from './useDiscoverPools';

/** "popular" is the order Discover has always used: most members first. */
export type DiscoverSort = 'popular' | 'newest' | 'name';

export type DiscoverFilters = {
  competition: CompetitionFilter;
  type: TypeFilter;
  sort: DiscoverSort;
};

export const DEFAULT_DISCOVER_FILTERS: DiscoverFilters = {
  competition: 'all',
  type: 'all',
  sort: 'popular',
};

export type DiscoverFilterablePool = Pick<
  DiscoverPool,
  | 'poolName'
  | 'predictionMode'
  | 'leagueMode'
  | 'externalLeagueId'
  | 'brandName'
  | 'memberCount'
  | 'createdAt'
>;

/** The pools Discover shows for a search and a set of filters, in order. */
export function applyDiscoverFilters<T extends DiscoverFilterablePool>(
  pools: T[],
  filters: DiscoverFilters,
  search: string,
): T[] {
  const q = search.trim().toLowerCase();
  const next = pools.filter((p) => {
    if (filters.competition !== 'all' && p.externalLeagueId !== filters.competition) return false;
    if (filters.type !== 'all' && poolTypeOf(p) !== filters.type) return false;
    if (q && !p.poolName.toLowerCase().includes(q)) return false;
    return true;
  });

  next.sort((a, b) => {
    // Branded pools lead, whatever the sort — the same sponsorship rule as My
    // Pools, and the rule Discover has always had.
    const aBranded = a.brandName ? 0 : 1;
    const bBranded = b.brandName ? 0 : 1;
    if (aBranded !== bBranded) return aBranded - bBranded;

    switch (filters.sort) {
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
  return (filters.competition !== 'all' ? 1 : 0) + (filters.type !== 'all' ? 1 : 0);
}

/** Both filters back to "all", keeping the sort. */
export function clearDiscoverFilters(filters: DiscoverFilters): DiscoverFilters {
  return { ...DEFAULT_DISCOVER_FILTERS, sort: filters.sort };
}
