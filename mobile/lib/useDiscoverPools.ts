import { useCallback, useEffect, useState } from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';

export type DiscoverPool = {
  poolId: string;
  poolName: string;
  poolCode: string;
  description: string | null;
  predictionMode: string | null;
  brandName: string | null;
  brandEmoji: string | null;
  brandColor: string | null;
  status: string;
  predictionDeadline: string | null;
  memberCount: number;
  alreadyJoined: boolean;
};

export function useDiscoverPools() {
  const { user } = useAuth();
  const [pools, setPools] = useState<DiscoverPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!user) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const { data: userData, error: userErr } = await supabase
          .from('users')
          .select('user_id')
          .eq('auth_user_id', user.id)
          .single();
        if (userErr || !userData) throw userErr ?? new Error('User not found');

        const { data: memberships } = await supabase
          .from('pool_members')
          .select('pool_id')
          .eq('user_id', userData.user_id);
        const joinedSet = new Set(
          ((memberships ?? []) as Array<{ pool_id: string }>).map((m) => m.pool_id),
        );

        const { data: poolRows, error: poolErr } = await supabase
          .from('pools')
          .select(
            `
            pool_id, pool_name, pool_code, description,
            prediction_mode, brand_name, brand_emoji, brand_color,
            status, prediction_deadline, is_private, created_at
          `,
          )
          .eq('is_private', false)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(100);

        if (poolErr) throw poolErr;

        const rows = (poolRows ?? []) as Array<{
          pool_id: string;
          pool_name: string;
          pool_code: string;
          description: string | null;
          prediction_mode: string | null;
          brand_name: string | null;
          brand_emoji: string | null;
          brand_color: string | null;
          status: string;
          prediction_deadline: string | null;
        }>;

        const counts: Record<string, number> = {};
        await Promise.all(
          rows.map(async (row) => {
            const { count } = await supabase
              .from('pool_members')
              .select('*', { count: 'exact', head: true })
              .eq('pool_id', row.pool_id);
            counts[row.pool_id] = count ?? 0;
          }),
        );

        const mapped: DiscoverPool[] = rows.map((row) => ({
          poolId: row.pool_id,
          poolName: row.pool_name,
          poolCode: row.pool_code,
          description: row.description,
          predictionMode: row.prediction_mode,
          brandName: row.brand_name,
          brandEmoji: row.brand_emoji,
          brandColor: row.brand_color,
          status: row.status,
          predictionDeadline: row.prediction_deadline,
          memberCount: counts[row.pool_id] ?? 0,
          alreadyJoined: joinedSet.has(row.pool_id),
        }));

        mapped.sort((a, b) => {
          const aBranded = a.brandName ? 0 : 1;
          const bBranded = b.brandName ? 0 : 1;
          if (aBranded !== bBranded) return aBranded - bBranded;
          if (a.memberCount !== b.memberCount) return b.memberCount - a.memberCount;
          return a.poolName.localeCompare(b.poolName);
        });

        setPools(mapped);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load pools';
        setError(message);
        console.warn('[useDiscoverPools]', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (user) load('initial');
  }, [user, load]);

  const refresh = useCallback(() => load('refresh'), [load]);

  return { pools, loading, refreshing, error, refresh };
}
