import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

export type MemberDetail = {
  memberId: string;
  userId: string;
  fullName: string;
  username: string;
  role: string;
  isAdmin: boolean;
  joinedAt: string;
  entries: MemberEntry[];
};

export type MemberEntry = {
  entryId: string;
  entryName: string;
  entryNumber: number;
  hasSubmittedPredictions: boolean;
  predictionsSubmittedAt: string | null;
  totalPoints: number;
  pointAdjustment: number;
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
  pool_entries: Array<{
    entry_id: string;
    entry_name: string | null;
    entry_number: number;
    has_submitted_predictions: boolean;
    predictions_submitted_at: string | null;
    total_points: number | null;
    scored_total_points: number | null;
    point_adjustment: number | null;
  }> | null;
};

export function useMemberDetail(memberId: string | undefined) {
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('pool_members')
        .select(
          'member_id, user_id, role, joined_at, users:user_id(full_name, username), pool_entries(entry_id, entry_name, entry_number, has_submitted_predictions, predictions_submitted_at, total_points, scored_total_points, point_adjustment)',
        )
        .eq('member_id', memberId)
        .maybeSingle();
      if (err) throw err;
      if (!data) {
        setMember(null);
        return;
      }
      const row = data as DbRow;
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      const entries: MemberEntry[] = (row.pool_entries ?? [])
        .map((e) => {
          // `scored_total_points` is the column the scoring engine writes the
          // fully-adjusted total to (match + bonus + point_adjustment).
          // Fall back to total_points + point_adjustment for older rows that
          // pre-date the scored_total_points column.
          const adjustment = e.point_adjustment ?? 0;
          const adjustedTotal =
            e.scored_total_points ?? (e.total_points ?? 0) + adjustment;
          return {
            entryId: e.entry_id,
            entryName: e.entry_name ?? `Entry ${e.entry_number}`,
            entryNumber: e.entry_number,
            hasSubmittedPredictions: e.has_submitted_predictions,
            predictionsSubmittedAt: e.predictions_submitted_at,
            totalPoints: adjustedTotal,
            pointAdjustment: adjustment,
          };
        })
        .sort((a, b) => a.entryNumber - b.entryNumber);
      setMember({
        memberId: row.member_id,
        userId: row.user_id,
        fullName: user?.full_name ?? 'Member',
        username: user?.username ?? '',
        role: row.role,
        isAdmin: row.role === 'admin',
        joinedAt: row.joined_at,
        entries,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load member');
      console.warn('[useMemberDetail]', err);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { member, loading, error, refresh: load };
}
