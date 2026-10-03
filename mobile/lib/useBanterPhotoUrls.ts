// =============================================================
// useBanterPhotoUrls — signed URLs for the photos on screen
// =============================================================
// `banter-media` is private, so a photo is only viewable through a
// time-limited signed URL. This signs every photo path it is given in
// ONE request (createSignedUrls), keeps them, signs only the new ones
// when more scroll in, and re-signs everything before the hour is up.
//
// Returns a Map path → URL. A path missing from the map is "still
// loading" (or its file is gone — deleted messages lose their path, so
// that only happens if a file was removed out from under a live row).
// =============================================================

import { useEffect, useRef, useState } from 'react';

import { SIGNED_URL_SECONDS, signBanterPhotos } from './photos';

// Re-sign this long before expiry so an open chat never shows a dead link.
const REFRESH_EARLY_MS = 10 * 60 * 1000;

export function useBanterPhotoUrls(paths: string[]): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());
  const signedAtRef = useRef<Map<string, number>>(new Map());
  const key = Array.from(new Set(paths)).sort().join('|');
  // Bumped every REFRESH_EARLY_MS so the signing effect re-checks expiry.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), REFRESH_EARLY_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!key) return;
    let active = true;
    const all = key.split('|');
    const now = Date.now();
    const stale = all.filter((p) => {
      const at = signedAtRef.current.get(p);
      return at == null || now - at > SIGNED_URL_SECONDS * 1000 - REFRESH_EARLY_MS;
    });
    if (stale.length === 0) return;
    signBanterPhotos(stale)
      .then((fresh) => {
        if (!active || fresh.size === 0) return;
        const at = Date.now();
        for (const p of fresh.keys()) signedAtRef.current.set(p, at);
        setUrls((prev) => {
          const next = new Map(prev);
          for (const [p, u] of fresh) next.set(p, u);
          return next;
        });
      })
      .catch((err) => console.warn('[useBanterPhotoUrls] signing failed', err));
    return () => {
      active = false;
    };
  }, [key, tick]);

  return urls;
}
