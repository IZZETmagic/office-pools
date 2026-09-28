import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import 'react-native-url-polyfill/auto';

import { fetchWithTimeout } from './fetchWithTimeout';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // ⚠ THIS THROW IS AT MODULE SCOPE, SO IT IS AN INSTANT CRASH ON LAUNCH — no
  // screen, no Sentry breadcrumb, nothing to read. Failing fast is right (an
  // app with no backend is not usable), but the message has to say where the
  // values come from, because there are TWO sources and they are easy to
  // confuse:
  //
  //   Metro          `mobile/.env.local` ON YOUR MACHINE. This is also why a
  //                  dev client and an `eas update` bundle work — both are
  //                  built locally, where that file exists.
  //   an EAS build   the EAS ENVIRONMENT for the profile's channel. `.env.local`
  //                  is gitignored and never uploaded, so the file is not there.
  //
  // A standalone `preview` build crashed on launch for exactly this reason: the
  // `preview` environment had never been given the variables, and nothing else
  // had ever needed them, because every previous preview bundle was built on a
  // laptop.
  throw new Error(
    'Missing Supabase env vars (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY). ' +
      'For Metro, set them in mobile/.env.local. For an EAS build, set them on the EAS ' +
      'environment matching the build profile — `eas env:list --environment <name>`.',
  );
}

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  // ⚠ REACHES AUTH TOO, WHICH IS THE POINT. `createClient` hands `global.fetch`
  // to the auth client as well as to PostgREST, so a stalled token refresh
  // during `getSession()` is bounded by the same clock as a query — and that
  // one sits on the cold-start path ahead of everything else. Realtime is a
  // WebSocket and is untouched, so the live leaderboard keeps its connection.
  global: { fetch: fetchWithTimeout },
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
