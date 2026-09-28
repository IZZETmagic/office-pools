import { describe, expect, it } from 'vitest';

import {
  badgeSource,
  finishMedal,
  groupSeasons,
  podiumFinishes,
  groupByMode,
  seasonRowCells,
  seasonsTeaser,
  tallyBadges,
  trophyTeaser,
  versionLabel,
  type PodiumPoolInput,
  type SeasonPoolInput,
} from '../profileHub';

describe('tallyBadges', () => {
  it('counts per badge, remembers distinct pools, and sorts most-earned first', () => {
    const tally = tallyBadges([
      { badgeId: 'sniper', poolId: 'a', poolName: 'Office' },
      { badgeId: 'oracle', poolId: 'a', poolName: 'Office' },
      { badgeId: 'sniper', poolId: 'b', poolName: 'Crew' },
      { badgeId: 'sniper', poolId: 'a', poolName: 'Office' },
    ]);
    expect(tally.map((t) => [t.id, t.count])).toEqual([
      ['sniper', 3],
      ['oracle', 1],
    ]);
    expect(tally[0].pools.map((p) => p.poolId)).toEqual(['a', 'b']);
  });

  it('drops transient badges — holding top spot for an afternoon is not a trophy', () => {
    expect(tallyBadges([{ badgeId: 'top_dog', poolId: 'a', poolName: 'Office' }])).toEqual([]);
  });

  it('breaks count ties alphabetically so the shelf does not reshuffle between loads', () => {
    const tally = tallyBadges([
      { badgeId: 'zeta', poolId: 'a', poolName: null },
      { badgeId: 'alpha', poolId: 'a', poolName: null },
    ]);
    expect(tally.map((t) => t.id)).toEqual(['alpha', 'zeta']);
  });
});

describe('badgeSource', () => {
  it('names the pool when there is one, and counts them when there are several', () => {
    const [one] = tallyBadges([{ badgeId: 'x', poolId: 'a', poolName: 'Office' }]);
    expect(badgeSource(one)).toBe('Office');
    const [two] = tallyBadges([
      { badgeId: 'x', poolId: 'a', poolName: 'Office' },
      { badgeId: 'x', poolId: 'b', poolName: 'Crew' },
    ]);
    expect(badgeSource(two)).toBe('2 pools');
  });
});

describe('tallyBadges unlock list', () => {
  it('lists every unlock newest first', () => {
    const [t] = tallyBadges([
      { badgeId: 'x', poolId: 'a', poolName: 'Office', unlockedAt: '2026-07-01T00:00:00Z' },
      { badgeId: 'x', poolId: 'b', poolName: 'Crew', unlockedAt: '2026-09-01T00:00:00Z' },
    ]);
    expect(t.unlocks.map((u) => u.poolName)).toEqual(['Crew', 'Office']);
  });
});

const pool = (over: Partial<PodiumPoolInput>): PodiumPoolInput => ({
  poolId: 'p',
  poolName: 'Pool',
  status: 'completed',
  leagueMode: null,
  currentRank: 1,
  totalEntries: 10,
  memberCount: 10,
  ...over,
});

describe('podiumFinishes', () => {
  it('counts 1st, 2nd and 3rd from finished pools, best first', () => {
    const p = podiumFinishes(
      [
        pool({ poolId: 'a', poolName: 'Work', currentRank: 3 }),
        pool({ poolId: 'b', poolName: 'Crew', currentRank: 1 }),
        pool({ poolId: 'c', poolName: 'Family', currentRank: 9 }),
      ],
      new Set(),
    );
    expect([p.first, p.second, p.third]).toEqual([1, 0, 1]);
    expect(p.finishes.map((f) => f.poolName)).toEqual(['Crew', 'Work']);
  });

  it('ignores a live pool — a current rank is not a finish', () => {
    expect(podiumFinishes([pool({ status: 'open' })], new Set()).first).toBe(0);
  });

  it('ignores archived pools, the same rule badges follow', () => {
    expect(podiumFinishes([pool({ poolId: 'a' })], new Set(['a'])).first).toBe(0);
  });

  it('never counts Last Man Standing — its stored rank is join order', () => {
    expect(podiumFinishes([pool({ leagueMode: 'last_man_standing' })], new Set()).first).toBe(0);
  });

  it('needs somebody finishing below you: 1st of 1 and 3rd of 3 do not count', () => {
    const p = podiumFinishes(
      [
        pool({ poolId: 'a', currentRank: 1, totalEntries: 1, memberCount: 1 }),
        pool({ poolId: 'b', currentRank: 3, totalEntries: 3, memberCount: 3 }),
        pool({ poolId: 'c', currentRank: 2, totalEntries: 3, memberCount: 3 }),
      ],
      new Set(),
    );
    expect([p.first, p.second, p.third]).toEqual([0, 1, 0]);
  });

  it('falls back to member count when entries were not counted', () => {
    expect(podiumFinishes([pool({ totalEntries: 0, memberCount: 5 })], new Set()).first).toBe(1);
  });
});

