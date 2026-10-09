import { describe, expect, it } from 'vitest';

import { seasonClocks, type MatchweekRow } from '../discoverCard';
import { LEAGUE_ID } from '../design/competition';
import {
  applyDiscoverFilters,
  clearDiscoverFilters,
  countDiscoverFilters,
  DEFAULT_DISCOVER_FILTERS,
  sizeOf,
  startsOf,
  type DiscoverFilterablePool,
  type DiscoverFilters,
} from '../discoverFilter';
import { showsCompetitionRow, showsTypeRow, typeOptions, withCompetition } from '../poolsFilter';

// 2026-10-09 19:45 UTC: Premier League matchweek 6 locks the next morning.
const NOW = new Date('2026-10-09T19:45:00Z');
const PL = seasonClocks(
  [
    { season_id: 'pl', matchweek_number: 6, lock_at: '2026-10-10T10:30:00Z' },
    { season_id: 'pl', matchweek_number: 7, lock_at: '2026-10-17T10:30:00Z' },
    { season_id: 'pl', matchweek_number: 38, lock_at: '2027-05-23T14:00:00Z' },
  ] satisfies MatchweekRow[],
  NOW,
).get('pl')!;

/** A Premier League Pick'em pool with no league_mode or depth — what Discover held on 2026-10-09. */
function pool(over: Partial<DiscoverFilterablePool> = {}): DiscoverFilterablePool {
  return {
    poolName: 'Pool',
    predictionMode: 'league_pickem',
    leagueMode: null,
    leagueDepth: null,
    leagueStartMatchweek: null,
    leagueTableLockAt: null,
    predictionDeadline: '2027-05-30T15:00:00Z',
    externalLeagueId: LEAGUE_ID.premierLeague,
    brandName: null,
    memberCount: 1,
    createdAt: '2026-08-26T00:00:00Z',
    seasonClock: PL,
    ...over,
  };
}

const f = (over: Partial<DiscoverFilters>): DiscoverFilters => ({ ...DEFAULT_DISCOVER_FILTERS, ...over });
const names = (ps: DiscoverFilterablePool[]) => ps.map((p) => p.poolName);
const run = (ps: DiscoverFilterablePool[], over: Partial<DiscoverFilters>, search = '') =>
  names(applyDiscoverFilters(ps, f(over), search, NOW));

describe('applyDiscoverFilters — competition, type, search', () => {
  it('a league type finds a league pool — no World Cup pill ever could', () => {
    const pools = [pool({ poolName: 'pickem' }), pool({ poolName: 'wc', predictionMode: 'full_tournament', externalLeagueId: LEAGUE_ID.worldCup, seasonClock: null })];
    expect(run(pools, { type: 'pickem' })).toEqual(['pickem']);
  });

  it('filters by competition', () => {
    const pools = [pool({ poolName: 'pl' }), pool({ poolName: 'll', externalLeagueId: LEAGUE_ID.laLiga })];
    expect(run(pools, { competition: LEAGUE_ID.laLiga })).toEqual(['ll']);
  });

  it('searches names, case-insensitively, on top of the filters', () => {
    const pools = [pool({ poolName: 'Galacticos' }), pool({ poolName: 'Other' })];
    expect(run(pools, {}, '  GALA ')).toEqual(['Galacticos']);
  });
});

describe('prediction style', () => {
  const pools = [
    pool({ poolName: 'winner', leagueDepth: 'results' }),
    pool({ poolName: 'score', leagueDepth: 'scores' }),
    pool({ poolName: 'null-is-score', leagueDepth: null }),
    pool({ poolName: 'lms', leagueMode: 'last_man_standing' }),
  ];

  it('splits weekly-pick pools by style; NULL depth reads as predict the score', () => {
    expect(run(pools, { style: 'results' })).toEqual(['winner']);
    expect(run(pools, { style: 'scores' })).toEqual(['null-is-score', 'score']);
  });

  it('a game with no weekly score picks matches neither style', () => {
    expect(run(pools, { style: 'results' })).not.toContain('lms');
    expect(run(pools, { style: 'scores' })).not.toContain('lms');
  });
});

describe('pool size', () => {
  it('buckets at 10 and 50', () => {
    expect([1, 9, 10, 49, 50, 192].map(sizeOf)).toEqual(['small', 'small', 'medium', 'medium', 'large', 'large']);
  });

  it('filters on the bucket', () => {
    const pools = [pool({ poolName: 'three', memberCount: 3 }), pool({ poolName: 'twenty', memberCount: 20 })];
    expect(run(pools, { size: 'medium' })).toEqual(['twenty']);
  });
});

