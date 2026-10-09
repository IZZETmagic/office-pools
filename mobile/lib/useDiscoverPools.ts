import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';

export type DiscoverPool = {
  poolId: string;
  poolName: string;
  poolCode: string;
  description: string | null;
  predictionMode: string | null;
  /**
   * `pools.league_mode` — which of the four league games. ⚠ `predictionMode`
   * ALONE CANNOT NAME A LEAGUE POOL (all four carry `league_pickem`), which is
   * why every league pool here used to wear the word "Pool" in World Cup blue.
   */
  leagueMode: string | null;
  /** `tournaments.external_league_id` — the key for the competition's name and colour. */
  externalLeagueId: number | null;
  createdAt: string;
  brandName: string | null;
  brandEmoji: string | null;
  brandColor: string | null;
  status: string;
  predictionDeadline: string | null;
  memberCount: number;
  alreadyJoined: boolean;
};

/**
 * Public pools you could join.
 *
 * ⚠ `enabled` KEEPS IT LAZY. The hook now lives on the Pools screen — the
 * filter sheet and the "Showing X of Y" line need the list as well as the cards
 * — but a load is one query per pool for member counts, and most visits to the
 * tab never open Discover. It loads the first time `enabled` is true and keeps
 * what it has after that.
 */
type TournamentEmbed = { external_league_id: number | null };

export function useDiscoverPools({ enabled = true }: { enabled?: boolean } = {}) {
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
            prediction_mode, league_mode, brand_name, brand_emoji, brand_color,
            status, prediction_deadline, is_private, created_at,
            tournaments(external_league_id)
          `,
          )
          .eq('is_private', false)
          .eq('status', 'open')
          // ⚠ `status = 'open'` DOES NOT EXCLUDE AN ARCHIVED POOL. Archiving
          // stamps `archived_at` and deliberately leaves the lifecycle status
          // alone, so without this an archived public pool was still being
          // offered on the Pools tab's Discover segment — an invitation to
          // join a read-only pool.
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(100);

        if (poolErr) throw poolErr;

        const rows = (poolRows ?? []) as Array<{
          pool_id: string;
          pool_name: string;
          pool_code: string;
          description: string | null;
          prediction_mode: string | null;
          league_mode: string | null;
          brand_name: string | null;
          brand_emoji: string | null;
          brand_color: string | null;
          status: string;
          prediction_deadline: string | null;
          created_at: string;
          // One FK (pools.tournament_id), so PostgREST embeds an OBJECT — but the
          // typed client infers an array, so both shapes are accepted and read
          // the same way below.
          tournaments: TournamentEmbed | TournamentEmbed[] | null;
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
          leagueMode: row.league_mode,
          externalLeagueId:
            (Array.isArray(row.tournaments) ? row.tournaments[0] : row.tournaments)
              ?.external_league_id ?? null,
          createdAt: row.created_at,
          brandName: row.brand_name,
          brandEmoji: row.brand_emoji,
          brandColor: row.brand_color,
          status: row.status,
          predictionDeadline: row.prediction_deadline,
          memberCount: counts[row.pool_id] ?? 0,
          alreadyJoined: joinedSet.has(row.pool_id),
        }));

        // Order is the filter's job now — `applyDiscoverFilters` in
        // lib/discoverFilter.ts, where "Popular" is the order this used to be.
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

  // Once per signed-in user, the first time Discover is shown.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !user || loadedFor.current === user.id) return;
    loadedFor.current = user.id;
    load('initial');
  }, [enabled, user, load]);

  const refresh = useCallback(() => load('refresh'), [load]);

  return { pools, loading, refreshing, error, refresh };
}
