// =============================================================
// One face per person, however many rows draw it
// =============================================================
// ⭐ Banter draws the same member beside every run of their messages, and a leaderboard
// draws the whole pool. Composing (~1.2 ms) and turning the SVG (15–66 KB) into something
// drawable — a parsed tree on the phone, an image url on the web — per ROW is work repeated
// for a picture that has not changed, so it is done once per person and handed to every row
// that wants it.
//
// ⭐⭐ KEYED BY IDENTITY, NOT BY VALUE. The stored config arrives from a query as one
// object per fetch, and the asset bundle is one object per download. A refetch hands
// over new objects, so the face is made again (a member who just changed their avatar
// shows the new one), and the old entry is dropped with the object that keyed it —
// WeakMaps, so nothing here ever needs clearing, and nothing outlives what it drew.
//
// ⚠ A non-object build (null, a stray string) cannot key a WeakMap and is not cached:
// `make` runs every time. Today that only happens for a member with no avatar, which
// draws initials and never gets here.
//
// ⚠ TWO COPIES, ONE TEXT: `lib/avatar/faceCache.ts` (web) and `mobile/lib/avatar/faceCache.ts`
// (app). A guard (lib/design/__tests__/avatarFaceMirror.guard.test.ts) fails if they differ.
//
// PURE — tested in mobile/lib/__tests__/faceCache.test.ts, which therefore covers both.
// =============================================================

type ByGround<T> = Map<string, T>;

const cache = new WeakMap<object, WeakMap<object, ByGround<unknown>>>();

/**
 * `make()` for this (asset bundle, stored build, ground colour), at most once.
 *
 * `ground` is part of the key because a duel can move a member onto a different
 * colour than their own (MemberAvatar's `ground` override), and that is a different
 * picture of the same person.
 */
export function cachedFace<T>(assets: object, build: unknown, ground: string, make: () => T): T {
  if (typeof build !== 'object' || build === null) return make();

  let byBuild = cache.get(assets);
  if (!byBuild) {
    byBuild = new WeakMap();
    cache.set(assets, byBuild);
  }
  let byGround = byBuild.get(build) as ByGround<T> | undefined;
  if (!byGround) {
    byGround = new Map();
    byBuild.set(build, byGround);
  }
  // `has`, not a truthiness check: a build this bundle cannot draw caches as null,
  // and that answer is worth keeping too.
  if (byGround.has(ground)) return byGround.get(ground) as T;
  const face = make();
  byGround.set(ground, face);
  return face;
}
