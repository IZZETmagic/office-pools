import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_900Black,
  useFonts,
} from '@expo-google-fonts/nunito';
import { RobotoMono_400Regular, RobotoMono_700Bold } from '@expo-google-fonts/roboto-mono';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { LogBox, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

// Fix for the "screen pops bigger then snaps to correct size on first tab
// visit" jump. react-native-screens (the default for react-navigation)
// manages native UIViewController lifecycle for each screen, and on iOS the
// first time an inactive tab's screen is attached to the window it briefly
// renders at full window dimensions before the layout pass accounts for
// safe-area insets + the tab bar height — visible as a first-focus pop.
// Disabling it makes navigation use plain RN Views, so every tab is just a
// flex child measured once at JS mount time (behind the splash). Tried
// less-invasive fixes first — Reanimated `entering` wrappers on each tab,
// detachInactiveScreens={false} on the navigator — neither helped because
// the jump is at the native screen-attachment layer, not in JS. The
// trade-off is the loss of native screen freeze/detach optimizations, but
// for a 5-tab app with light screens that's negligible.
enableScreens(false);

import { Splash } from '@/components/Splash';
import { ActivityProvider, useSharedActivity } from '@/lib/ActivityProvider';
import { AuthProvider, useAuth } from '@/lib/auth';
import { HomeDataProvider, useHomeData } from '@/lib/HomeDataProvider';
import { PresenceProvider } from '@/lib/PresenceProvider';
import {
  TournamentMatchesProvider,
  useTournamentMatches,
} from '@/lib/TournamentMatchesProvider';
import { PendingActionsProvider } from '@/lib/usePendingActions';
import { initSentry, Sentry } from '@/lib/sentry';
import {
  markNotificationsPrompted,
  useOnboardingProgress,
} from '@/lib/useOnboardingProgress';
import { usePushNotificationHandlers } from '@/lib/usePushNotificationHandlers';
import { usePushPermission } from '@/lib/usePushPermission';
import { usePushTokenRegistration } from '@/lib/usePushTokenRegistration';

// Crash + error reporting. Module-scope init runs once per JS context — Fast
// Refresh re-runs the file but Sentry.init guards against duplicate setup.
// Falls back to a no-op when EXPO_PUBLIC_SENTRY_DSN is unset.
initSentry();

// react-native-reorderable-list legitimately nests its FlatList inside an
// Animated.ScrollView via ScrollViewContainer. RN's VirtualizedList warning is
// a false positive in that documented setup.
LogBox.ignoreLogs([
  'VirtualizedLists should never be nested inside plain ScrollViews',
]);

SplashScreen.preventAutoHideAsync().catch(() => {
  /* splash may have already auto-hidden */
});

// iOS-only: crossfade the native splash out instead of cutting. Combined
// with the JS Splash painting the same PNG at the same size on a solid
// #0B0F1A background, the hand-off reads as one continuous screen — the
// trophy stays put while the native layer dissolves under the JS layer.
// No-op on Android (`fade` is iOS-only per expo-splash-screen types).
SplashScreen.setOptions({ fade: true, duration: 200 });

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_900Black,
    // Roboto Mono for numeric displays on Android. iOS uses the
    // system-available Menlo / Menlo-Bold faces; Android's `'monospace'`
    // family has no Bold face, so we load Roboto Mono Bold so numbers
    // render with the same visual weight as on iOS.
    RobotoMono_400Regular,
    RobotoMono_700Bold,
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AuthProvider>
      <InnerLayout />
    </AuthProvider>
  );
}

// `Sentry.wrap` installs an error boundary at the root and instruments
// the navigation container for performance traces. No-op when Sentry isn't
// configured (DSN missing), so safe to leave wrapped in all environments.
export default Sentry.wrap(RootLayout);

function InnerLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const {
    loading: onboardingLoading,
    seen: onboardingSeen,
    notificationsPrompted,
  } = useOnboardingProgress();
  const { status: pushPermissionStatus } = usePushPermission();

  // Watches auth + push permission; registers/unregisters the APNs device
  // token with the backend. No-op until both are ready.
  usePushTokenRegistration();

  // Foreground display behavior + tap-to-navigate handlers. Safe to mount
  // unconditionally; the foreground handler is idempotent and the tap
  // listeners no-op when no notification has been tapped.
  usePushNotificationHandlers();

  // Native splash → custom Splash hand-off happens inside the Splash
  // component (it calls SplashScreen.hideAsync() on mount). That keeps the
  // hand-off coupled to the moment the custom splash is actually painted,
  // avoiding any blank-frame flash.

  useEffect(() => {
    // Hold routing until every input the state machine reads has resolved.
    // The splash overlay covers this; once everything's ready we route
    // exactly once into the correct destination before splash fades.
    if (loading || onboardingLoading || pushPermissionStatus === null) return;

    const group = segments[0];
    const sub = segments[1];

    // 1) First-launch pre-auth slides. Only shown when:
    //    - user has no session AND
    //    - they haven't completed the slides yet
    //    Once they sign in (or have an existing session from another
    //    install), the slides are skipped entirely — by design.
    if (!session && !onboardingSeen) {
      const onSlides = group === '(onboarding)' && sub !== 'notifications';
      if (!onSlides) router.replace('/(onboarding)');
      return;
    }

    // 2) Unauthed past the slides — standard sign-in.
    if (!session) {
      if (group !== '(auth)') router.replace('/(auth)/sign-in');
      return;
    }

    // 3) Authed but haven't been shown the post-auth notifications screen.
    //    Fires for fresh sign-ups AND for existing users on their first
    //    launch after this feature ships. If push perm is already granted,
    //    silently mark prompted so we never bother them again.
    if (!notificationsPrompted) {
      if (pushPermissionStatus === 'granted') {
        void markNotificationsPrompted();
        return;
      }
      const onNotifications = group === '(onboarding)' && sub === 'notifications';
      if (!onNotifications) router.replace('/(onboarding)/notifications');
      return;
    }

    // 4) Fully onboarded. If we're stuck inside (auth) or (onboarding) for
    //    any reason, bounce into the app.
    if (group === '(auth)' || group === '(onboarding)') {
      router.replace('/(tabs)');
    }
  }, [
    session,
    loading,
    onboardingLoading,
    onboardingSeen,
    notificationsPrompted,
    pushPermissionStatus,
    segments,
    router,
  ]);

  // Note: no `if (loading) return null;` here — the tree mounts immediately
  // so HomeDataProvider + ActivityProvider can start prefetching beneath the
  // splash overlay. The auth routing useEffect above redirects under the
  // splash, so by the time it fades, the correct stack is already mounted.

  return (
    // SafeAreaProvider with `initialMetrics` so safe-area insets are
    // correct from frame zero. expo-router's outer SafeAreaProvider passes
    // `initialMetrics={undefined}` on native, which makes the first frame
    // paint with insets at 0 and then jump down by the notch height once
    // the native safe-area module reports back. Our nested provider wins
    // for everything below; expo-router's outer one is harmless.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <GestureHandlerRootView style={{ flex: 1 }}>
    <KeyboardProvider>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <HomeDataProvider>
      {/* PresenceProvider publishes app-wide online presence to the
          per-pool Supabase presence channels the web Banter UI reads.
          Inside HomeDataProvider because it needs the user's pool list
          + identity from home data. Publisher-only — no mobile UI reads
          presence yet. */}
      <PresenceProvider>
      {/* TournamentMatchesProvider lives inside HomeDataProvider because
          the internal hook reads tournament IDs from home data (one query
          per tournament the user has a pool in). Mounting it here fires
          the matches fetch as soon as home data resolves; combined with
          the splash gate waiting on its loading state, Results renders
          fully on first paint instead of flashing a loading spinner. */}
      <TournamentMatchesProvider>
      <ActivityProvider>
      <PendingActionsProvider>
        <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        <Stack.Screen
          name="create-pool"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="pool-preview/[id]"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="pool/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="pool/[id]/entry/[entryId]"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="pool/[id]/scoring-config"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="pool/[id]/member/[memberId]"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="pool/[id]/levels"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="pool/[id]/breakdown"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="match/[matchId]"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="notification-settings"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <SplashOverlay />
      </PendingActionsProvider>
      </ActivityProvider>
      </TournamentMatchesProvider>
      </PresenceProvider>
      </HomeDataProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
    </KeyboardProvider>
    </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

// Branded splash overlay. Stays mounted (over the rest of the tree) until
// HomeData + Activity + Tournament Matches have hydrated and a 1.2s
// minimum-floor has elapsed, then fades out and unmounts. Sibling to
// <Stack> so the tabs mount and prefetch behind the splash from frame
// zero. The floor gives the entrance animation (scale-in + bob) time to
// play out so the brand identity registers.
const SPLASH_MIN_MS = 1200;

function SplashOverlay() {
  const preloadComplete = useSplashGate();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  return (
    <Splash
      preloadComplete={preloadComplete}
      onDismissed={() => setDismissed(true)}
    />
  );
}

function useSplashGate(): boolean {
  const { session, loading: authLoading } = useAuth();
  const { loading: homeLoading } = useHomeData();
  const { loading: activityLoading } = useSharedActivity();
  // Wait on the tournament matches fetch so Results renders fully on
  // first paint (matching Home/Pools/Activity covered by homeLoading +
  // activityLoading).
  const { loading: matchesLoading } = useTournamentMatches();
  // The onboarding gate reads both flags + push permission to decide
  // routing. Holding splash until they resolve guarantees the user lands
  // on the right screen (slides / notifications / tabs) instead of
  // flashing the wrong one for a frame.
  const { loading: onboardingLoading } = useOnboardingProgress();
  const { status: pushPermissionStatus } = usePushPermission();
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  if (!minElapsed) return false;
  if (authLoading || onboardingLoading || pushPermissionStatus === null) return false;
  // Unauthenticated launch: no data to prefetch — fade out so the user
  // lands on /(auth)/sign-in (or the pre-auth slides) immediately after
  // the 1.2s floor.
  if (!session) return true;
  return !homeLoading && !activityLoading && !matchesLoading;
}
