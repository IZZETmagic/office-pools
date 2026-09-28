import { describe, expect, it } from 'vitest';

import {
  badgeSource,
  podiumFinishes,
  tallyBadges,
  trophyTeaser,
  versionLabel,
  type PodiumPoolInput,
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
