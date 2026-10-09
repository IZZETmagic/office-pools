import { describe, expect, it } from 'vitest';

import { LEAGUE_ID } from '../design/competition';
import {
  applyDiscoverFilters,
  clearDiscoverFilters,
  countDiscoverFilters,
  DEFAULT_DISCOVER_FILTERS,
  type DiscoverFilterablePool,
  type DiscoverFilters,
} from '../discoverFilter';
import { typeOptions, withCompetition } from '../poolsFilter';

/** A Premier League Pick'em pool with no league_mode — what Discover held on 2026-10-09. */
function pool(over: Partial<DiscoverFilterablePool> = {}): DiscoverFilterablePool {
  return {
    poolName: 'Pool',
    predictionMode: 'league_pickem',
    leagueMode: null,
    externalLeagueId: LEAGUE_ID.premierLeague,
    brandName: null,
    memberCount: 1,
    createdAt: '2026-08-26T00:00:00Z',
    ...over,
  };
}

const f = (over: Partial<DiscoverFilters>): DiscoverFilters => ({ ...DEFAULT_DISCOVER_FILTERS, ...over });
const names = (ps: DiscoverFilterablePool[]) => ps.map((p) => p.poolName);

describe('applyDiscoverFilters', () => {
  it('a league type finds a league pool — no World Cup pill ever could', () => {
    const pools = [pool({ poolName: 'pickem' }), pool({ poolName: 'wc', predictionMode: 'full_tournament', externalLeagueId: LEAGUE_ID.worldCup })];
    expect(names(applyDiscoverFilters(pools, f({ type: 'pickem' }), ''))).toEqual(['pickem']);
  });

  it('filters by competition', () => {
    const pools = [pool({ poolName: 'pl' }), pool({ poolName: 'll', externalLeagueId: LEAGUE_ID.laLiga })];
    expect(names(applyDiscoverFilters(pools, f({ competition: LEAGUE_ID.laLiga }), ''))).toEqual(['ll']);
  });

  it('searches names, case-insensitively, on top of the filters', () => {
    const pools = [pool({ poolName: 'Galacticos' }), pool({ poolName: 'Other' })];
    expect(names(applyDiscoverFilters(pools, DEFAULT_DISCOVER_FILTERS, '  GALA '))).toEqual(['Galacticos']);
  });

  it('popular is most members first, then name — the order Discover always had', () => {
    const pools = [pool({ poolName: 'b', memberCount: 3 }), pool({ poolName: 'a', memberCount: 3 }), pool({ poolName: 'c', memberCount: 9 })];
    expect(names(applyDiscoverFilters(pools, f({ sort: 'popular' }), ''))).toEqual(['c', 'a', 'b']);
  });

  it('newest is the pool created last', () => {
    const pools = [pool({ poolName: 'old', createdAt: '2026-06-01T00:00:00Z' }), pool({ poolName: 'new', createdAt: '2026-09-01T00:00:00Z' })];
    expect(names(applyDiscoverFilters(pools, f({ sort: 'newest' }), ''))).toEqual(['new', 'old']);
  });

  it('keeps branded pools first under every sort', () => {
    const branded = pool({ poolName: 'Zed', brandName: 'Brand', memberCount: 0 });
    const plain = pool({ poolName: 'Abe', memberCount: 50, createdAt: '2026-09-30T00:00:00Z' });
    for (const sort of ['popular', 'newest', 'name'] as const) {
      expect(applyDiscoverFilters([plain, branded], f({ sort }), '')[0]).toBe(branded);
    }
  });
});

describe('countDiscoverFilters / clearDiscoverFilters', () => {
  it('counts competition and type, not the sort', () => {
    expect(countDiscoverFilters(f({ sort: 'name' }))).toBe(0);
    expect(countDiscoverFilters(f({ competition: LEAGUE_ID.premierLeague, type: 'pickem' }))).toBe(2);
  });

  it('clearing keeps the sort', () => {
    expect(clearDiscoverFilters(f({ type: 'pickem', sort: 'name' }))).toEqual(f({ sort: 'name' }));
  });
});

describe('the shared competition and type rules work on Discover’s pools', () => {
  const pools = [pool(), pool({ predictionMode: 'progressive', externalLeagueId: LEAGUE_ID.worldCup })];

  it('narrows the games to the chosen competition', () => {
    expect(typeOptions(pools, f({ competition: LEAGUE_ID.premierLeague }))).toEqual(['pickem']);
  });

  it('drops a game the new competition cannot have, keeping the sort', () => {
    expect(withCompetition(pools, f({ type: 'progressive', sort: 'name' }), LEAGUE_ID.premierLeague)).toEqual(
      f({ competition: LEAGUE_ID.premierLeague, sort: 'name' }),
    );
  });
});
