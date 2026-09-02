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

  // ⚠ BROADCAST, NOT `postgres_changes` — changed 2026-09-02, and the reason is
  // measured rather than stylistic.
  //
  // This used to subscribe to `pool_entries` changes filtered to the viewer's
  // own `member_id`. The filter was doing less than it looked: PostgREST
  // decodes the WAL for EVERY write to a replicated table and evaluates RLS
  // per subscriber, then applies the filter — so the cost is paid whether or
  // not a row matches. And `pool_entries` is written by the scoring path:
  //
  //   pool_entries   1,885,651 writes   32.9% of ALL replicated writes
  //
  // second only to presence, and the single largest thing mobile was keeping in
  // the publication. Supabase's own guidance is unambiguous — Broadcast is "the
  // recommended method for scalability and security"; `postgres_changes` "does
  // not scale as well".
  //
  // ## What replaces each of the three things the old subscription did
  //
  //   (c) points from a recalculation → the `pool:{id}:leaderboard` broadcast,
  //       which already carries totals and ranks in the payload (migration 060)
  //       and which `usePoolDetail` has been reading since 2026-07-29.
  //
  //   (a) Stop Participating clearing entries, and
  //   (b) another DEVICE adding or renaming an entry
  //       → a focus refetch. Both are rare, deliberate actions, and this hook
  //       already refreshes eagerly after the viewer's own mutations — so the
  //       only case that changes is *another* device, which now updates when
  //       the screen is focused rather than within the second.
  //
  // ⚠ THAT IS A REAL BEHAVIOUR CHANGE and it is the whole trade: a second-device
  // entry rename is no longer instant. It buys a third of the realtime bill.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!poolId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // ⚠ `private: true` + `setAuth()` first. Without the JWT the channel's
    // authorization policy never passes and no events arrive — SILENTLY. Same
    // shape as `usePoolDetail`, and the reason that comment exists there.
    const channel = supabase
      .channel(`pool:${poolId}:leaderboard`, { config: { private: true } })
      .on('broadcast', { event: 'leaderboard_update' }, () => {
        // Debounced with jitter: one goal must not make every connected client
        // refetch in the same second. The payload carries the leaderboard, not
        // this hook's shape, so a refetch is still the honest way to get it.
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (active) void loadRef.current('refresh');
        }, 1500 + Math.random() * 4000);
      });

    void Promise.resolve(supabase.realtime.setAuth()).then(() => {
      if (active) channel.subscribe();
    });

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      void channel.unsubscribe();
    };
  }, [poolId]);

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
