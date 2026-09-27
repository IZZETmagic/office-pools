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

function load(): Promise<MyAvatar> {
  if (!inFlight) {
    inFlight = apiFetch<MyAvatar>('/api/avatar/me')
      .then((r) => {
        cached = r;
        stale = false;
        return r;
      })
      .finally(() => {
        // ⚠ Cleared either way — parking a REJECTED promise here would make the first failure
        // permanent for the session, and every later focus would reuse it instead of retrying.
        inFlight = null;
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
