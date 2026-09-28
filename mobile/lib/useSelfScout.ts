import { useCallback, useEffect, useState } from 'react';

import { fetchSelfScout, type SelfScoutResponse } from './api';

// =============================================================
// Your own scouting report, fetched — the Profile hub's Scouting door
// =============================================================
// ⚠ THE SEAL AND THE SCOPE ARE THE SERVER'S. `/api/me/scouting` counts only
// picks whose matchweek has locked, and sends only the lifetime fields. Nothing
// here re-applies either rule — a second copy is a second place to be wrong.
//
// Fetched when the screen opens, not on the hub: the report is only ever read
// by somebody who tapped into it, and the hub should not pay for a door nobody
// opened.
// =============================================================

export function useSelfScout() {
  const [data, setData] = useState<SelfScoutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSelfScout());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your scouting report');
      console.warn('[useSelfScout]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
