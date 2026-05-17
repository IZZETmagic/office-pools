// Watches auth + push permission state. When the user is signed in AND
// notifications are granted, fetches the device's APNs token and POSTs it
// to /api/notifications/push-token so the server can target this device.
// On sign-out, DELETEs the previously-registered token so the server stops
// pushing to a device that's no longer logged in.
//
// Designed to be mounted ONCE at the root layout — token state is module-
// scoped to avoid duplicate registrations across re-renders.

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from './api';
import { useAuth } from './auth';
import { usePushPermission } from './usePushPermission';

const BUNDLE_ID =
  Constants.expoConfig?.ios?.bundleIdentifier ?? 'com.officepools.expo';

const EAS_PROJECT_ID =
  (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;

type PlatformToken = { token: string; platform: 'ios' | 'android' };

/**
 * Get the appropriate push token for the current platform:
 *  - iOS: native APNs device token (hex string) via getDevicePushTokenAsync
 *  - Android: Expo push token (ExponentPushToken[...]) via getExpoPushTokenAsync
 *
 * Server routing reads the stored `platform` and sends iOS tokens direct to
 * APNs while Android tokens go through Expo's hosted relay (which forwards
 * to FCM). Returns null if the platform has no push setup we can use
 * (e.g. Android with missing EAS projectId).
 */
async function fetchPlatformPushToken(): Promise<PlatformToken | null> {
  if (Platform.OS === 'ios') {
    const result = await Notifications.getDevicePushTokenAsync();
    return { token: result.data, platform: 'ios' };
  }
  if (Platform.OS === 'android') {
    if (!EAS_PROJECT_ID) {
      console.warn('[push] missing EAS projectId — Android push disabled');
      return null;
    }
    const result = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    return { token: result.data, platform: 'android' };
  }
  return null;
}

/**
 * APNs gateway routing — must match the build's `aps-environment` entitlement.
 *
 * Our EAS profiles all produce builds with `aps-environment = production`:
 *   - `development` profile uses an ad-hoc provisioning profile, which Apple
 *     Developer issues with production push capability by default (we never
 *     configured a Development APNs key)
 *   - `preview` and `production` profiles → production by definition
 *
 * `__DEV__` would tell us if Metro is connected — not what the binary's
 * entitlement says — so it's the wrong signal. Hardcode 'production' and
 * the server routes to api.push.apple.com, which matches every build flavor
 * we produce today.
 *
 * If we ever set up a true Development APNs key in Apple Developer and
 * configure EAS to use a Development provisioning profile, flip this back
 * to per-build detection.
 */
const ENVIRONMENT: 'production' = 'production';

export function usePushTokenRegistration() {
  const { user } = useAuth();
  const { status } = usePushPermission();
  const lastRegisteredTokenRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  // ---- Register when authenticated + permission granted ----
  useEffect(() => {
    if (!user || status !== 'granted') return;
    if (inFlightRef.current) return;

    let cancelled = false;
    inFlightRef.current = true;
    void (async () => {
      try {
        const platformToken = await fetchPlatformPushToken();
        if (cancelled) return;
        if (!platformToken) return;
        const { token, platform } = platformToken;
        if (typeof token !== 'string' || token.length === 0) {
          console.warn('[push] empty device token, skipping registration');
          return;
        }
        if (lastRegisteredTokenRef.current === token) {
          // Same token already registered this session — no-op.
          return;
        }
        await registerPushToken({
          token,
          platform,
          // environment + bundle_id only used by APNs (iOS); harmless on
          // Android but kept consistent for any future analytics.
          environment: ENVIRONMENT,
          bundle_id: BUNDLE_ID,
        });
        lastRegisteredTokenRef.current = token;
        console.log('[push] registered', platform, 'token', token.slice(0, 12));
      } catch (err) {
        console.warn('[push] token registration failed', err);
      } finally {
        if (!cancelled) inFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, status]);

  // ---- Listen for OS-driven token rotation (rare but possible) ----
  // Note: addPushTokenListener fires for iOS device-token changes only.
  // Expo push tokens (Android) are stable for the install lifetime so a
  // listener isn't needed there.
  useEffect(() => {
    if (!user || status !== 'granted') return;
    if (Platform.OS !== 'ios') return;
    const sub = Notifications.addPushTokenListener((event) => {
      const next = event.data;
      if (typeof next !== 'string' || next.length === 0) return;
      if (lastRegisteredTokenRef.current === next) return;
      void registerPushToken({
        token: next,
        platform: 'ios',
        environment: ENVIRONMENT,
        bundle_id: BUNDLE_ID,
      })
        .then(() => {
          lastRegisteredTokenRef.current = next;
          console.log('[push] rotated ios token, re-registered', next.slice(0, 8));
        })
        .catch((err) => console.warn('[push] rotation registration failed', err));
    });
    return () => sub.remove();
  }, [user, status]);

  // ---- Unregister on sign-out ----
  // Detects the transition `user → null` and fires DELETE for the cached token.
  // The supabase session is already gone by this point, so the Bearer token
  // for the auth header is fetched from whatever's left in storage — this
  // race is acceptable because the server's DELETE also fails open (it's
  // idempotent) and the cron-driven 410-Gone cleanup handles stragglers.
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevUserIdRef.current;
    const next = user?.id ?? null;
    if (prev && !next) {
      const token = lastRegisteredTokenRef.current;
      if (token) {
        void unregisterPushToken(token).catch((err) =>
          console.warn('[push] unregister on sign-out failed', err),
        );
        lastRegisteredTokenRef.current = null;
      }
    }
    prevUserIdRef.current = next;
  }, [user]);
}
