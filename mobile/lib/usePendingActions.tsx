// Single source of truth for in-app notification red dots.
//
// Drives every dot indicator across the app:
//   - Bottom tab bar Pools tab (any pending across all pools)
//   - Pool list cards (per-pool unread + pending)
//   - Pool detail tab bar (per-pool-per-tab dot)
//   - In-tab specific cells (per-action_type per-pool, for Form badge cells
//     and Predictions match rows)
//
// Data source: get_user_pending_summary RPC (migration 019) which returns one
// JSON blob with every count the UI needs. We subscribe to two realtime
// channels so dots update instantly without polling:
//   1. user_pending_actions INSERT/UPDATE — when a new push lands or the
//      user (or another device of theirs) marks something complete
//   2. pool_messages INSERT — when a new banter message arrives
//      (existing watermark model; we re-fetch the summary to refresh
//      banter_by_pool counts since the RPC computes them server-side)
//
// Both channels just trigger a debounced refetch of the summary RPC rather
// than maintaining client-side delta state. Keeps the data model simple at
// the cost of one extra round-trip per realtime event — fine at alpha scale.

import * as Notifications from 'expo-notifications';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';

type PendingCell = { id: string; reference_id: string | null };

type PendingSummary = {
  banter_unread_total: number;
  // Rows where acknowledged_at IS NULL — drives the OS app icon badge,
  // bottom-tab dot, pool card dot, and pool-detail tab dots.
  pending_total: number;
  // Keys are pool_id strings.
  banter_by_pool: Record<string, number>;
  // Keys are pool_id strings; values are { action_type: count of
  // unacknowledged }. Drives the hierarchical dots.
  pending_by_pool_type: Record<string, Record<string, number>>;
  // Keys are pool_id strings; values are { action_type: PendingCell[] }
  // where each cell's `completed_at` is still NULL. Drives the per-cell
  // red dots inside Form tab badge grid / Predictions tab match rows.
  // The id is what mark_action_complete takes when the user taps the
  // specific cell.
  cells_by_pool_type: Record<string, Record<string, PendingCell[]>>;
};

const EMPTY_SUMMARY: PendingSummary = {
  banter_unread_total: 0,
  pending_total: 0,
  banter_by_pool: {},
  pending_by_pool_type: {},
  cells_by_pool_type: {},
};

export type PendingActionType = 'badge_unlock' | 'level_up' | 'deadline_warning';

type PendingActionsValue = {
  /** Total across all pools / types (banter unread + unacknowledged actions). Used for the bottom-tab dot + OS app icon badge. */
  totalIndicator: number;
  /** Whether any pool has either unread banter or unacknowledged actions. Convenience boolean for tab dots. */
  hasAny: boolean;
  /** Pool ID → does this pool have any unread/unacknowledged? Used for pool card dots. */
  poolHasAny: (poolId: string) => boolean;
  /** Pool ID + action type → is there an unacknowledged row of this type for this pool? Used for per-tab dots inside pool detail. */
  poolHasPending: (poolId: string, actionType: PendingActionType) => boolean;
  /** Pool ID → unread banter count for that pool. Used by the banter FAB existing badge. */
  poolBanterUnread: (poolId: string) => number;
  /**
   * Pool ID → total unacknowledged pending actions for that pool (summed
   * across all action_types). Excludes banter unread — combine with
   * `poolBanterUnread(poolId)` for a full "things to do" count.
   */
  poolPendingCount: (poolId: string) => number;
  /**
   * For a given (pool_id, action_type, reference_id), returns the pending
   * action id whose `completed_at` is still NULL — i.e. the cell still has a
   * red dot. Returns null if there's no pending cell for that reference.
   * Used by Form tab badge cells / Predictions tab match rows to decide
   * whether to render a per-cell dot AND to know what id to pass to
   * `markActionComplete` on tap.
   */
  cellPendingId: (
    poolId: string,
    actionType: PendingActionType,
    referenceId: string,
  ) => string | null;
  /** Mark all unacknowledged actions of a given type within a pool. Called on tab open — clears hierarchical dots but leaves per-cell dots alone. */
  markPoolActionsAcknowledged: (poolId: string, actionType: PendingActionType) => Promise<void>;
  /** Mark a single action complete by id (sets both completed_at and acknowledged_at). Called on specific-cell tap. */
  markActionComplete: (actionId: string) => Promise<void>;
  /** Force a refetch of the summary. Mostly used internally; exposed for edge cases. */
  refresh: () => Promise<void>;
};

const PendingActionsContext = createContext<PendingActionsValue | null>(null);

