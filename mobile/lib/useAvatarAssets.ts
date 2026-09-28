import { useEffect, useState } from 'react';

import { apiFetch } from './api';
import type { AvatarAssets } from './avatar/compose';

// =============================================================
// The avatar art, on the phone
// =============================================================
// ⭐ ONLY THE EDITOR NEEDS THIS. The profile CARD gets a finished SVG from /api/avatar/me, so
// merely opening your profile never pulls the bundle. The editor previews on every tap and cannot
// afford a round trip per change — /api/avatar/me measured 284–476ms warm against 0.8ms to
// compose locally — so it takes the art once and composes from it. Display = server, editing =
// local.
//
// ⚠ ~169 KB gzipped, ~563 KB raw. Cached at MODULE scope rather than in state, so closing the
// editor and reopening it in the same session costs nothing. Deliberately not persisted to disk:
// the bundle is regenerated whenever an asset changes and its url never does, so a disk cache
// would need an invalidation story that does not exist yet.
//
// ✅ LIVE ON PRODUCTION since 2026-09-27 — /avatar-assets.json serves 200 from sportpool.io
// (576 KB, all 18 asset keys). It used to 404 there, which is why an older note here warned that a
// device had to reach a dev origin; that is no longer true and `api.ts`'s production default is
// now correct.
//
// ⚠ A DEVICE ON AN OLD BUILD STILL GETS NOTHING, and that is fine. Every consumer renders a
// fallback when the art is missing, so an app that cannot reach the bundle shows initials.
// =============================================================

/** Shared across every mount for the life of the app process. */
let cached: AvatarAssets | null = null;
/** The in-flight request, so two mounts in the same frame do not both fetch 563 KB. */
let inFlight: Promise<AvatarAssets> | null = null;

function load(): Promise<AvatarAssets> {
  if (cached) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = apiFetch<AvatarAssets>('/avatar-assets.json')
      .then((a) => {
        cached = a;
        return a;
      })
      .finally(() => {
        // ⚠ Cleared either way. Leaving a REJECTED promise here would make the first failure
        // permanent for the whole session — every later open would reuse it and never retry.
        inFlight = null;
      });
  }
  return inFlight;
}

export type AvatarAssetsState = {
  assets: AvatarAssets | null;
  error: string | null;
};

/**
 * @param enabled Whether this caller actually needs the art.
 *
 * ⭐⭐ THE GATE EXISTS BECAUSE OF THE HOME TAB. The editor always needs the bundle, but a pool
 * card needs it only if one of the three members on it has built a face — and pulling 563 KB to
 * draw three 24 px circles for members who have NOT built one is a straight waste. Measured at the
 * time of writing: 1 member in 4,839 had an avatar, so effectively nobody paid. As adoption grows
 * this converges on always-fetch, which is the correct end state; what it never does is fetch for
 * a screen that would have drawn initials anyway.
 *
 * ⚠ It does NOT unload anything. Once the bundle is in the module cache every caller gets it
 * regardless of `enabled` — the flag governs whether to START a fetch, not whether to use one that
 * already happened.
 */
export function useAvatarAssets(enabled = true): AvatarAssetsState {
  const [assets, setAssets] = useState<AvatarAssets | null>(cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached || !enabled) return;
    let cancelled = false;
    load()
      .then((a) => {
        if (!cancelled) setAssets(a);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the avatar art.');
      });
    return () => {
      cancelled = true;
    };
    // ⚠ `enabled` is a dependency: a card that mounts with no avatars and later receives one — a
    // member builds a face and the query refetches — must then go and get the art.
  }, [enabled]);

  return { assets, error };
}
