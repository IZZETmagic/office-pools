// =============================================================
// THE COLD-START CACHE
// =============================================================
// The problem this exists to solve: before it, a cold launch had NOTHING on
// disk. `useHomeData` and `useActivity` are hand-rolled `useState` hooks, so
// their data died with the JS context, and the splash gate in
// `app/_layout.tsx` waited on a live network round trip every single launch —
// six sequential waves plus a `4P + 2T` fan-out — to render pool cards that
// were, almost always, byte-identical to the ones shown ten minutes earlier.
//
// So we keep the last good payload on disk and paint it on frame zero, then
// reconcile with the network behind it. Stale-while-revalidate, except the
// "while" is now the whole cold start instead of a spinner.
//
// ## Why MMKV and not expo-file-system
//
// MMKV reads are SYNCHRONOUS. That is the entire reason it is here: the cache
// can be read inside a `useState` initialiser, during the first render, so
// there is no gate, no effect, and no empty first frame to fill. An async
// store would mean first-paint-empty → second-paint-data, which is the flicker
// we are removing.
//
// ## ⚠⚠ IT IS A NATIVE MODULE, AND THE APP MUST SURVIVE ITS ABSENCE
//
// MMKV is not in Expo Go, and it is not in any dev client built before it was
// added. On those binaries `new MMKV()` THROWS — and a throw at module scope on
// the cold-start path is not a degraded cache, it is an app that cannot launch,
// on a device that cannot be fixed without a new build.
//
// So every entry point here is wrapped and the store is created lazily. When
// the native module is missing, `getStore()` returns null exactly once, logs
// exactly once, and every read returns null / every write no-ops. The app
// behaves precisely as it did before this file existed: it fetches. That is
// also what makes this safe to run under Jest, where there is no native side
// at all.
// =============================================================

/**
 * The slice of MMKV this module uses.
 *
 * ⚠ DECLARED LOCALLY RATHER THAN IMPORTED. `import type { MMKV }` would be
 * erased at compile time and is harmless at runtime — but it still puts
 * `react-native-mmkv` in this module's type graph, and the root vitest config
 * cannot resolve anything out of `mobile/node_modules`. Declaring the shape
 * keeps the module genuinely pure, which is the condition for testing it at
 * all, and it is four methods.
 */
type KVStore = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  clearAll(): void;
};

/**
 * ⚠ BUMP THIS when the shape of anything cached changes. A stale payload
 * deserialised into a newer type is the classic persistence bug: it does not
 * throw, it renders — with `undefined` where a field used to be, usually as a
 * blank card or an "NaN" somewhere deep in a stat strip. The version is part of
 * the stored envelope and a mismatch is treated as a miss.
 */
const CACHE_VERSION = 1;

/**
 * How long a cached payload may be shown for. This is NOT a refetch trigger —
 * we always refetch. It is the point past which the data is too old to be worth
 * showing at all, so a user returning after a fortnight gets the splash rather
 * than a fortnight-old league table that is wrong in a way they might believe.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Per-key overrides for the above.
 *
 * ⚠ MATCHES ARE NOT POOL CARDS. A pool's name and member list are the same
 * today as they were last week, but a scoreline is a claim about the world that
 * goes wrong the moment a game kicks off. The refresh behind it always corrects
 * it within a round trip, and live scores arrive by broadcast on top — but the
 * window where we are confidently showing yesterday's result should be small,
 * so a member returning after a day waits for the truth instead of reading a
 * stale one. Six hours keeps the same-evening reopen instant, which is the case
 * that actually matters.
 */
const MAX_AGE_OVERRIDES: Record<string, number> = {
  'tournament-matches': 6 * 60 * 60 * 1000, // 6 hours
};

type Envelope<T> = {
  v: number;
  /**
   * The Supabase AUTH user id this payload belongs to.
   *
   * ⚠ LOAD-BEARING. The cache is read before auth resolves — that is the whole
   * point, it is what makes first paint instant — so the reader cannot yet know
   * who is signed in. Storing the owner lets the consumer adopt the payload
   * only once the restored session proves it is the same person, and discard it
   * otherwise. Without this, a second person signing in on the same phone would
   * be shown the first person's pools.
   */
  userId: string;
  cachedAt: number;
  data: T;
};

