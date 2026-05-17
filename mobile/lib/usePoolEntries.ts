import { useCallback, useEffect, useState } from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';

export type PoolEntry = {
  entryId: string;
  entryName: string;
  entryNumber: number;
  hasSubmittedPredictions: boolean;
  totalPoints: number;
  predictionsSubmittedAt: string | null;
};

export function usePoolEntries(poolId: string | undefined) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<PoolEntry[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('Entry');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!poolId || !user) return;
    setLoading(true);
    setError(null);
    try {
      const { data: userData, error: userErr } = await supabase
        .from('users')
        .select('user_id, username')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (userErr || !userData) throw userErr ?? new Error('User not found');
      const userId = (userData as { user_id: string; username: string }).user_id;
      setUsername((userData as { user_id: string; username: string }).username ?? 'Entry');

      const { data: memberRow, error: memberErr } = await supabase
        .from('pool_members')
        .select('member_id')
        .eq('pool_id', poolId)
        .eq('user_id', userId)
        .maybeSingle();
      if (memberErr) throw memberErr;
      if (!memberRow) {
        setMemberId(null);
        setEntries([]);
        setLoading(false);
        return;
      }
      const mId = (memberRow as { member_id: string }).member_id;
      setMemberId(mId);

      const { data: entryRows, error: entryErr } = await supabase
        .from('pool_entries')
        .select(
          'entry_id, entry_name, entry_number, has_submitted_predictions, total_points, predictions_submitted_at',
        )
        .eq('member_id', mId)
        .order('entry_number', { ascending: true });
      if (entryErr) throw entryErr;

      setEntries(
        ((entryRows ?? []) as Array<{
          entry_id: string;
          entry_name: string;
          entry_number: number;
          has_submitted_predictions: boolean;
          total_points: number | null;
          predictions_submitted_at: string | null;
        }>).map((r) => ({
          entryId: r.entry_id,
          entryName: r.entry_name,
          entryNumber: r.entry_number,
          hasSubmittedPredictions: r.has_submitted_predictions,
          totalPoints: r.total_points ?? 0,
          predictionsSubmittedAt: r.predictions_submitted_at,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entries');
      console.warn('[usePoolEntries]', err);
    } finally {
      setLoading(false);
    }
  }, [poolId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addEntry(name: string) {
    if (!memberId) return { error: 'No membership' };
    try {
      const nextNumber = entries.length > 0 ? Math.max(...entries.map((e) => e.entryNumber)) + 1 : 1;
      const trimmed = name.trim() || `${username} ${nextNumber}`;
      const { error: insertErr } = await supabase
        .from('pool_entries')
        .insert({ member_id: memberId, entry_name: trimmed, entry_number: nextNumber });
      if (insertErr) throw insertErr;
      await load();
      return {};
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to add entry' };
    }
  }

  return { entries, loading, error, refresh: load, addEntry, username };
}
