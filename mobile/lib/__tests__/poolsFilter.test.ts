import { describe, expect, it } from 'vitest';

import { LEAGUE_ID } from '../design/competition';
import {
  applyFilters,
  clearFilters,
  competitionOptions,
  countActiveFilters,
  DEFAULT_FILTERS,
  poolTypeOf,
  showsCompetitionRow,
  showsTypeRow,
  typeOptions,
  withCompetition,
  type FilterablePool,
  type PoolsFilters,
} from '../poolsFilter';

/** A World Cup Full Tournament pool, open, picked. Each test names only what it changes. */
function pool(over: Partial<FilterablePool> = {}): FilterablePool {
  return {
    status: 'open',
    predictionMode: 'full_tournament',
    leagueMode: null,
    needsPredictions: false,
    externalLeagueId: LEAGUE_ID.worldCup,
    brandName: null,
    joinedAt: '2026-06-01T00:00:00Z',
    poolName: 'Pool',
    totalPoints: 0,
    ...over,
  };
}

const league = (leagueMode: string | null, over: Partial<FilterablePool> = {}) =>
  pool({
    predictionMode: 'league_pickem',
    leagueMode,
    externalLeagueId: LEAGUE_ID.premierLeague,
    ...over,
  });

const f = (over: Partial<PoolsFilters>): PoolsFilters => ({ ...DEFAULT_FILTERS, ...over });

describe('poolTypeOf', () => {
  it('names a league pool by its league mode, never by league_pickem', () => {
    expect(poolTypeOf(league('showdown'))).toBe('showdown');
    expect(poolTypeOf(league('last_man_standing'))).toBe('last_man_standing');
  });

  it('reads a league pool with no league mode as Pick’em, as the card does', () => {
    expect(poolTypeOf(league(null))).toBe('pickem');
  });

  it('names a bracket pool by its prediction mode', () => {
    expect(poolTypeOf(pool({ predictionMode: 'progressive' }))).toBe('progressive');
  });

  it('returns null for a mode it does not know, so no type filter matches it', () => {
    expect(poolTypeOf(pool({ predictionMode: 'something_new' }))).toBeNull();
    expect(poolTypeOf(pool({ predictionMode: null }))).toBeNull();
  });
});

describe('applyFilters', () => {
  it('a league type shows league pools — the bug this filter once had', () => {
    const pools = [league('showdown', { poolName: 'S' }), league('pickem', { poolName: 'P' }), pool()];
    expect(applyFilters(pools, f({ type: 'showdown' })).map((p) => p.poolName)).toEqual(['S']);
  });

  it('filters by competition', () => {
    const pools = [league('pickem', { poolName: 'PL' }), pool({ poolName: 'WC' })];
    expect(
      applyFilters(pools, f({ competition: LEAGUE_ID.premierLeague })).map((p) => p.poolName),
    ).toEqual(['PL']);
  });

  it('never matches a pool with no competition to a chosen competition', () => {
    expect(applyFilters([pool({ externalLeagueId: null })], f({ competition: LEAGUE_ID.worldCup }))).toEqual([]);
  });

  it('Picks reads needsPredictions both ways', () => {
    const owes = pool({ poolName: 'owes', needsPredictions: true });
    const done = pool({ poolName: 'done' });
    expect(applyFilters([owes, done], f({ predictions: 'pending' }))).toEqual([owes]);
    expect(applyFilters([owes, done], f({ predictions: 'submitted' }))).toEqual([done]);
  });

  it('combines every axis', () => {
    const hit = league('showdown', { status: 'open', needsPredictions: true, poolName: 'hit' });
    const pools = [
      hit,
      league('showdown', { status: 'completed', needsPredictions: true }),
      league('showdown', { status: 'open', needsPredictions: false }),
      league('pickem', { status: 'open', needsPredictions: true }),
      pool({ needsPredictions: true }),
    ];
    const filters = f({
      status: 'open',
      type: 'showdown',
      predictions: 'pending',
      competition: LEAGUE_ID.premierLeague,
    });
    expect(applyFilters(pools, filters)).toEqual([hit]);
  });

  it('keeps branded pools first under every sort', () => {
    const branded = pool({ poolName: 'Zed', brandName: 'Brand', totalPoints: 0 });
    const plain = pool({ poolName: 'Abe', totalPoints: 100 });
    for (const sort of ['smart', 'newest', 'name', 'points'] as const) {
      expect(applyFilters([plain, branded], f({ sort }))[0]).toBe(branded);
    }
  });

  it('smart puts owed picks first, then points, then name', () => {
    const a = pool({ poolName: 'a', totalPoints: 10 });
    const b = pool({ poolName: 'b', totalPoints: 50 });
    const c = pool({ poolName: 'c', totalPoints: 0, needsPredictions: true });
    expect(applyFilters([a, b, c], f({ sort: 'smart' })).map((p) => p.poolName)).toEqual(['c', 'b', 'a']);
  });

  it('newest is the pool joined last', () => {
    const old = pool({ poolName: 'old', joinedAt: '2026-01-01T00:00:00Z' });
    const recent = pool({ poolName: 'recent', joinedAt: '2026-09-01T00:00:00Z' });
    expect(applyFilters([old, recent], f({ sort: 'newest' }))[0]).toBe(recent);
  });

  it('does not reorder the array it was given', () => {
    const pools = [pool({ poolName: 'b' }), pool({ poolName: 'a' })];
    applyFilters(pools, f({ sort: 'name' }));
    expect(pools.map((p) => p.poolName)).toEqual(['b', 'a']);
  });
});