let store: KVStore | null = null;
let storeResolved = false;

/**
 * ⚠ TEST SEAM. Lets the suite exercise the branches that actually decide
 * whether a cold start is correct — a version bump, an expired entry, a blob
 * that no longer parses, the wrong owner — none of which need a native module
 * to be wrong. Pass `null` to simulate a binary without MMKV.
 *
 * Not called from app code.
 */
export function __setStoreForTests(fake: KVStore | null): void {
  store = fake;
  storeResolved = true;
}

/**
 * Lazily construct the MMKV instance, once, and never let a failure escape.
 *
 * ⚠ The `require` is deliberately inline rather than a top-level import. A
 * top-level import of a native module executes at module load — which here is
 * the cold-start path — and would take the app down with it on a binary that
 * does not have the module. Inline, the failure is contained to this function.
 */
function getStore(): KVStore | null {
  if (storeResolved) return store;
  storeResolved = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    store = new MMKV({ id: 'sportpool-cache-v1' });
  } catch (err) {
    store = null;
    console.warn(
      '[cache] MMKV unavailable — running without a cold-start cache. ' +
        'Expected in Expo Go, in a dev client built before MMKV was added, and under test.',
      err,
    );
  }
  return store;
}

/**
 * Read a cached payload, or null on any of: no native module, no entry, a
 * version bump, a payload older than `MAX_AGE_MS`, or a blob that no longer
 * parses.
 *
 * ⚠ A corrupt blob must never throw. This runs inside a `useState` initialiser
 * on the cold-start path, so an exception here is a white screen on launch with
 * no way for the user to clear it. A bad entry is dropped and treated as a miss.
 */
export function readCache<T>(key: string): Envelope<T> | null {
  const s = getStore();
  if (!s) return null;
  try {
    const raw = s.getString(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (parsed?.v !== CACHE_VERSION) {
      s.delete(key);
      return null;
    }
    const maxAge = MAX_AGE_OVERRIDES[key] ?? MAX_AGE_MS;
    if (typeof parsed.cachedAt !== 'number' || Date.now() - parsed.cachedAt > maxAge) {
      s.delete(key);
      return null;
    }
    if (typeof parsed.userId !== 'string' || !parsed.data) return null;
    return parsed;
  } catch (err) {
    console.warn(`[cache] unreadable entry at "${key}" — dropping`, err);
    try {
      s.delete(key);
    } catch {
      /* the delete is best-effort; a miss is already the outcome */
    }
    return null;
  }
}

/** Write a payload, stamped with its owner and the current time. Never throws. */
export function writeCache<T>(key: string, userId: string, data: T): void {
  const s = getStore();
  if (!s) return;
  try {
    const envelope: Envelope<T> = { v: CACHE_VERSION, userId, cachedAt: Date.now(), data };
    s.set(key, JSON.stringify(envelope));
  } catch (err) {
    // A failed write is a slow next launch, not a broken one.
    console.warn(`[cache] write failed for "${key}"`, err);
  }
}

/**
 * Drop everything.
 *
 * ⚠ CALL THIS ON SIGN-OUT. The envelope's `userId` stops the wrong person's
 * data being *rendered*, but it does not stop it sitting on the device. On a
 * shared phone that is someone else's pool names, member initials and standings
 * left in the sandbox after they have signed out.
 */
export function clearCache(): void {
  const s = getStore();
  if (!s) return;
  try {
    s.clearAll();
  } catch (err) {
    console.warn('[cache] clear failed', err);
  }
}

/** Cache keys. Kept here so no two callers can disagree about a string. */
export const CACHE_KEYS = {
  home: 'home-data',
  activity: 'activity-feed',
  matches: 'tournament-matches',
} as const;