describe('trophyTeaser', () => {
  it('says nothing while either half is loading rather than a confident zero', () => {
    expect(trophyTeaser(null, 1)).toBeNull();
    expect(trophyTeaser(3, null)).toBeNull();
  });
  it('reads naturally at zero, one and many', () => {
    expect(trophyTeaser(0, 0)).toBe('Your first badge is waiting');
    expect(trophyTeaser(1, 0)).toBe('1 badge');
    expect(trophyTeaser(14, 1)).toBe('1 title · 14 badges');
    expect(trophyTeaser(0, 2)).toBe('2 titles');
  });
});

describe('versionLabel', () => {
  it('says dev under Metro instead of inventing an update id', () => {
    expect(
      versionLabel({ appVersion: '1.2.0', runtimeVersion: '1.2.0', updateId: null, isDev: true }),
    ).toBe('SportPool 1.2.0 · dev');
  });
  it('shows the short update id for an OTA bundle, and hides a runtime equal to the version', () => {
    expect(
      versionLabel({
        appVersion: '1.2.0',
        runtimeVersion: '1.2.0',
        updateId: 'abcdef12-3456-7890',
        isDev: false,
      }),
    ).toBe('SportPool 1.2.0 · update abcdef12');
  });
  it('shows the runtime when it differs from the app version', () => {
    expect(
      versionLabel({ appVersion: '1.2.1', runtimeVersion: '1.2.0', updateId: null, isDev: false }),
    ).toBe('SportPool 1.2.1 · runtime 1.2.0');
  });
});

const sp = (over: Partial<SeasonPoolInput>): SeasonPoolInput => ({
  poolId: 'p',
  poolName: 'Pool',
  status: 'open',
  tournamentId: 'pl',
  memberCount: 10,
  predictionMode: 'league_pickem',
  leagueMode: 'pickem',
  currentRank: 3,
  totalEntries: 14,
  totalPoints: 112,
  hasScoringStarted: true,
  level: null,
  formResults: [],
  league: null,
  ...over,
});

const T = [
  { tournamentId: 'wc', name: 'FIFA World Cup 2026', startDate: '2026-06-11', endDate: '2026-07-19' },
  { tournamentId: 'pl', name: 'Premier League 2026/27', startDate: '2026-08-21', endDate: '2027-05-30' },
  { tournamentId: 'll', name: 'La Liga 2026/27', startDate: '2026-08-15', endDate: '2027-05-30' },
];

