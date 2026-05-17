import { useCallback, useEffect, useState } from 'react';

import { fetchBreakdown, type BreakdownResponse } from './api';

export function useBreakdown(poolId: string | undefined, entryId: string | undefined) {
  const [data, setData] = useState<BreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!poolId || !entryId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchBreakdown(poolId, entryId);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load breakdown');
      console.warn('[useBreakdown]', err);
    } finally {
      setLoading(false);
    }
  }, [poolId, entryId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
