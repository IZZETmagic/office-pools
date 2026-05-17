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

import { registerPushToken, unregisterPushToken } from './api';
import { useAuth } from './auth';
import { usePushPermission } from './usePushPermission';

const BUNDLE_ID =
  Constants.expoConfig?.ios?.bundleIdentifier ?? 'com.officepools.expo';

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
        const result = await Notifications.getDevicePushTokenAsync();
        if (cancelled) return;
        const token = result.data;
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
          platform: 'ios',
          environment: ENVIRONMENT,
          bundle_id: BUNDLE_ID,
        });
        lastRegisteredTokenRef.current = token;
        console.log('[push] registered token', token.slice(0, 8), 'env', ENVIRONMENT);
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
  useEffect(() => {
    if (!user || status !== 'granted') return;
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
          console.log('[push] rotated token, re-registered', next.slice(0, 8));
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
