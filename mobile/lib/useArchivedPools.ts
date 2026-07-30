// Archived pools (migration 040), shared by the settings hub (for the count on
// the nav row) and the archived-pools page itself.
//
// Must stay in step with the web version (app/profile/ProfilePage.tsx →
// ArchivedPoolsTab): two surfaces deriving the same thing differently is how
// they came to disagree about levels.

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type ArchivedPoolRow = {
  poolId: string;
  poolName: string;
  archivedAt: string;
  role: string;
  archivedByName: string | null;
};

export function useArchivedPools() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ArchivedPoolRow[] | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: userRow } = await supabase
      .from('users')
      .select('user_id')
      .eq('auth_user_id', user.id)
      .single();
    const appUserId = (userRow as { user_id: string } | null)?.user_id;
    if (!appUserId) {
      setRows([]);
      return;
    }

    // `!inner` + `.not(...)` so the filter applies to the outer rows; a
    // left-join would return every membership with a null pool.
    const { data } = await supabase
      .from('pool_members')
      .select('role, pool:pools!inner(pool_id, pool_name, archived_at, archived_by)')
      .eq('user_id', appUserId)
      .not('pool.archived_at', 'is', null);

    type EmbeddedPool = {
      pool_id: string;
      pool_name: string;
      archived_at: string;
      archived_by: string | null;
    };
    type MembershipRow = { role: string; pool: EmbeddedPool | EmbeddedPool[] };

    const list = ((data ?? []) as unknown as MembershipRow[]).map((r) => {
      const p = Array.isArray(r.pool) ? r.pool[0] : r.pool;
      return {
        poolId: p.pool_id,
        poolName: p.pool_name,
        archivedAt: p.archived_at,
        role: r.role,
        archivedBy: p.archived_by,
      };
    });

    // One query for the archivers' names rather than one per row.
    const actorIds = [
      ...new Set(list.map((l) => l.archivedBy).filter((v): v is string => Boolean(v))),
    ];
    const names = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('user_id, username, full_name')
        .in('user_id', actorIds);
      for (const u of (users ?? []) as {
        user_id: string;
        username: string | null;
        full_name: string | null;
      }[]) {
        names.set(u.user_id, u.full_name || u.username || 'an admin');
      }
    }

    setRows(
      list
        .map((l) => ({
          poolId: l.poolId,
          poolName: l.poolName,
          archivedAt: l.archivedAt,
          role: l.role,
          archivedByName: l.archivedBy ? (names.get(l.archivedBy) ?? null) : null,
        }))
        .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)),
    );
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading: rows === null, reload: load };
}
