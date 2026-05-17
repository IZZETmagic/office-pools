import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

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
  // Refs so the realtime handler always reads the latest closures without
  // re-subscribing the channel on every render.
  const bumpRef = useRef(value.bumpPoolUnread);
  bumpRef.current = value.bumpPoolUnread;
  const appUserIdRef = useRef(value.data?.appUserId ?? null);
  appUserIdRef.current = value.data?.appUserId ?? null;

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

  return <HomeDataContext.Provider value={value}>{children}</HomeDataContext.Provider>;
}

export function useHomeData(): HomeDataValue {
  const ctx = useContext(HomeDataContext);
  if (!ctx) {
    throw new Error('useHomeData must be used inside a HomeDataProvider');
  }
  return ctx;
}
