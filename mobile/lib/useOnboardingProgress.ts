// Tracks whether the user has finished the pre-auth onboarding pager and
// whether they've been shown the post-auth notifications screen. Both flags
// are per-install (cleared on uninstall) and survive sign-out so we don't
// re-prompt every time a user logs out/in.
//
// We use expo-secure-store rather than AsyncStorage because it's already a
// project dependency. The values are tiny strings ('1' or absent) —
// Keychain/Keystore is overkill for this data but the API is simple and
// the cost is negligible.
//
// Designed as a module-scoped store rather than a Provider because the
// flags are read in two places (root layout gate + the onboarding screens
// themselves) and need to stay in sync without prop-drilling. The
// subscriber set lets the root gate re-render the moment a screen calls
// `markSeen()` so routing happens without an extra round-trip through
// SecureStore.

import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

const ONBOARDING_SEEN_KEY = 'onboarding_seen';
const NOTIFICATIONS_PROMPTED_KEY = 'notifications_prompted';

export type OnboardingProgress = {
  loading: boolean;
  seen: boolean;
  notificationsPrompted: boolean;
};

let state: OnboardingProgress = {
  loading: true,
  seen: false,
  notificationsPrompted: false,
};

const subscribers = new Set<() => void>();

function setState(next: Partial<OnboardingProgress>) {
  state = { ...state, ...next };
  subscribers.forEach((cb) => cb());
}

// useSyncExternalStore contract: `subscribe` registers a listener and
// returns an unsubscribe; `getSnapshot` returns the current state object.
// Because setState replaces `state` with a new object only when something
// actually changes, the reference is stable between renders and React
// won't infinite-loop on equality checks.
function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange);
  // Kick off the SecureStore read the first time anyone subscribes. init()
  // is idempotent via initPromise, so it's safe to call from every
  // subscribe.
  void init();
  return () => {
    subscribers.delete(onChange);
  };
}

function getSnapshot(): OnboardingProgress {
  return state;
}

// Module-scoped init promise so concurrent first-callers all wait on the
// same SecureStore reads instead of racing.
let initPromise: Promise<void> | null = null;

function init(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const [seenRaw, promptedRaw] = await Promise.all([
        SecureStore.getItemAsync(ONBOARDING_SEEN_KEY),
        SecureStore.getItemAsync(NOTIFICATIONS_PROMPTED_KEY),
      ]);
      setState({
        loading: false,
        seen: seenRaw === '1',
        notificationsPrompted: promptedRaw === '1',
      });
    } catch (err) {
      // On read failure assume the user hasn't seen anything yet — better
      // to show onboarding twice than to skip it for a real first-launcher.
      console.warn('[onboarding] SecureStore read failed', err);
      setState({ loading: false, seen: false, notificationsPrompted: false });
    }
  })();
  return initPromise;
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ONBOARDING_SEEN_KEY, '1');
  } catch (err) {
    console.warn('[onboarding] failed to persist seen flag', err);
  }
  setState({ seen: true });
}

export async function markNotificationsPrompted(): Promise<void> {
  try {
    await SecureStore.setItemAsync(NOTIFICATIONS_PROMPTED_KEY, '1');
  } catch (err) {
    console.warn('[onboarding] failed to persist notifications flag', err);
  }
  setState({ notificationsPrompted: true });
}

// Debug helper — not wired to UI. Useful in QA to re-trigger the flow
// without reinstalling.
export async function resetOnboardingProgress(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(ONBOARDING_SEEN_KEY),
      SecureStore.deleteItemAsync(NOTIFICATIONS_PROMPTED_KEY),
    ]);
  } catch (err) {
    console.warn('[onboarding] reset failed', err);
  }
  setState({ seen: false, notificationsPrompted: false });
}

export function useOnboardingProgress(): OnboardingProgress {
  return useSyncExternalStore(subscribe, getSnapshot);
}
