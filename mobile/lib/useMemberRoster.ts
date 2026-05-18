import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from './supabase';

export type RosterMember = {
  memberId: string;
  userId: string;
  fullName: string;
  username: string;
  role: string;
  isAdmin: boolean;
  joinedAt: string;
  entryCount: number;
  bestPoints: number;
};

type DbRow = {
  member_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  users:
    | { full_name: string | null; username: string | null }
    | Array<{ full_name: string | null; username: string | null }>
    | null;
  pool_entries: Array<{ entry_id: string; total_points: number | null }> | null;
};

export function useMemberRoster(poolId: string | undefined) {
  const [members, setMembers] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!poolId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('pool_members')
        .select(
          'member_id, user_id, role, joined_at, users:user_id(full_name, username), pool_entries(entry_id, total_points)',
        )
        .eq('pool_id', poolId);
      if (err) throw err;
      const rows = (data as DbRow[] | null) ?? [];
      const list: RosterMember[] = rows.map((r) => {
        const user = Array.isArray(r.users) ? r.users[0] : r.users;
        const entries = r.pool_entries ?? [];
        const bestPoints = entries.reduce(
          (max, e) => Math.max(max, e.total_points ?? 0),
          0,
        );
        return {
          memberId: r.member_id,
          userId: r.user_id,
          fullName: user?.full_name ?? 'Member',
          username: user?.username ?? '',
          role: r.role,
          isAdmin: r.role === 'admin',
          joinedAt: r.joined_at,
          entryCount: entries.length,
          bestPoints,
        };
      });
      list.sort((a, b) => {
        if (a.bestPoints !== b.bestPoints) return b.bestPoints - a.bestPoints;
        return a.fullName.localeCompare(b.fullName);
      });
      setMembers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
      console.warn('[useMemberRoster]', err);
    } finally {
      setLoading(false);
    }
  }, [poolId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh the roster whenever the screen regains focus — so a member
  // removed (or added) via the member-detail sub-route is reflected the
  // moment we navigate back, instead of waiting for the user to leave the
  // pool detail entirely. Skips the initial focus because the `load`
  // useEffect above already fetched.
  const loadRef = useRef(load);
  loadRef.current = load;
  const initialFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (initialFocus.current) {
        initialFocus.current = false;
        return;
      }
      void loadRef.current();
    }, []),
  );

  // Live updates: subscribe to INSERT/DELETE/UPDATE on pool_members for
  // this pool. Covers the "someone else just joined while I'm sitting on
  // the Members tab" case and keeps multiple admins consistent without a
  // pull-to-refresh.
  useEffect(() => {
    if (!poolId) return;
    const channelName = `pool-members-${poolId}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pool_members', filter: `pool_id=eq.${poolId}` },
        () => {
          void loadRef.current();
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [poolId]);

  return { members, loading, error, refresh: load };
}
