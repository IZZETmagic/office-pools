import { useCallback, useEffect, useRef, useState } from 'react';

import { deleteEntry as deleteEntryAPI } from './api';
import { useAuth } from './auth';
import { supabase } from './supabase';

export type PoolEntry = {
  entryId: string;
  entryName: string;
  entryNumber: number;
  hasSubmittedPredictions: boolean;
  totalPoints: number;
  predictionsSubmittedAt: string | null;
  /** Mirrors pool_entries.fee_paid. Drives the per-entry Paid / Unpaid
   *  badge in PoolInfoTab's Fees & Prize Pool card. */
  feePaid: boolean;
};

export function usePoolEntries(poolId: string | undefined) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<PoolEntry[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('Entry');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!poolId || !user) return;
    // Only flash the full-screen spinner on the first fetch.
    // Realtime-triggered and add-entry follow-up reloads keep the
    // existing UI mounted so the tab doesn't blink to a loader on
    // every INSERT/DELETE — same pattern usePoolDetail uses.
    if (mode === 'initial') setLoading(true);
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
          'entry_id, entry_name, entry_number, has_submitted_predictions, scored_total_points, predictions_submitted_at, fee_paid',
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
          scored_total_points: number | null;
          predictions_submitted_at: string | null;
          fee_paid: boolean | null;
        }>).map((r) => ({
          entryId: r.entry_id,
          entryName: r.entry_name,
          entryNumber: r.entry_number,
          hasSubmittedPredictions: r.has_submitted_predictions,
          totalPoints: r.scored_total_points ?? 0,
          predictionsSubmittedAt: r.predictions_submitted_at,
          feePaid: !!r.fee_paid,
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
    void load('initial');
  }, [load]);

  // Live updates: subscribe to pool_entries changes for THIS user's
  // member_id. Covers (a) the Stop Participating flow deleting all
  // entries — the PredictionsTab empties immediately without waiting
  // for a focus re-fetch — (b) another device adding/renaming an
  // entry, and (c) points_total updates from server recalculation.
  // Filter is by member_id (most specific) rather than pool_id so we
  // don't fan out events for the whole pool's entry table. pool_entries
  // is in the supabase_realtime publication and runs at REPLICA
  // IDENTITY FULL, so the OLD row on DELETE carries member_id and the
  // filter matches.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!memberId) return;
    const channelName = `pool-entries-${memberId}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pool_entries',
          filter: `member_id=eq.${memberId}`,
        },
        () => {
          void loadRef.current('refresh');
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [memberId]);

  async function addEntry(name: string) {
    if (!memberId) return { error: 'No membership' };
    try {
      const nextNumber = entries.length > 0 ? Math.max(...entries.map((e) => e.entryNumber)) + 1 : 1;
      const trimmed = name.trim() || `${username} ${nextNumber}`;
      const { error: insertErr } = await supabase
        .from('pool_entries')
        .insert({ member_id: memberId, entry_name: trimmed, entry_number: nextNumber });
      if (insertErr) throw insertErr;
      // Eager refresh so the new entry shows immediately if realtime
      // is slow. The realtime sub will also fire on this INSERT and
      // re-load, but both calls use 'refresh' mode so neither flashes
      // a spinner. Cost is one duplicate fetch on the happy path.
      await load('refresh');
      return {};
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to add entry' };
    }
  }

  // Client-side rename. The RLS policy `Users can update own entries`
  // (member_id IN get_user_member_ids()) lets owners write here without
  // a server endpoint. The realtime sub fires on the UPDATE and the
  // list re-renders with the new name within ~hundreds of ms.
  async function renameEntry(entryId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return { error: 'Name cannot be empty' };
    try {
      const { error: updateErr } = await supabase
        .from('pool_entries')
        .update({ entry_name: trimmed })
        .eq('entry_id', entryId);
      if (updateErr) throw updateErr;
      await load('refresh');
      return {};
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to rename entry' };
    }
  }

  // Server-routed delete. The endpoint enforces the
  // non-admin-must-keep-one-entry rule + uses the admin client to
  // bypass RLS on the cascade children (same pattern Stop Participating
  // already uses). PostgrestError-shaped responses surface their
  // server-side message string via apiFetch's throw.
  async function removeEntry(entryId: string) {
    if (!poolId) return { error: 'No pool' };
    try {
      await deleteEntryAPI(poolId, entryId);
      await load('refresh');
      return {};
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            && typeof (err as { message: unknown }).message === 'string'
            ? (err as { message: string }).message
            : 'Failed to delete entry';
      return { error: message };
    }
  }

  return { entries, loading, error, refresh: load, addEntry, renameEntry, removeEntry, username };
}
