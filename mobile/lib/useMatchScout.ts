import { useCallback, useEffect, useState } from 'react';

import { fetchMatchScout, type MatchScoutResponse } from './api';

// =============================================================
// The match scout, fetched
// =============================================================
// ⚠ FETCHED ONLY WHEN THE SHEET OPENS. The picker draws ten fixtures; fetching
// a scout for each on mount would be ten round trips and ten provider-cache
// lookups to render nothing anybody asked for. `fixtureId` is null until a
// member taps, and the hook stays idle until then.
// =============================================================

export function useMatchScout(fixtureId: string | null | undefined) {
  const [data, setData] = useState<MatchScoutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!fixtureId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMatchScout(fixtureId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the scout report');
      console.warn('[useMatchScout]', err);
    } finally {
      setLoading(false);
    }
  }, [fixtureId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
