import { useFocusEffect } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useHomeData } from './HomeDataProvider';
import { supabase } from './supabase';

import type { RealtimeChannel } from '@supabase/supabase-js';

// App-wide presence publisher. Joins the same `pool-presence-{poolId}`
// channels the web app reads (Banter online strip / desktop sidebar) for
// every pool the user belongs to, so mobile users show as online while
// the app is foregrounded — not just never, which is what happened
// before this existed.
//
// Publisher-only for now: nothing on mobile renders presence yet, so
// this provider tracks but doesn't expose an online list. The payload
// shape MUST stay in sync with the web PresenceProvider
// (components/presence/PresenceProvider.tsx): { user_id, username,
// full_name, online_at, is_typing, active_pool_id }.
//
// Lifecycle: AppState. active → join + track; background/inactive →
// untrack (web users see the member drop offline within seconds rather
// than waiting for the suspended socket to time out). On return to
// foreground we re-track explicitly — supabase-js rejoins channels after
// a reconnect, but re-tracking covers both the rejoin and plain
// JS-paused cases without guessing which one happened.
//
// active_pool_id: the pool/[id] screen reports itself via
// setActivePool/clearActivePool so web viewers can distinguish "in this
// pool right now" (green) from "in the app elsewhere" (amber).
// clearActivePool is conditional on the pool still being current —
// when popping pool B back to pool A, A re-reports on focus before B's
// unmount cleanup runs, and B must not clobber A's value.

type PresenceContextValue = {
  setActivePool: (poolId: string) => void;
  clearActivePool: (poolId: string) => void;
};

const PresenceContext = createContext<PresenceContextValue>({
  setActivePool: () => {},
  clearActivePool: () => {},
});

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { data } = useHomeData();

  const appUserId = data?.appUserId ?? null;
  const username = data?.username ?? '';
  const fullName = data?.fullName ?? '';
  const poolIds = useMemo(
    () => (data?.pools ?? []).map((p) => p.poolId),
    [data?.pools],
  );

  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const activePoolRef = useRef<string | null>(null);
  const identityRef = useRef({ appUserId, username, fullName });
  identityRef.current = { appUserId, username, fullName };

  const buildPayload = useCallback(() => {
    const id = identityRef.current;
    if (!id.appUserId) return null;
    return {
      user_id: id.appUserId,
      username: id.username,
      full_name: id.fullName,
      online_at: new Date().toISOString(),
      is_typing: false,
      active_pool_id: activePoolRef.current,
    };
  }, []);

  const trackAll = useCallback(() => {
    if (AppState.currentState !== 'active') return;
    const payload = buildPayload();
    if (!payload) return;
    for (const channel of channelsRef.current.values()) {
      void channel.track(payload);
    }
  }, [buildPayload]);

  const untrackAll = useCallback(() => {
    for (const channel of channelsRef.current.values()) {
      void channel.untrack();
    }
  }, []);

  // ---- Channels: one per pool membership ----
  const poolIdsKey = poolIds.join(',');
  useEffect(() => {
    if (!appUserId || poolIds.length === 0) return;
    const channels = channelsRef.current;

    for (const poolId of poolIds) {
      if (channels.has(poolId)) continue;

      const channel = supabase.channel(`pool-presence-${poolId}`, {
        config: { presence: { key: appUserId } },
      });

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' && AppState.currentState === 'active') {
          const payload = buildPayload();
          if (payload) void channel.track(payload);
        }
      });

      channels.set(poolId, channel);
    }

    // Drop channels for pools we're no longer in (left / removed).
    for (const [poolId, channel] of channels) {
      if (!poolIds.includes(poolId)) {
        void supabase.removeChannel(channel);
        channels.delete(poolId);
      }
    }

    return () => {
      for (const channel of channels.values()) {
        void supabase.removeChannel(channel);
      }
      channels.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUserId, poolIdsKey, buildPayload]);

  // ---- AppState: foreground = online, background = offline ----
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        trackAll();
      } else {
        untrackAll();
      }
    });
    return () => sub.remove();
  }, [trackAll, untrackAll]);

  const setActivePool = useCallback(
    (poolId: string) => {
      if (activePoolRef.current === poolId) return;
      activePoolRef.current = poolId;
      trackAll();
    },
    [trackAll],
  );

  const clearActivePool = useCallback(
    (poolId: string) => {
      if (activePoolRef.current !== poolId) return;
      activePoolRef.current = null;
      trackAll();
    },
    [trackAll],
  );

  const value = useMemo(
    () => ({ setActivePool, clearActivePool }),
    [setActivePool, clearActivePool],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresencePublisher(): PresenceContextValue {
  return useContext(PresenceContext);
}

/**
 * Report the pool the user is currently viewing. Call from the pool
 * detail screen. Mount-based set + focus-based re-set, conditional
 * clear on unmount — see the provider header comment for why.
 */
export function useReportActivePool(poolId: string | undefined) {
  const { setActivePool, clearActivePool } = usePresencePublisher();

  // Mount-based set + conditional clear. Pool-scoped modals (member
  // detail, breakdown, scoring) blur this screen but keep it mounted,
  // so "in this pool" survives them.
  useEffect(() => {
    if (!poolId) return;
    setActivePool(poolId);
    return () => clearActivePool(poolId);
  }, [poolId, setActivePool, clearActivePool]);

  // Focus-based re-set covers popping back from another pool's screens:
  // on pop, this screen refocuses (re-set runs) BEFORE the popped
  // screen's unmount cleanup (whose conditional clear then no-ops).
  useFocusEffect(
    useCallback(() => {
      if (poolId) setActivePool(poolId);
    }, [poolId, setActivePool]),
  );
}