describe('countActiveFilters / clearFilters', () => {
  it('counts the four narrowing axes and not the sort', () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
    expect(countActiveFilters(f({ sort: 'name' }))).toBe(0);
    expect(
      countActiveFilters(
        f({ status: 'open', type: 'pickem', predictions: 'pending', competition: LEAGUE_ID.premierLeague }),
      ),
    ).toBe(4);
  });

  it('clearing keeps the sort the member chose', () => {
    expect(clearFilters(f({ status: 'open', sort: 'name' }))).toEqual(f({ sort: 'name' }));
  });
});

describe('competitionOptions', () => {
  it('lists each named competition once, alphabetically, in title case', () => {
    const pools = [pool(), league('pickem'), league('showdown'), pool({ externalLeagueId: LEAGUE_ID.laLiga })];
    expect(competitionOptions(pools)).toEqual([
      { id: LEAGUE_ID.laLiga, name: 'La Liga', monogram: 'LL' },
      { id: LEAGUE_ID.premierLeague, name: 'Premier League', monogram: 'PL' },
      { id: LEAGUE_ID.worldCup, name: 'World Cup', monogram: 'WC' },
    ]);
  });

  it('skips pools with no competition or an unnamed one', () => {
    expect(competitionOptions([pool({ externalLeagueId: null }), pool({ externalLeagueId: 99999 })])).toEqual([]);
  });

  it('the row only shows when there are two competitions to choose between', () => {
    expect(showsCompetitionRow([pool(), pool()])).toBe(false);
    expect(showsCompetitionRow([pool(), league('pickem')])).toBe(true);
  });
});

describe('typeOptions', () => {
  const pools = [
    pool(),
    pool({ predictionMode: 'progressive' }),
    league('showdown'),
    league('table'),
  ];

  it('offers league games first, then the bracket modes', () => {
    expect(typeOptions(pools, DEFAULT_FILTERS)).toEqual(['showdown', 'table', 'full_tournament', 'progressive']);
  });

  it('under a competition, offers only the games played there', () => {
    expect(typeOptions(pools, f({ competition: LEAGUE_ID.premierLeague }))).toEqual(['showdown', 'table']);
  });

  it('is not narrowed by status or picks, so the row holds still', () => {
    const narrowed = f({ status: 'completed', predictions: 'pending' });
    expect(typeOptions(pools, narrowed)).toEqual(typeOptions(pools, DEFAULT_FILTERS));
  });

  it('always offers the selected game, so it can be tapped off', () => {
    expect(typeOptions([league('pickem')], f({ type: 'progressive' }))).toEqual(['pickem', 'progressive']);
  });

  it('the row only shows when there are two games to choose between', () => {
    expect(showsTypeRow([league('pickem'), league(null)])).toBe(false);
    expect(showsTypeRow(pools)).toBe(true);
  });
});

describe('withCompetition', () => {
  const pools = [pool({ predictionMode: 'progressive' }), league('showdown')];

  it('drops a chosen game that cannot exist in the new competition', () => {
    const next = withCompetition(pools, f({ type: 'progressive' }), LEAGUE_ID.premierLeague);
    expect(next).toEqual(f({ competition: LEAGUE_ID.premierLeague }));
  });

  it('keeps a chosen game that the new competition has', () => {
    const next = withCompetition(pools, f({ type: 'showdown' }), LEAGUE_ID.premierLeague);
    expect(next).toEqual(f({ type: 'showdown', competition: LEAGUE_ID.premierLeague }));
  });

  it('going back to all competitions keeps the game', () => {
    const next = withCompetition(pools, f({ type: 'showdown', competition: LEAGUE_ID.premierLeague }), 'all');
    expect(next).toEqual(f({ type: 'showdown' }));
  });
});
