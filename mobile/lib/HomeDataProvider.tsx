import * as Notifications from 'expo-notifications';
import { usePathname, useRouter } from 'expo-router';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Alert } from 'react-native';

import { useAuth } from './auth';
import { supabase } from './supabase';
import { useHomeDataInternal, type HomeData } from './useHomeData';

type HomeDataValue = {
  data: HomeData | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void> | void;
  refreshIfStale: () => void;
  bumpPoolUnread: (poolId: string) => void;
  clearPoolUnread: (poolId: string) => void;
};

const HomeDataContext = createContext<HomeDataValue | null>(null);

export function HomeDataProvider({ children }: { children: ReactNode }) {
  const value = useHomeDataInternal();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Refs so the realtime handler always reads the latest closures without
  // re-subscribing the channel on every render.
  const bumpRef = useRef(value.bumpPoolUnread);
  bumpRef.current = value.bumpPoolUnread;
  const appUserIdRef = useRef(value.data?.appUserId ?? null);
  appUserIdRef.current = value.data?.appUserId ?? null;
  const refreshRef = useRef(value.refresh);
  refreshRef.current = value.refresh;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const poolsRef = useRef(value.data?.pools ?? []);
  poolsRef.current = value.data?.pools ?? [];

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('home-data-banter')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pool_messages' },
        (payload) => {
          // Surgical update: bump only the affected pool's unread badge.
          // Avoids the full-dashboard refetch (and the loading flicker the
          // user was seeing on every message) that the previous handler did.
          // Live updates still arrive instantly via this channel.
          const row = payload.new as { pool_id?: string; user_id?: string } | null;
          if (!row?.pool_id) return;
          // Don't bump for messages the current user just sent themselves.
          if (row.user_id && row.user_id === appUserIdRef.current) return;
          bumpRef.current(row.pool_id);
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [user]);

  // Global "I was removed from a pool" handler. We can't use a realtime
  // DELETE subscription on pool_members here because the SELECT policies
  // on that table (`Members can view pool members`, `Users can view their
  // pool memberships`) evaluate against current membership state — after
  // the row is deleted, the just-removed user no longer matches either
  // policy, so realtime silently filters the DELETE event out before
  // delivery to them. Instead we piggy-back on the server-side push that
  // /api/notifications/member-removed already fires (ADMIN category,
  // data: { type: 'admin', pool_id }), which is delivered through APNs /
  // Expo Push regardless of RLS. The foreground notification handler
  // (usePushNotificationHandlers) keeps banners showing; here we tap into
  // the same delivery to drive in-app state — refresh the dashboard so
  // the pool card disappears, and bounce out of /pool/[id] sub-routes
  // before the user lands on a screen they no longer have access to.
  useEffect(() => {
    if (!user) return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as
        | { type?: string; pool_id?: string }
        | null
        | undefined;
      if (!data || data.type !== 'admin') return;
      const removedPoolId = typeof data.pool_id === 'string' ? data.pool_id : null;
      if (!removedPoolId) return;

      // Cache the pool name from the dashboard before the refresh evicts
      // the row, so the in-app alert can reference it.
      const removedPool = poolsRef.current.find((p) => p.poolId === removedPoolId);
      const poolName = removedPool?.poolName ?? 'a pool';

      // Refresh home data — card disappears from the home + pools tabs as
      // soon as the new dashboard payload lands.
      void Promise.resolve(refreshRef.current());

      // If the user is currently inside the now-revoked pool's routes
      // (leaderboard, settings, banter, member detail, scoring config,
      // entry sheet, etc.), pop them back to the tabs root before they
      // can interact with a screen that will start returning RLS-empty
      // payloads.
      const path = pathnameRef.current ?? '';
      const inRemovedPool = path === `/pool/${removedPoolId}`
        || path.startsWith(`/pool/${removedPoolId}/`);
      if (inRemovedPool) {
        router.replace('/(tabs)');
      }

      // Always alert so the user understands why their context shifted.
      // The push banner alone may be missed if it auto-dismisses; this
      // modal alert is unmissable.
      Alert.alert(
        'Removed from pool',
        `You've been removed from ${poolName}.`,
      );
    });
    return () => {
      sub.remove();
    };
  }, [user, router]);

  return <HomeDataContext.Provider value={value}>{children}</HomeDataContext.Provider>;
}

export function useHomeData(): HomeDataValue {
  const ctx = useContext(HomeDataContext);
  if (!ctx) {
    throw new Error('useHomeData must be used inside a HomeDataProvider');
  }
  return ctx;
}