describe('groupSeasons', () => {
  it('groups by competition, live first, then newest finished', () => {
    const s = groupSeasons(
      [
        sp({ poolId: 'a', tournamentId: 'wc', status: 'completed' }),
        sp({ poolId: 'b', tournamentId: 'pl' }),
        sp({ poolId: 'c', tournamentId: 'll' }),
      ],
      T,
      new Set(),
    );
    expect(s.map((x) => [x.name, x.live])).toEqual([
      ['La Liga 2026/27', true],
      ['Premier League 2026/27', true],
      ['FIFA World Cup 2026', false],
    ]);
  });

  it('takes a competition\'s state from YOUR pools, not the stale tournaments.status', () => {
    const s = groupSeasons(
      [
        sp({ poolId: 'a', tournamentId: 'pl', status: 'completed' }),
        sp({ poolId: 'b', tournamentId: 'pl', status: 'open' }),
      ],
      T,
      new Set(),
    );
    expect(s[0].live).toBe(true);
    // open pools lead inside a section
    expect(s[0].pools.map((p) => p.poolId)).toEqual(['b', 'a']);
  });

  it('leaves archived pools out, and drops a competition that only had archived pools', () => {
    const s = groupSeasons(
      [sp({ poolId: 'a', tournamentId: 'wc', status: 'completed' }), sp({ poolId: 'b' })],
      T,
      new Set(['a']),
    );
    expect(s.map((x) => x.tournamentId)).toEqual(['pl']);
  });

  it('still groups when the names could not be read', () => {
    expect(groupSeasons([sp({})], [], new Set())[0].name).toBe('Competition');
  });
});

const lms = {
  leagueMode: 'last_man_standing',
  lms: {
    roundsWon: 1,
    roundNumber: 2,
    clubsUsed: 5,
    clubPool: 20,
    survivorsLeft: 9,
    roundEntrants: 23,
    isEliminated: false,
  },
} as never;

describe('seasonRowCells', () => {
  it('puts rank then points under shared headers, labels out of the cells', () => {
    const r = seasonRowCells(sp({ league: { leagueMode: 'pickem' } as never }));
    expect(r.headers).toEqual(['Rank', 'Points']);
    expect(r.cells[0]).toEqual({ value: '3rd', sub: 'of 14' });
    expect(r.cells[1].value).toBe('112');
  });

  it('keeps the rank column the rank before scoring starts — "—", not Points sliding left', () => {
    const r = seasonRowCells(sp({ hasScoringStarted: false, league: { leagueMode: 'pickem' } as never }));
    expect(r.headers[0]).toBe('Rank');
    expect(r.cells[0]).toEqual({ value: '—', muted: true });
    expect(r.headers[1]).toBe('Points');
  });

  it('never shows a rank in Last Man Standing — Rounds and Clubs instead', () => {
    const r = seasonRowCells(sp({ leagueMode: 'last_man_standing', currentRank: 2, league: lms }));
    expect(r.headers).toEqual(['Rounds', 'Clubs']);
    expect(r.cells.map((c) => c.value)).toEqual(['1', '5']);
  });
});

describe('groupByMode', () => {
  it('splits a competition by mode, weekly games first', () => {
    const g = groupByMode([
      sp({ poolId: 'l', leagueMode: 'last_man_standing', league: lms }),
      sp({ poolId: 'p1', league: { leagueMode: 'pickem' } as never }),
      sp({ poolId: 'p2', league: { leagueMode: 'pickem' } as never }),
    ]);
    expect(g.map((x) => x.pools.map((p) => p.poolId))).toEqual([['p1', 'p2'], ['l']]);
  });

  it('never mixes columns in one group — same mode, different headers splits', () => {
    const g = groupByMode([
      sp({ poolId: 'a', leagueMode: 'showdown', league: null }),
      sp({ poolId: 'b', leagueMode: 'showdown', league: null, hasScoringStarted: false }),
    ]);
    // both fall back to the same blocks, so they share a group
    expect(g).toHaveLength(1);
    expect(new Set(g.flatMap((x) => x.pools.map((p) => seasonRowCells(p).headers.join()))).size).toBe(1);
  });
});

describe('finishMedal', () => {
  it('uses the Trophy Room rules — a medal only on a finished podium', () => {
    expect(finishMedal(pool({ currentRank: 2 }))).toBe(2);
    expect(finishMedal(pool({ status: 'open' }))).toBeNull();
    expect(finishMedal(pool({ leagueMode: 'last_man_standing' }))).toBeNull();
  });
});

describe('seasonsTeaser', () => {
  it('counts live and finished competitions', () => {
    expect(seasonsTeaser(null)).toBeNull();
    expect(seasonsTeaser([])).toBe('Your competitions will collect here');
    expect(seasonsTeaser([{ live: true }, { live: true }, { live: false }])).toBe('2 live · 1 finished');
  });
});
