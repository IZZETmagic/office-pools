// Push notification lifecycle:
//  - Foreground behavior (Phase 6): when a push arrives while the app is open,
//    show a banner + sound + badge so the user actually sees it. iOS otherwise
//    suppresses foreground pushes by default.
//  - Tap-to-navigate (Phase 7): when the user taps a push (warm or cold start),
//    route to the relevant screen based on the `data.type` field set by the
//    server. Current types:
//      type=community + pool_id → /pool/[id]?banter=open
//        Banter is a bottom sheet mounted on the pool detail screen; the
//        ?banter=open deep-link param signals the pool detail to open it
//        on mount. See app/pool/[id].tsx's banterDeepLinkConsumed effect.
//    Future types (added as more push fan-out lands) can be slotted into the
//    `routeFor` switch below without touching any other call sites.

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from './auth';
import { refreshIconBadge } from './badgeSync';
import { supabase } from './supabase';

// Module-scoped so we only register the handler once even if React calls the
// hook multiple times during dev refreshes.
let foregroundHandlerInstalled = false;

function installForegroundHandlerOnce() {
  if (foregroundHandlerInstalled) return;
  foregroundHandlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

type RoutableTarget = { pathname: string; params?: Record<string, string> };

function routeFor(
  data: Record<string, unknown> | null | undefined,
): RoutableTarget | null {
  if (!data) return null;
  const type = typeof data.type === 'string' ? data.type : null;
  switch (type) {
    case 'community': {
      const poolId = typeof data.pool_id === 'string' ? data.pool_id : null;
      if (!poolId) return null;
      // Route to the pool detail with ?banter=open. The pool detail
      // screen reads the param once on mount and triggers its
      // imperative BanterSheet.open() — sidesteps the now-removed
      // /pool/[id]/banter route.
      return { pathname: '/pool/[id]', params: { id: poolId, banter: 'open' } };
    }
    default:
      return null;
  }
}

function handleResponse(response: Notifications.NotificationResponse) {
  const data = response?.notification?.request?.content?.data;
  const target = routeFor(data as Record<string, unknown> | null | undefined);
  if (!target) return;
  // `router.push` with typed routes accepts the pathname + params shape directly.
  router.push({ pathname: target.pathname as never, params: target.params });
}

export function usePushNotificationHandlers() {
  const { user } = useAuth();

  // 1. Foreground display config — install once at app boot.
  useEffect(() => {
    installForegroundHandlerOnce();
  }, []);

  // 2. Cold-start tap: app was killed, user tapped the notification → app
  // opened. `getLastNotificationResponseAsync` returns the response that
  // triggered the launch (or null on normal launches).
  useEffect(() => {
    let mounted = true;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!mounted || !response) return;
      // Defer one tick so the router has its first stack mounted before push.
      setTimeout(() => handleResponse(response), 0);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // 3. Warm tap: app is foregrounded or backgrounded when the user taps the
  // notification.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, []);

  // 4. OS app icon badge sync — on app boot AND on every foreground.
  //
  // The OS persists the badge value at whatever the last APNs payload (or
  // setBadgeCountAsync call) set it to; iOS does NOT auto-decrement when
  // the user reads notifications or opens the app. So we explicitly pull
  // the true count from the server (get_user_badge_count = unread banter
  // messages + total pending actions) and apply it whenever the user
  // arrives at the app. This is a REFRESH, not a CLEAR — if the server
  // still says there are pending items, the badge correctly stays
  // positive (matches the "action-required" UX where the badge only
  // clears once the user does the thing the notification was about).
  //
  // We need the user's public users.user_id (different from auth.users.id)
  // for the RPC — resolve it once per auth session via a small query, then
  // cache in a closure. Cold-start fires on mount; warm foreground fires
  // via AppState.
  useEffect(() => {
    if (!user) return;
    let appUserId: string | null = null;
    let mounted = true;

    const fetchAndRefresh = async () => {
      if (!appUserId) {
        const { data } = await supabase
          .from('users')
          .select('user_id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (!mounted) return;
        appUserId = (data as { user_id?: string } | null)?.user_id ?? null;
      }
      if (appUserId) void refreshIconBadge(supabase, appUserId);
    };

    // Initial fire on hook mount (covers cold-start).
    void fetchAndRefresh();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void fetchAndRefresh();
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [user]);
}
