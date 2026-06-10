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

// Heartbeat-based presence publisher.
//
// Mirrors the web PresenceProvider (components/presence/
// PresenceProvider.tsx): while the app is foregrounded, upsert our
// own `user_presence` row every HEARTBEAT_MS; on background, write
// is_active=false for instant offline. Viewers (the web Banter UIs)
// read the table by polling — there is no websocket state anywhere in
// online-status tracking, which is the whole point: the previous
// channel-based system kept breaking on suspended/zombie sockets.
//
// last_seen_at staleness (60s on the reader side) covers dirty deaths
// — force-quit, crash, network drop — where the background beat never
// ran.
//
// Publisher-only: nothing on mobile renders presence yet.

const HEARTBEAT_MS = 25_000;

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

  const userIdRef = useRef<string | null>(appUserId);
  userIdRef.current = appUserId;
  const activePoolRef = useRef<string | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendBeat = useCallback((isActive: boolean) => {
    const userId = userIdRef.current;
    if (!userId) return;
    void supabase
      .from('user_presence')
      .upsert({
        user_id: userId,
        last_seen_at: new Date().toISOString(),
        active_pool_id: activePoolRef.current,
        is_active: isActive,
        platform: 'mobile',
      })
      .then(({ error }) => {
        // Non-fatal: a dropped beat is superseded by the next one.
        if (error) console.warn('[presence] heartbeat failed:', error.message);
      });
  }, []);

  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    sendBeat(true);
    heartbeatTimerRef.current = setInterval(() => sendBeat(true), HEARTBEAT_MS);
  }, [sendBeat]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  // Start once the signed-in user is known; stop on sign-out/unmount.
  useEffect(() => {
    if (!appUserId) return;
    if (AppState.currentState === 'active') startHeartbeat();
    return stopHeartbeat;
  }, [appUserId, startHeartbeat, stopHeartbeat]);

  // Foreground = beating; background = one final offline beat. The
  // interval would freeze in the background anyway (iOS suspends JS),
  // but stopping it explicitly keeps the lifecycle legible, and the
  // offline beat runs during the brief transition window the OS allows.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (userIdRef.current) startHeartbeat();
      } else {
        stopHeartbeat();
        sendBeat(false);
      }
    });
    return () => sub.remove();
  }, [startHeartbeat, stopHeartbeat, sendBeat]);

  const setActivePool = useCallback(
    (poolId: string) => {
      if (activePoolRef.current === poolId) return;
      activePoolRef.current = poolId;
      // Immediate beat so the green/amber distinction follows
      // navigation without waiting for the next interval tick.
      if (AppState.currentState === 'active') sendBeat(true);
    },
    [sendBeat],
  );

  const clearActivePool = useCallback(
    (poolId: string) => {
      if (activePoolRef.current !== poolId) return;
      activePoolRef.current = null;
      if (AppState.currentState === 'active') sendBeat(true);
    },
    [sendBeat],
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
 * detail screen.
 *
 * Mount-based set + conditional clear: pool-scoped modals (member
 * detail, breakdown, scoring) blur this screen but keep it mounted, so
 * "in this pool" survives them. The focus-based re-set covers popping
 * back from another pool's screens — on pop, this screen refocuses
 * (re-set runs) BEFORE the popped screen's unmount cleanup, whose
 * conditional clear then no-ops.
 */
export function useReportActivePool(poolId: string | undefined) {
  const { setActivePool, clearActivePool } = usePresencePublisher();

  useEffect(() => {
    if (!poolId) return;
    setActivePool(poolId);
    return () => clearActivePool(poolId);
  }, [poolId, setActivePool, clearActivePool]);

  useFocusEffect(
    useCallback(() => {
      if (poolId) setActivePool(poolId);
    }, [poolId, setActivePool]),
  );
}
