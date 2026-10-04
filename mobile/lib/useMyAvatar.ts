import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from './api';

// =============================================================
// The caller's own composed avatar, and when to go and get it again
// =============================================================
// ⭐ The profile card draws a SERVER-COMPOSED avatar (see `app/api/avatar/me/route.ts`): display
// is server, editing is local. That is cheap and correct until the member EDITS — the profile tab
// stays mounted behind the editor's full-screen modal, so a `useEffect(..., [])` fetch never runs
// again and the card keeps showing the face they just replaced.
//
// ⚠⚠ NOT AN UNCONDITIONAL REFETCH ON FOCUS. The obvious fix is to reload whenever the profile tab
// regains focus, which would pull ~31 KB on every tab switch for a thing that changes a handful of
// times in an account's life. The house shape is a STALENESS-GATED refresh — `(tabs)/index.tsx`
// does exactly this with `refreshIfStale` — so the editor announces the change and only then does
// the card go back.
// =============================================================

export type MyAvatar = {
  svg: string | null;
  ground: string;
  hasAvatar: boolean;
};

/** Shared for the life of the app process, so a tab switch costs nothing. */
let cached: MyAvatar | null = null;
/** Set by the editor on a successful save; cleared once a refetch has happened. */
let stale = false;
let inFlight: Promise<MyAvatar> | null = null;
/**
 * Which SESSION the value in `cached` belongs to. Bumped by `resetMyAvatar`, so a request started
 * before a sign-out can be told apart from one started after it.
 */
let generation = 0;

function load(): Promise<MyAvatar> {
  if (!inFlight) {
    const g = generation;
    inFlight = apiFetch<MyAvatar>('/api/avatar/me')
      .then((r) => {
        // ⚠⚠ A RESPONSE FROM A SESSION THAT HAS ENDED IS DROPPED. `resetMyAvatar` can only empty
        // what has already landed; an in-flight request belonging to the outgoing member resolves
        // afterwards and would write their face straight back into `cached` — the original bug,
        // reappearing a few hundred milliseconds later and looking like a race nobody can catch.
        if (g === generation) {
          cached = r;
          stale = false;
        }
        return r;
      })
      .finally(() => {
        // ⚠ Cleared either way — parking a REJECTED promise here would make the first failure
        // permanent for the session, and every later focus would reuse it instead of retrying.
        //
        // ⚠ Only if it is still OURS. After a reset, `inFlight` is either null or a request the
        // new session started, and nulling that one would let a second fire alongside it.
        if (g === generation) inFlight = null;
      });
  }
  return inFlight;
}

/**
 * ⭐ THE EDITOR'S ANNOUNCEMENT. Called after a save lands, so the next time the card is looked at
 * it goes and gets the new face.
 *
 * ⚠ It does NOT fetch. The editor is unmounting at that moment and the card may not even be
 * mounted yet; firing a request here would race the navigation and could resolve into nothing.
 * Marking it is enough — the card's focus effect does the work.
 */
export function invalidateMyAvatar(): void {
  stale = true;
}

/**
 * ⭐⭐ THE SESSION TEARDOWN. Call this when the signed-in member changes — `lib/sessionReset.ts`
 * owns the call sites.
 *
 * ⚠⚠ WHY THIS HAS TO EXIST: `cached` lives for the life of the JS PROCESS, and signing out does
 * NOT restart the bundle. Without this, the next account to sign in on the device is shown the
 * previous member's composed face and ground colour — and shown it indefinitely, because
 * `useMyAvatar` seeds its state from `cached` and its effect returns early while `cached &&
 * !stale`, so no refetch ever corrects it. Reported 2026-10-04 after signing into a second
 * account; it survived until the app was killed.
 *
 * ⚠ NOT `invalidateMyAvatar()`. Marking it stale would leave the old face on screen until a
 * refetch lands, which on this path means rendering one member's likeness inside another member's
 * session. The value is dropped, so the card shows initials for the moment it takes to fetch.
 */
export function resetMyAvatar(): void {
  cached = null;
  stale = false;
  inFlight = null;
  generation += 1;
}

export function useMyAvatar(): {
  avatar: MyAvatar | null;
  refreshIfStale: () => void;
} {
  const [avatar, setAvatar] = useState<MyAvatar | null>(cached);

  useEffect(() => {
    if (cached && !stale) return;
    let cancelled = false;
    load()
      .then((r) => {
        if (!cancelled) setAvatar(r);
      })
      .catch(() => {
        // ⚠ Swallowed on purpose, unlike a data read: this is decoration around a screen that
        // works without it. An old build, a device pointed at production, or no signal all land
        // here and should show initials rather than an error.
        if (!cancelled) setAvatar(cached);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshIfStale = useCallback(() => {
    if (!stale) return;
    load()
      .then(setAvatar)
      .catch(() => {
        /* keep whatever is on screen */
      });
  }, []);

  return { avatar, refreshIfStale };
}
