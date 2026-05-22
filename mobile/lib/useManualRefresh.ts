// Decouples the iOS / Android pull-to-refresh spinner from background data
// refreshes.
//
// Problem: every screen previously bound `<RefreshControl refreshing={…}>` to
// whatever boolean its data hook exposed (HomeData.refreshing,
// useEntryAnalytics.refreshing, etc.). Those booleans flip true for ANY
// fetch the data layer triggers — initial load, focus-refresh, realtime
// reconciliation, etc. — so the OS-level pull-to-refresh circle would flash
// every time anything reloaded, even though the user never touched the
// screen. Ugly on iOS where the circle is especially prominent.
//
// Fix: keep a local boolean that ONLY flips true when the RefreshControl's
// `onRefresh` callback fires — which the OS only invokes on a real user pull
// gesture. Background refreshes still happen via the underlying data hook;
// they just don't render the spinner.
//
// Usage:
//
//   const { data, refresh } = useSomeData();
//   const { refreshing, onRefresh } = useManualRefresh(refresh);
//
//   <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />

import { useCallback, useRef, useState } from 'react';

type RefreshFn = () => Promise<unknown> | unknown;

export function useManualRefresh(refresh: RefreshFn): {
  refreshing: boolean;
  onRefresh: () => Promise<void>;
} {
  const [refreshing, setRefreshing] = useState(false);
  // Latest refresh fn in a ref so the returned onRefresh identity stays
  // stable across renders — useful for screens that pass it through to
  // memoized RefreshControl props.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.resolve(refreshRef.current());
    } finally {
      setRefreshing(false);
    }
  }, []);

  return { refreshing, onRefresh };
}