export function PendingActionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const [summary, setSummary] = useState<PendingSummary>(EMPTY_SUMMARY);

  // Resolve the public.users.user_id (different from auth.users.id) so we can
  // call the RPCs with the right key. One small query per auth-state change.
  useEffect(() => {
    if (!user) {
      setAppUserId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('users')
        .select('user_id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setAppUserId((data as { user_id?: string } | null)?.user_id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Ref so realtime callbacks always read the latest summary without
  // re-subscribing on every render.
  const summaryRef = useRef(summary);
  summaryRef.current = summary;

  // Debounced refetch so a burst of realtime events doesn't hammer the RPC.
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchInFlightRef = useRef(false);

  const fetchSummary = useCallback(async (): Promise<PendingSummary | null> => {
    if (!appUserId) return null;
    const { data, error } = await supabase.rpc('get_user_pending_summary', {
      p_user_id: appUserId,
    });
    if (error || !data) return null;
    return data as PendingSummary;
  }, [appUserId]);

  const applySummary = useCallback((next: PendingSummary) => {
    setSummary(next);
    // Sync the OS app icon badge. Server count == unread messages + pending
    // actions, which mirrors the get_user_badge_count RPC. We could call
    // get_user_badge_count separately but the summary already gives us both
    // numbers — saves a round-trip.
    const badge = next.banter_unread_total + next.pending_total;
    void Notifications.setBadgeCountAsync(badge).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    const fresh = await fetchSummary();
    if (fresh) applySummary(fresh);
  }, [fetchSummary, applySummary]);

  // Debounced realtime refetch — coalesces bursts (e.g., multiple inserts
  // arriving back-to-back) into a single round-trip.
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(async () => {
      refetchTimerRef.current = null;
      if (refetchInFlightRef.current) {
        // If a refetch is already running, schedule another shortly after.
        // Cheap protection against missing the latest delta.
        refetchTimerRef.current = setTimeout(scheduleRefetch, 200);
        return;
      }
      refetchInFlightRef.current = true;
      try {
        const fresh = await fetchSummary();
        if (fresh) applySummary(fresh);
      } finally {
        refetchInFlightRef.current = false;
      }
    }, 150);
  }, [fetchSummary, applySummary]);

  // Initial fetch on auth ready.
  useEffect(() => {
    if (!appUserId) {
      setSummary(EMPTY_SUMMARY);
      return;
    }
    void refresh();
  }, [appUserId, refresh]);

  // Realtime subscription on user_pending_actions for this user.
  useEffect(() => {
    if (!user || !appUserId) return;
    const channel = supabase
      .channel(`pending-actions-${appUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_pending_actions',
          filter: `user_id=eq.${appUserId}`,
        },
        () => {
          scheduleRefetch();
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [user, appUserId, scheduleRefetch]);

  // Realtime subscription on pool_messages for pools the user is in. We can't
  // filter the channel directly by membership, so we listen to all inserts
  // and let the server-side RPC re-aggregate. Cheap — the summary RPC is
  // indexed and runs in single-digit ms for typical user pool counts.
  useEffect(() => {
    if (!user || !appUserId) return;
    const channel = supabase
      .channel(`pending-actions-banter-${appUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pool_messages' },
        (payload) => {
          const row = payload.new as { user_id?: string } | null;
          // Skip self-authored messages — they don't increment your own unread.
          if (row?.user_id === appUserId) return;
          scheduleRefetch();
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [user, appUserId, scheduleRefetch]);

  // Realtime subscription on the user's own pool_members rows. We need this
  // because `markAsRead` (called from BanterSheet/banter.tsx) updates
  // last_read_at without inserting any new rows — so the pool_messages
  // INSERT channel above never fires. Without this, banter dots inside the
  // app wouldn't clear until the next push arrived or the next app
  // foreground refresh. Filter pushdown keeps the channel scoped to this
  // user's rows only.
  useEffect(() => {
    if (!user || !appUserId) return;
    const channel = supabase
      .channel(`pending-actions-member-${appUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pool_members',
          filter: `user_id=eq.${appUserId}`,
        },
        () => {
          scheduleRefetch();
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [user, appUserId, scheduleRefetch]);

  // ---- Mutations ----

  const markPoolActionsAcknowledged = useCallback(
    async (poolId: string, actionType: PendingActionType) => {
      if (!appUserId) return;
      // Optimistic: clear the hierarchical entries locally so the dots in
      // the bottom tab / pool card / pool-detail tab bar disappear
      // immediately. Per-cell dots (driven by cells_by_pool_type which
      // reflects `completed_at IS NULL`) are NOT cleared here — they
      // persist until the user taps the specific cell. Realtime UPDATE
      // event will reconcile any drift between optimistic + server state.
      setSummary((prev) => {
        const next = {
          ...prev,
          pending_by_pool_type: { ...prev.pending_by_pool_type },
        };
        const poolMap = next.pending_by_pool_type[poolId];
        if (poolMap && poolMap[actionType]) {
          const cleared = poolMap[actionType];
          const updated = { ...poolMap };
          delete updated[actionType];
          if (Object.keys(updated).length === 0) {
            const map = { ...next.pending_by_pool_type };
            delete map[poolId];
            next.pending_by_pool_type = map;
          } else {
            next.pending_by_pool_type[poolId] = updated;
          }
          next.pending_total = Math.max(0, next.pending_total - cleared);
        }
        return next;
      });
      try {
        const { error } = await supabase.rpc('mark_pool_actions_acknowledged', {
          p_user_id: appUserId,
          p_pool_id: poolId,
          p_action_type: actionType,
        });
        if (error) {
          // Rollback by refetching truth.
          await refresh();
        }
      } catch {
        await refresh();
      }
    },
    [appUserId, refresh],
  );

  const markActionComplete = useCallback(
    async (actionId: string) => {
      if (!appUserId) return;
      // No simple optimistic update — we don't track individual action IDs
      // in the summary shape. Just call the RPC; realtime UPDATE event will
      // refresh the dots within a couple hundred ms.
      try {
        await supabase.rpc('mark_action_complete', {
          p_user_id: appUserId,
          p_action_id: actionId,
        });
      } catch (err) {
        console.warn('[usePendingActions] markActionComplete failed', err);
      }
    },
    [appUserId],
  );

  // ---- Selectors ----

  const totalIndicator = summary.banter_unread_total + summary.pending_total;
  const hasAny = totalIndicator > 0;

  const poolHasAny = useCallback(
    (poolId: string) => {
      const unread = summary.banter_by_pool[poolId] ?? 0;
      const types = summary.pending_by_pool_type[poolId];
      const pending = types ? Object.values(types).reduce((a, b) => a + b, 0) : 0;
      return unread + pending > 0;
    },
    [summary],
  );

  const poolHasPending = useCallback(
    (poolId: string, actionType: PendingActionType) => {
      const types = summary.pending_by_pool_type[poolId];
      return !!types && (types[actionType] ?? 0) > 0;
    },
    [summary],
  );

  const poolBanterUnread = useCallback(
    (poolId: string) => summary.banter_by_pool[poolId] ?? 0,
    [summary],
  );

  const poolPendingCount = useCallback(
    (poolId: string) => {
      const types = summary.pending_by_pool_type[poolId];
      if (!types) return 0;
      return Object.values(types).reduce((sum, n) => sum + n, 0);
    },
    [summary],
  );

  const cellPendingId = useCallback(
    (poolId: string, actionType: PendingActionType, referenceId: string) => {
      const poolMap = summary.cells_by_pool_type[poolId];
      if (!poolMap) return null;
      const cells = poolMap[actionType];
      if (!cells) return null;
      const match = cells.find((c) => c.reference_id === referenceId);
      return match?.id ?? null;
    },
    [summary],
  );

  const value = useMemo<PendingActionsValue>(
    () => ({
      totalIndicator,
      hasAny,
      poolHasAny,
      poolHasPending,
      poolBanterUnread,
      poolPendingCount,
      cellPendingId,
      markPoolActionsAcknowledged,
      markActionComplete,
      refresh,
    }),
    [
      totalIndicator,
      hasAny,
      poolHasAny,
      poolHasPending,
      poolBanterUnread,
      poolPendingCount,
      cellPendingId,
      markPoolActionsAcknowledged,
      markActionComplete,
      refresh,
    ],
  );

  return (
    <PendingActionsContext.Provider value={value}>{children}</PendingActionsContext.Provider>
  );
}

/**
 * Read the pending-actions context. Throws if used outside the provider.
 * For optional usage (where the provider may not be mounted yet), use
 * `usePendingActionsOptional`.
 */
export function usePendingActions(): PendingActionsValue {
  const ctx = useContext(PendingActionsContext);
  if (!ctx) {
    throw new Error('usePendingActions must be used within PendingActionsProvider');
  }
  return ctx;
}

/**
 * Non-throwing version. Returns null if used outside the provider — useful
 * for low-level components (e.g., navigation primitives) that may render
 * before auth is ready.
 */
export function usePendingActionsOptional(): PendingActionsValue | null {
  return useContext(PendingActionsContext);
}