describe('starts now or later', () => {
  it('a pool starting after the open matchweek is later; one under way, or a tournament, is now', () => {
    expect(startsOf(pool({ leagueStartMatchweek: 7 }), NOW)).toBe('later');
    expect(startsOf(pool({ leagueStartMatchweek: 2 }), NOW)).toBe('now');
    expect(startsOf(pool({ predictionMode: 'full_tournament', seasonClock: null }), NOW)).toBe('now');
  });

  it('filters on it', () => {
    const pools = [pool({ poolName: 'soon', leagueStartMatchweek: 7 }), pool({ poolName: 'running' })];
    expect(run(pools, { starts: 'later' })).toEqual(['soon']);
    expect(run(pools, { starts: 'now' })).toEqual(['running']);
  });
});

describe('sorting', () => {
  it('popular is most members first, then name — the order Discover always had', () => {
    const pools = [pool({ poolName: 'b', memberCount: 3 }), pool({ poolName: 'a', memberCount: 3 }), pool({ poolName: 'c', memberCount: 9 })];
    expect(run(pools, { sort: 'popular' })).toEqual(['c', 'a', 'b']);
  });

  it('newest is the pool created last', () => {
    const pools = [pool({ poolName: 'old', createdAt: '2026-06-01T00:00:00Z' }), pool({ poolName: 'new', createdAt: '2026-09-01T00:00:00Z' })];
    expect(run(pools, { sort: 'newest' })).toEqual(['new', 'old']);
  });

  it('locks puts the soonest next lock first and nothing-to-lock last — never the season-end deadline', () => {
    const pools = [
      pool({ poolName: 'starts-mw7', leagueStartMatchweek: 7 }),
      pool({ poolName: 'over', predictionMode: 'full_tournament', seasonClock: null, predictionDeadline: '2026-01-01T00:00:00Z' }),
      pool({ poolName: 'mw6' }),
    ];
    expect(run(pools, { sort: 'locks' })).toEqual(['mw6', 'starts-mw7', 'over']);
  });

  it('keeps branded pools first under every sort', () => {
    const branded = pool({ poolName: 'Zed', brandName: 'Brand', memberCount: 0, leagueStartMatchweek: 7 });
    const plain = pool({ poolName: 'Abe', memberCount: 50, createdAt: '2026-09-30T00:00:00Z' });
    for (const sort of ['popular', 'newest', 'name', 'locks'] as const) {
      expect(applyDiscoverFilters([plain, branded], f({ sort }), '', NOW)[0]).toBe(branded);
    }
  });
});

describe('countDiscoverFilters / clearDiscoverFilters', () => {
  it('counts the five filters, not the sort', () => {
    expect(countDiscoverFilters(f({ sort: 'locks' }))).toBe(0);
    expect(
      countDiscoverFilters(
        f({ competition: LEAGUE_ID.premierLeague, type: 'pickem', style: 'scores', size: 'small', starts: 'now' }),
      ),
    ).toBe(5);
  });

  it('clearing keeps the sort', () => {
    expect(clearDiscoverFilters(f({ type: 'pickem', size: 'large', sort: 'name' }))).toEqual(f({ sort: 'name' }));
  });
});

describe('the shared competition and type rules on Discover’s pools', () => {
  const pools = [pool(), pool({ predictionMode: 'progressive', externalLeagueId: LEAGUE_ID.worldCup, seasonClock: null })];

  it('narrows the games to the chosen competition', () => {
    expect(typeOptions(pools, f({ competition: LEAGUE_ID.premierLeague }))).toEqual(['pickem']);
  });

  it('drops a game the new competition cannot have, keeping everything else', () => {
    expect(withCompetition(pools, f({ type: 'progressive', size: 'small', sort: 'name' }), LEAGUE_ID.premierLeague)).toEqual(
      f({ competition: LEAGUE_ID.premierLeague, size: 'small', sort: 'name' }),
    );
  });

  it('Discover shows a row with one option; My Pools needs two', () => {
    const onlyPl = [pool(), pool()];
    expect(showsCompetitionRow(onlyPl)).toBe(false);
    expect(showsCompetitionRow(onlyPl, 1)).toBe(true);
    expect(showsTypeRow(onlyPl)).toBe(false);
    expect(showsTypeRow(onlyPl, 1)).toBe(true);
  });
});
