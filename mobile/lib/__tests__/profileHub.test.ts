import { describe, expect, it } from 'vitest';

import { badgeSource, tallyBadges, trophyTeaser, versionLabel } from '../profileHub';

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

describe('trophyTeaser', () => {
  it('says nothing while loading rather than a confident zero', () => {
    expect(trophyTeaser(null)).toBeNull();
  });
  it('reads naturally at zero, one and many', () => {
    expect(trophyTeaser(0)).toBe('Your first badge is waiting');
    expect(trophyTeaser(1)).toBe('1 badge earned');
    expect(trophyTeaser(14)).toBe('14 badges earned');
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
