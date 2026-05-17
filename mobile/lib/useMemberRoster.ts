import { useCallback, useEffect, useState } from 'react';

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

  return { members, loading, error, refresh: load };
}
