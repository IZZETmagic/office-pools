import { useCallback, useEffect, useState } from 'react';

import { fetchEntryAnalytics, type AnalyticsResponse } from './api';

export function useEntryAnalytics(poolId: string | undefined, entryId: string | undefined) {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!poolId || !entryId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchEntryAnalytics(poolId, entryId);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
      console.warn('[useEntryAnalytics]', err);
    } finally {
      setLoading(false);
    }
  }, [poolId, entryId]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
