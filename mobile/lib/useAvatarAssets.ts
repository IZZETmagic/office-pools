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
// ⚠⚠ AGAINST PRODUCTION THIS 404s TODAY. /avatar-assets.json is 404 on sportpool.io and 200 on
// dev, and `api.ts` points at production by default. Until the avatar branch merges, a device has
// to reach a dev origin — which in `__DEV__` it does automatically, since `api.ts` derives the
// Metro host's machine.
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

export function useAvatarAssets(): AvatarAssetsState {
  const [assets, setAssets] = useState<AvatarAssets | null>(cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached) return;
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
  }, []);

  return { assets, error };
}
