// The cold-start cache is read during the FIRST RENDER of a cold launch, which
// makes its failure modes unusually expensive: a throw here is not a missing
// pool card, it is an app that will not open, on a device that cannot be fixed
// without a new build. So the branches asserted below are mostly about being
// wrong safely — a bumped version, an expired entry, a corrupt blob, a payload
// belonging to somebody else — plus the one that matters most, which is a
// binary that has no MMKV in it at all.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  CACHE_KEYS,
  __setStoreForTests,
  clearCache,
  readCache,
  writeCache,
} from '../persistentCache';

type Row = { hello: string };

function fakeStore(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getString: (k: string) => map.get(k),
    set: (k: string, v: string) => void map.set(k, v),
    delete: (k: string) => void map.delete(k),
    clearAll: () => map.clear(),
  };
}

const USER = 'auth-user-1';

describe('persistentCache', () => {
  beforeEach(() => __setStoreForTests(fakeStore()));

  it('round-trips a payload with its owner', () => {
    writeCache<Row>(CACHE_KEYS.home, USER, { hello: 'world' });
    const got = readCache<Row>(CACHE_KEYS.home);
    expect(got?.data).toEqual({ hello: 'world' });
    expect(got?.userId).toBe(USER);
  });

  it('misses — and does not throw — when the payload is not valid JSON', () => {
    // The realistic shape of this is a half-written blob after the app was
    // killed mid-write. It must read as "no cache", not as a crash.
    __setStoreForTests(fakeStore({ [CACHE_KEYS.home]: '{"v":1,"data":{"hel' }));
    expect(() => readCache<Row>(CACHE_KEYS.home)).not.toThrow();
    expect(readCache<Row>(CACHE_KEYS.home)).toBeNull();
  });

  it('misses on a version bump, so an old shape is never fed to new code', () => {
    const stale = JSON.stringify({
      v: 0,
      userId: USER,
      cachedAt: Date.now(),
      data: { hello: 'old shape' },
    });
    __setStoreForTests(fakeStore({ [CACHE_KEYS.home]: stale }));
    expect(readCache<Row>(CACHE_KEYS.home)).toBeNull();
  });

  it('misses on an entry older than the max age', () => {
    const ancient = JSON.stringify({
      v: 1,
      userId: USER,
      cachedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days, default cap is 7
      data: { hello: 'ancient' },
    });
    __setStoreForTests(fakeStore({ [CACHE_KEYS.home]: ancient }));
    expect(readCache<Row>(CACHE_KEYS.home)).toBeNull();
  });

  it('holds matches to a SHORTER leash than home data', () => {
    // A scoreline goes wrong in a way a pool name does not. Same age, two
    // different answers — this is the override doing its job.
    const cachedAt = Date.now() - 7 * 60 * 60 * 1000; // 7 hours
    const body = (key: string) =>
      JSON.stringify({ v: 1, userId: USER, cachedAt, data: { hello: key } });
    __setStoreForTests(
      fakeStore({
        [CACHE_KEYS.home]: body('home'),
        [CACHE_KEYS.matches]: body('matches'),
      }),
    );
    expect(readCache<Row>(CACHE_KEYS.home)).not.toBeNull();
    expect(readCache<Row>(CACHE_KEYS.matches)).toBeNull();
  });

  it('reports the owner so a caller can refuse another person\'s payload', () => {
    // The cache is read BEFORE auth resolves, so the hook cannot filter on the
    // way in — it adopts or revokes on the way out. That only works if the
    // owner survives the round trip.
    writeCache<Row>(CACHE_KEYS.home, 'someone-else', { hello: 'theirs' });
    expect(readCache<Row>(CACHE_KEYS.home)?.userId).toBe('someone-else');
  });

  it('clears everything, for sign-out on a shared phone', () => {
    writeCache<Row>(CACHE_KEYS.home, USER, { hello: 'a' });
    writeCache<Row>(CACHE_KEYS.activity, USER, { hello: 'b' });
    clearCache();
    expect(readCache<Row>(CACHE_KEYS.home)).toBeNull();
    expect(readCache<Row>(CACHE_KEYS.activity)).toBeNull();
  });

  describe('when the binary has no MMKV in it', () => {
    // Expo Go, any dev client built before MMKV was added, and this test run.
    // The contract is that the app behaves exactly as it did before the cache
    // existed: it fetches. Nothing here may throw.
    beforeEach(() => __setStoreForTests(null));

    it('reads as a miss instead of throwing', () => {
      expect(() => readCache<Row>(CACHE_KEYS.home)).not.toThrow();
      expect(readCache<Row>(CACHE_KEYS.home)).toBeNull();
    });

    it('swallows writes and clears', () => {
      expect(() => writeCache<Row>(CACHE_KEYS.home, USER, { hello: 'x' })).not.toThrow();
      expect(() => clearCache()).not.toThrow();
    });
  });
});
