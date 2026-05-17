import { useCallback, useEffect, useState } from 'react';

import { fetchPoolRounds, type PoolRound, type PoolRoundsResponse } from './api';

const ROUND_ORDER: string[] = [
  'group',
  'round_32',
  'round_16',
  'quarter_final',
  'semi_final',
  'third_place',
  'final',
];

const ROUND_LABELS: Record<string, string> = {
  group: 'Group Stage',
  round_32: 'Round of 32',
  round_16: 'Round of 16',
  quarter_final: 'Quarter Finals',
  semi_final: 'Semi Finals',
  third_place: '3rd Place',
  final: 'Final',
};

export function roundLabel(key: string): string {
  return ROUND_LABELS[key] ?? key;
}

export function usePoolRounds(poolId: string | undefined) {
  const [data, setData] = useState<PoolRoundsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!poolId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPoolRounds(poolId);
      const sortedRounds = [...res.rounds].sort(
        (a, b) => ROUND_ORDER.indexOf(a.round_key) - ROUND_ORDER.indexOf(b.round_key),
      );
      setData({ ...res, rounds: sortedRounds });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rounds');
      console.warn('[usePoolRounds]', err);
    } finally {
      setLoading(false);
    }
  }, [poolId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
}

export type { PoolRound };
