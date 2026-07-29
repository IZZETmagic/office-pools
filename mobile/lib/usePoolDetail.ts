import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from './auth';
import {
  fetchLeaderboard,
  type LeaderboardEntry,
  type MatchdayInfo,
  type MatchdayMvp,
  type PoolAward,
  type Superlative,
} from './api';
import { supabase } from './supabase';

export type PoolDetailInfo = {
  poolId: string;
  poolName: string;
  poolCode: string;
  description: string | null;
  predictionMode: string | null;
  brandName: string | null;
  brandEmoji: string | null;
  brandColor: string | null;
  brandLogoUrl: string | null;
  predictionDeadline: string | null;
  status: string;
  /** Join-ability, independent of `status` (migration 025). */
  acceptingMembers: boolean | null;
  maxParticipants: number | null;
  maxEntriesPerUser: number;
  isPrivate: boolean;
  memberCount: number;
  isAdmin: boolean;
  currentUserId: string | null;
  // Added for Pool Info tab parity with the web. createdAt powers the
  // "Created" row; entryFee + currency drive the Fees & Prize Pool card
  // (skipped entirely when fee is 0); totalEntries is the count of
  // pool_entries across all members for the same card's prize-pool math
  // AND the "Total entries" row in Entries & Participants.
  createdAt: string | null;
  entryFee: number | null;
  entryFeeCurrency: string | null;
  totalEntries: number;
};

export type PoolDetailData = {
  pool: PoolDetailInfo;
  leaderboard: LeaderboardEntry[];
  awards: PoolAward[];
  superlatives: Superlative[];
  matchdayMvp: MatchdayMvp | null;
  matchdayInfo: MatchdayInfo | null;
};

