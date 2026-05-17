// Sentry crash + error reporting for the Expo app.
//
// Initialized once at module load via `initSentry()` below — the call is
// idempotent (Sentry's own SDK guards against double-init), so mounting it
// from the root layout is safe even with Fast Refresh.
//
// DSN comes from EXPO_PUBLIC_SENTRY_DSN. If unset (e.g. local dev without a
// Sentry project, or PR-build env), init becomes a no-op and the wrapped
// component renders identically — i.e. failing to configure Sentry does
// NOT break the app.

import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Pull a few helpful tags from app.json/expo so issues can be filtered by
// build variant without us having to set context everywhere.
const RELEASE = Constants.expoConfig?.version ?? 'unknown';
const RUNTIME_VERSION =
  (Constants.expoConfig?.runtimeVersion as string | undefined) ?? 'unknown';

let initialized = false;

export function initSentry() {
  if (initialized) return;
  initialized = true;

  if (!DSN) {
    // Quiet skip — no DSN configured (local dev or build profile without env).
    return;
  }

  Sentry.init({
    dsn: DSN,
    // Sends a "session" event on app foreground/background so we can compute
    // crash-free-session metrics. Cheap on quota and gives us the most basic
    // health signal for the launch.
    enableAutoSessionTracking: true,
    // Default sample rates — start conservative; ramp up if we have headroom.
    tracesSampleRate: __DEV__ ? 1.0 : 0.1,
    // Don't ship debug logging to prod — Sentry will spam Metro logs otherwise.
    debug: __DEV__,
    release: RELEASE,
    dist: RUNTIME_VERSION,
    environment: __DEV__ ? 'development' : 'production',
  });
}

// Re-export so the rest of the app imports from one place (e.g. for manual
// `Sentry.captureException` calls in catch blocks).
export { Sentry };
