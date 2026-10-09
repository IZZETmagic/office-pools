import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from './auth';
import { seasonClocks, type MatchweekRow, type SeasonClock } from './discoverCard';
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
  /** `pools.league_depth`: 'results' is pick a winner; anything else, NULL included, is predict the score. */
  leagueDepth: string | null;
  leagueStartMatchweek: number | null;
  leagueTableLockAt: string | null;
  /** `tournaments.external_league_id` — the key for the competition's name and colour. */
  externalLeagueId: number | null;
  createdAt: string;
  brandName: string | null;
  brandEmoji: string | null;
  brandColor: string | null;
  status: string;
  predictionDeadline: string | null;
  memberCount: number;
  /** The admin's username, else their full name — see `adminNameOf`. */
  adminName: string | null;
  /** Where the pool's league season is. Null for a tournament pool. */
  seasonClock: SeasonClock | null;
};

type TournamentEmbed = { external_league_id: number | null };
type AdminEmbed = { username: string | null; full_name: string | null };

type PoolRow = {
  pool_id: string;
  pool_name: string;
  pool_code: string;
  description: string | null;
  prediction_mode: string | null;
  league_mode: string | null;
  league_depth: string | null;
  league_start_matchweek: number | null;
  league_table_lock_at: string | null;
  league_season_id: string | null;
  brand_name: string | null;
  brand_emoji: string | null;
  brand_color: string | null;
  status: string;
  prediction_deadline: string | null;
  created_at: string;
  // Many-to-one embeds come back as an OBJECT, but the typed client infers an
  // array — so both shapes are accepted, and `one()` reads either.
  tournaments: TournamentEmbed | TournamentEmbed[] | null;
  admin: AdminEmbed | AdminEmbed[] | null;
};

function one<T>(embed: T | T[] | null): T | null {
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

/**
 * Who runs the pool, as a stranger deciding whether to join should see them.
 *
 * ⭐ THE USERNAME FIRST, the full name only when there is none — the same order
 * as the Showdown leaderboard. A public pool is shown to people its admin has
 * never met, and a handle says less about them than a real name does.
 */
function adminNameOf(admin: AdminEmbed | null): string | null {
  const username = admin?.username?.trim();
  if (username) return username;
  return admin?.full_name?.trim() || null;
}

/**
 * Public pools you could join — and ONLY those.
 *
 * ⚠ POOLS YOU ARE ALREADY IN ARE LEFT OUT (Ryan, 2026-10-09: "hide joined
 * pools"). They used to come back wearing a "Joined" badge; the web's Discover
 * search has always dropped them. They live on My Pools.
 *
 * ⚠ THE PLAYER COUNT COMES FROM `public_pool_member_counts` (migration 184), NOT
 * FROM `pool_members`. That table is readable only by a pool's own members, so
 * counting it here returned 0 for every pool on this list — every pool a member
 * has not joined. Before 184, nobody outside a public pool ever saw it as
 * anything but empty.
 *
 * ⚠ `enabled` KEEPS IT LAZY. The hook lives on the Pools screen — the filter
 * sheet and the "Showing X of Y" line need the list as well as the cards — but
 * most visits to the tab never open Discover. It loads the first time `enabled`
 * is true and keeps what it has after that.
 */
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

        // ⚠ THE ERROR IS READ. Dropped, a failed read here would be an empty
        // set — and every pool you are in would reappear on Discover.
        const { data: memberships, error: memberErr } = await supabase
          .from('pool_members')
          .select('pool_id')
          .eq('user_id', userData.user_id);
        if (memberErr) throw memberErr;
        const joinedSet = new Set(
          ((memberships ?? []) as Array<{ pool_id: string }>).map((m) => m.pool_id),
        );

        const { data: poolRows, error: poolErr } = await supabase
          .from('pools')
          .select(
            `
            pool_id, pool_name, pool_code, description,
            prediction_mode, league_mode, league_depth, league_start_matchweek,
            league_table_lock_at, league_season_id,
            brand_name, brand_emoji, brand_color,
            status, prediction_deadline, is_private, created_at,
            tournaments(external_league_id),
            admin:users!pools_admin_user_id_fkey(username, full_name)
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

        const rows = ((poolRows ?? []) as unknown as PoolRow[]).filter((r) => !joinedSet.has(r.pool_id));

        // One call for every count, and one for every season's matchweeks — not
        // one query per pool.
        const seasonIds = [...new Set(rows.map((r) => r.league_season_id).filter((s): s is string => !!s))];
        const [countsRes, matchweeksRes] = await Promise.all([
          rows.length
            ? supabase.rpc('public_pool_member_counts', { p_pool_ids: rows.map((r) => r.pool_id) })
            : Promise.resolve({ data: [], error: null }),
          seasonIds.length
            ? supabase
                .from('league_matchweeks')
                .select('season_id, matchweek_number, lock_at')
                .in('season_id', seasonIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (countsRes.error) throw countsRes.error;
        if (matchweeksRes.error) throw matchweeksRes.error;

        const counts = new Map(
          ((countsRes.data ?? []) as Array<{ pool_id: string; member_count: number }>).map((c) => [
            c.pool_id,
            c.member_count,
          ]),
        );
        const clocks = seasonClocks((matchweeksRes.data ?? []) as MatchweekRow[], new Date());

        const mapped: DiscoverPool[] = rows.map((row) => ({
          poolId: row.pool_id,
          poolName: row.pool_name,
          poolCode: row.pool_code,
          description: row.description,
          predictionMode: row.prediction_mode,
          leagueMode: row.league_mode,
          leagueDepth: row.league_depth,
          leagueStartMatchweek: row.league_start_matchweek,
          leagueTableLockAt: row.league_table_lock_at,
          externalLeagueId: one(row.tournaments)?.external_league_id ?? null,
          createdAt: row.created_at,
          brandName: row.brand_name,
          brandEmoji: row.brand_emoji,
          brandColor: row.brand_color,
          status: row.status,
          predictionDeadline: row.prediction_deadline,
          memberCount: counts.get(row.pool_id) ?? 0,
          adminName: adminNameOf(one(row.admin)),
          seasonClock: row.league_season_id ? (clocks.get(row.league_season_id) ?? null) : null,
        }));

        // Order is the filter's job — `applyDiscoverFilters` in
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
