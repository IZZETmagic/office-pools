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
import {
  TournamentMatchesProvider,
  useTournamentMatches,
} from '@/lib/TournamentMatchesProvider';
import { PendingActionsProvider } from '@/lib/usePendingActions';
import { initSentry, Sentry } from '@/lib/sentry';
import { usePushNotificationHandlers } from '@/lib/usePushNotificationHandlers';
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
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

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
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <SplashOverlay />
      </PendingActionsProvider>
      </ActivityProvider>
      </TournamentMatchesProvider>
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
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  if (!minElapsed) return false;
  if (authLoading) return false;
  // Unauthenticated launch: no data to prefetch — fade out so the user
  // lands on /(auth)/sign-in immediately after the 1.2s floor.
  if (!session) return true;
  return !homeLoading && !activityLoading && !matchesLoading;
}
