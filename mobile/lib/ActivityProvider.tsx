// Shares a single useActivity() instance across the splash gate and the
// Activity tab. Without this, the splash window would either skip Activity
// prefetch entirely, or run a second redundant fetch that the tab also
// runs on mount.

import { createContext, useContext, type ReactNode } from 'react';

import { useActivity } from './useActivity';

type ActivityValue = ReturnType<typeof useActivity>;

const ActivityContext = createContext<ActivityValue | null>(null);

export function ActivityProvider({ children }: { children: ReactNode }) {
  const value = useActivity();
  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useSharedActivity(): ActivityValue {
  const ctx = useContext(ActivityContext);
  if (!ctx) {
    throw new Error('useSharedActivity must be used inside an ActivityProvider');
  }
  return ctx;
}
