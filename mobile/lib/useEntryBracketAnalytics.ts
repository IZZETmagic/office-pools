import { useCallback, useEffect, useState } from 'react';

import {
  fetchBracketAnalytics,
  type BPAnalyticsResponse,
} from './api';

// ⚠ NOTHING is mirrored from web here any more.
//
// This file used to carry hand-copied copies of TWO web tables — the BP badge
// catalogue and the full XP level ladder, names and thresholds — behind a
// `makeEmptyAnalytics()` fallback. Its own comment gave the reason: the server
// "on older deployments" returned a 404 when no matches had completed.
//
// It does not. `bracket-analytics/route.ts` returns a fully shaped zero-state
// payload, ladder and badge catalogue included, and no route in the repo emits
// the "no completed matches" string the fallback matched on. So the branch was
// unreachable and the tables were stale copies that could only drift from the
// originals — which is exactly how the phone came to show a different level
// name than the web for the same member.
//
// Everything below is READ from the API.
export function useEntryBracketAnalytics(
  poolId: string | undefined,
  entryId: string | undefined,
) {
  const [data, setData] = useState<BPAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!poolId || !entryId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchBracketAnalytics(poolId, entryId);
      setData(res);
    } catch (err) {
      // Older deployments 404 with "No completed matches yet" pre-tournament.
      // Synthesize a zero-state so the Form tab can still render its
      // structure (hero card + badges) with placeholders.
      setError(
        err instanceof Error ? err.message : 'Failed to load bracket analytics',
      );
      console.warn('[useEntryBracketAnalytics]', err);
    } finally {
      setLoading(false);
    }
  }, [poolId, entryId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
}
