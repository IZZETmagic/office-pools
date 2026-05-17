// Push notification lifecycle:
//  - Foreground behavior (Phase 6): when a push arrives while the app is open,
//    show a banner + sound + badge so the user actually sees it. iOS otherwise
//    suppresses foreground pushes by default.
//  - Tap-to-navigate (Phase 7): when the user taps a push (warm or cold start),
//    route to the relevant screen based on the `data.type` field set by the
//    server. Current types:
//      type=community + pool_id → /pool/[id]/banter
//    Future types (added as more push fan-out lands) can be slotted into the
//    `routeFor` switch below without touching any other call sites.

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

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
      return { pathname: '/pool/[id]/banter', params: { id: poolId } };
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
}