export function usePoolDetail(poolId: string | undefined) {
  const { user } = useAuth();
  const [data, setData] = useState<PoolDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!poolId || !user) return;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [{ data: userData, error: userErr }, { data: pool, error: poolErr }, lb] =
          await Promise.all([
            supabase.from('users').select('user_id').eq('auth_user_id', user.id).maybeSingle(),
            supabase
              .from('pools')
              .select(
                'pool_id, pool_name, pool_code, description, prediction_mode, brand_name, brand_emoji, brand_color, brand_logo_url, prediction_deadline, status, accepting_members, max_participants, max_entries_per_user, is_private, admin_user_id, created_at, entry_fee, entry_fee_currency',
              )
              .eq('pool_id', poolId)
              .maybeSingle(),
            fetchLeaderboard(poolId),
          ]);
        if (userErr) throw userErr;
        if (poolErr) throw poolErr;
        if (!pool) throw new Error('Pool not found.');

        const [{ count: memberCount }, { count: entryCount }] = await Promise.all([
          supabase
            .from('pool_members')
            .select('*', { count: 'exact', head: true })
            .eq('pool_id', poolId),
          // pool_entries has no pool_id column — pool scoping lives on
          // pool_members. Inner-join through pool_members so PostgREST
          // applies the filter; head:true skips payload, count:exact
          // still returns the row count.
          supabase
            .from('pool_entries')
            .select('entry_id, pool_members!inner(pool_id)', {
              count: 'exact',
              head: true,
            })
            .eq('pool_members.pool_id', poolId),
        ]);

        const poolRow = pool as {
          pool_id: string;
          pool_name: string;
          pool_code: string;
          description: string | null;
          prediction_mode: string | null;
          brand_name: string | null;
          brand_emoji: string | null;
          brand_color: string | null;
          brand_logo_url: string | null;
          prediction_deadline: string | null;
          status: string;
          accepting_members: boolean | null;
          max_participants: number | null;
          max_entries_per_user: number;
          is_private: boolean | null;
          admin_user_id: string;
          created_at: string | null;
          entry_fee: number | null;
          entry_fee_currency: string | null;
        };
        const currentUserId = (userData as { user_id: string } | null)?.user_id ?? null;

        setData({
          pool: {
            poolId: poolRow.pool_id,
            poolName: poolRow.pool_name,
            poolCode: poolRow.pool_code,
            description: poolRow.description,
            predictionMode: poolRow.prediction_mode,
            brandName: poolRow.brand_name,
            brandEmoji: poolRow.brand_emoji,
            brandColor: poolRow.brand_color,
            brandLogoUrl: poolRow.brand_logo_url,
            predictionDeadline: poolRow.prediction_deadline,
            status: poolRow.status,
            acceptingMembers: poolRow.accepting_members,
            maxParticipants: poolRow.max_participants,
            maxEntriesPerUser: poolRow.max_entries_per_user,
            isPrivate: !!poolRow.is_private,
            memberCount: memberCount ?? 0,
            isAdmin: currentUserId !== null && poolRow.admin_user_id === currentUserId,
            currentUserId,
            createdAt: poolRow.created_at,
            entryFee: poolRow.entry_fee,
            entryFeeCurrency: poolRow.entry_fee_currency,
            totalEntries: entryCount ?? 0,
          },
          leaderboard: lb.entries ?? [],
          awards: lb.awards ?? [],
          superlatives: lb.superlatives ?? [],
          matchdayMvp: lb.matchday_mvp ?? null,
          matchdayInfo: lb.matchday_info ?? null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load pool';
        setError(message);
        console.warn('[usePoolDetail]', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [poolId, user],
  );

  useEffect(() => {
    if (poolId && user) load('initial');
  }, [poolId, user, load]);

  // Live updates: when membership changes (someone joins, an admin
  // removes a player, a role flips), re-fetch the whole pool detail so
  // the LeaderboardTab and the header's member-count chip reflect the
  // new state without a manual pull-to-refresh. The same realtime
  // channel that powers useMemberRoster's MembersTab updates fires here
  // — different subscribers, one publication. We use the 'refresh' mode
  // so the existing UI stays mounted (no full-screen loader flicker).
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!poolId) return;
    const channelName = `pool-detail-members-${poolId}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pool_members', filter: `pool_id=eq.${poolId}` },
        () => {
          void loadRef.current('refresh');
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [poolId]);

  // ---------------------------------------------------------------------------
  // Live leaderboard, via the same Broadcast-from-database the web client uses.
  //
  // WHAT THIS FIXES: mobile's leaderboard was never live. The only realtime
  // subscription on this screen watches `pool_members` (joins and leaves), and
  // the leaderboard itself refreshed on screen FOCUS or pull-to-refresh — so
  // during a match the standings sat still until you navigated away and back.
  //
  // The DB trigger (2026-07-29) sends one message per pool per scoring pass on
  // `pool:{id}:leaderboard`, carrying only the rows whose numbers moved. Points
  // and ranks apply straight from that payload, so the table reorders within a
  // second of a goal being scored.
  //
  // The message carries the scoring half only — hit rate, form dots, streak and
  // level come from the leaderboard route — so a debounced refresh follows to
  // pick those up. Jittered, so one goal does not make every device in the pool
  // call the API in the same second.
  useEffect(() => {
    if (!poolId) return;
    let active = true;
    let statsTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(`pool:${poolId}:leaderboard`, { config: { private: true } })
      .on('broadcast', { event: 'leaderboard_update' }, (msg) => {
        const entries = (
          msg as { payload?: { entries?: Array<Partial<LeaderboardEntry> & { entry_id: string }> } }
        )?.payload?.entries;
        if (!entries?.length) return;

        const byEntry = new Map(entries.map((e) => [e.entry_id, e]));
        setData((prev) => {
          if (!prev) return prev;
          let changed = false;
          const merged = prev.leaderboard.map((row) => {
            const update = byEntry.get(row.entry_id);
            if (!update) return row;
            if (
              row.match_points === update.match_points &&
              row.bonus_points === update.bonus_points &&
              row.total_points === update.total_points &&
              row.current_rank === update.current_rank &&
              row.previous_rank === update.previous_rank
            ) {
              return row;
            }
            changed = true;
            return { ...row, ...update };
          });
          if (!changed) return prev;
          // The route returns rows already sorted by rank, and a score change
          // reorders them — re-sort so the table matches what a refresh would
          // show rather than leaving rows in their pre-goal positions.
          merged.sort((a, b) => {
            if (a.current_rank != null && b.current_rank != null && a.current_rank !== b.current_rank) {
              return a.current_rank - b.current_rank;
            }
            return b.total_points - a.total_points;
          });
          return { ...prev, leaderboard: merged };
        });

        if (statsTimer) clearTimeout(statsTimer);
        statsTimer = setTimeout(() => {
          void loadRef.current('refresh');
        }, 1500 + Math.random() * 4000);
      });

    // Private channels need the socket to carry the user's JWT; setAuth() is
    // async, so subscribe only after it resolves and only if still mounted.
    void Promise.resolve(supabase.realtime.setAuth()).then(() => {
      if (active) channel.subscribe();
    });

    return () => {
      active = false;
      if (statsTimer) clearTimeout(statsTimer);
      void channel.unsubscribe();
    };
  }, [poolId]);

  const refresh = useCallback(() => load('refresh'), [load]);

  return { data, loading, refreshing, error, refresh };
}
