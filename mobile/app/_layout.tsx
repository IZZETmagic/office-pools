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
import { QueryClientProvider } from '@tanstack/react-query';
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
import { createQueryClient, registerQueryClient, wireAppStateFocus } from '@/lib/queryClient';
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

  // ⚠⚠ NOTHING THAT DRAWS TEXT MAY MOUNT BEFORE THE FONTS LAND, and this was
  // learned the hard way. An earlier version rendered the whole tree
  // immediately so the session restore and the prefetch could start sooner.
  // React Native measured every string in the SYSTEM face, the real faces
  // arrived a moment later, and the measurements were not redone — so each
  // `<Text>` kept a width computed for a narrower font and clipped its last
  // glyph. The wordmark in the home header read "SporPoo".
  //
  // It is not a wordmark bug, it is every string in the app; the wordmark is
  // merely where it is impossible to miss. The `return null` that used to be
  // here is the standard Expo pattern precisely because of this.
  //
  // ⚠ AuthProvider STAYS OUTSIDE THE GATE, which keeps most of what the change
  // was after. Session restore is the first thing on the critical path and it
  // draws nothing, so it can start at frame zero. The data providers gain
  // nothing from starting earlier anyway — every fetch they make is behind
  // `if (!user) return`, so they cannot move until auth resolves regardless.
  //
  // A font ERROR counts as ready: a system typeface is a worse-looking app, not
  // a broken one, and far better than a launch that never completes.
  const fontsReady = fontsLoaded || !!fontError;

  return (
    <AuthProvider>
      {fontsReady ? <InnerLayout /> : null}
    </AuthProvider>
  );
}

// `Sentry.wrap` installs an error boundary at the root and instruments
// the navigation container for performance traces. No-op when Sentry isn't
// configured (DSN missing), so safe to leave wrapped in all environments.
export default Sentry.wrap(RootLayout);

function InnerLayout() {
  const colorScheme = useColorScheme();
  // ⚠ Created ONCE, via the lazy initialiser. `new QueryClient()` inline would
  // build a fresh cache on every render of this component and throw the old one
  // away — which does not look like a bug, it looks like every screen refetching
  // at random.
  const [queryClient] = useState(createQueryClient);
  // React Query's focus tracking is written for a browser. In React Native the
  // signal is AppState, and without this `refetchOnWindowFocus` never fires at
  // all — a phone that has been in a pocket for an hour shows hour-old data.
  useEffect(() => wireAppStateFocus(), []);
  // ⚠ HANDED TO THE REGISTRY so sign-out can empty it. The cache outlives the
  // session otherwise — nothing else can reach this client, because it is held
  // in component state — and the next member to sign in on the device renders
  // the last one's pools until every key happens to refetch. In an effect
  // rather than in the initialiser above: StrictMode may run that twice, and
  // registering the copy React threw away would clear the wrong cache.
  useEffect(() => registerQueryClient(queryClient), [queryClient]);
  const { session, loading, recovering } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // ⚠ Whether the router has reached the screen this launch is meant to end on.
  // Set by the routing effect below, read by the splash gate — it is the
  // difference between "we have decided where to go" and "we are there".
  const [routingSettled, setRoutingSettled] = useState(false);
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
    //
    // ⚠ EVERY BRANCH BELOW EITHER NAVIGATES OR DECLARES ITSELF SETTLED, and the
    // splash waits for that declaration. `router.replace` is asynchronous: the
    // frame after it is called still shows the OLD route. The splash used to
    // cover that frame by accident, because its floor was 1.2s; at 400ms it
    // stopped covering it and the onboarding slides flashed up on launch for
    // people who had long since finished them.
    //
    // A branch that navigates returns WITHOUT settling. This effect re-runs on
    // `segments`, so once the new route commits it comes back round, finds
    // itself in the right place, and settles then — which is the only moment
    // the splash may safely lift.
    if (loading || onboardingLoading || pushPermissionStatus === null) return;

    const group = segments[0];
    const sub = segments[1];

    // 1) First-launch pre-auth slides. Only shown when:
    //    - user has no session AND
    //    - they haven't completed the slides yet
    //    Once they sign in (or have an existing session from another
    //    install), the slides are skipped entirely — by design.
    if (!session && !onboardingSeen) {
      const onSlides = group === '(onboarding)' && sub === 'welcome';
      if (!onSlides) {
        router.replace('/(onboarding)/welcome');
        return;
      }
      setRoutingSettled(true);
      return;
    }

    // 2) Unauthed past the slides — standard sign-in.
    if (!session) {
      if (group !== '(auth)') {
        router.replace('/(auth)/sign-in');
        return;
      }
      setRoutingSettled(true);
      return;
    }

    // 2b) Signed in by a password-reset code, new password not saved yet.
    //     ⚠ MUST SIT ABOVE 3 AND 4. Both route any session onward, so without
    //     this the code would carry them into the app — or, on a new phone,
    //     the notifications screen — with a password they still don't know.
    //     The code screen never navigates itself; this does.
    if (recovering) {
      const onNewPassword = group === '(auth)' && sub === 'new-password';
      if (!onNewPassword) {
        router.replace('/(auth)/new-password');
        return;
      }
      setRoutingSettled(true);
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
      if (!onNotifications) {
        router.replace('/(onboarding)/notifications');
        return;
      }
      setRoutingSettled(true);
      return;
    }

    // 4) Fully onboarded. If we're stuck inside (auth) or (onboarding) for
    //    any reason, bounce into the app.
    if (group === '(auth)' || group === '(onboarding)') {
      router.replace('/(tabs)');
      return;
    }
    setRoutingSettled(true);
  }, [
    session,
    recovering,
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
    {/* Outermost of the data providers on purpose: everything below may use a
        query, and the client must outlive every one of them. Created once via
        useState so a re-render never swaps the cache out from under a screen —
        the classic React Query mistake, and it looks like a random refetch
        storm rather than like a bug. */}
    <QueryClientProvider client={queryClient}>
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
        {/* ⚠ fullScreenModal, not modal: the avatar band is edge to edge and runs under the
            status bar, which a sheet-style modal would inset and crop. Same presentation
            `pool/[id]/entry/[entryId]` uses. */}
        <Stack.Screen
          name="profile/avatar"
          options={{ presentation: 'fullScreenModal', headerShown: false }}
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
        {/* ⚠ DECLARED, OR IT GETS THE DEFAULT NATIVE HEADER. An undeclared route
            still renders — it just arrives with the stack's own chrome, which
            titles itself from the FILE PATH: "pool/[id]" beside
            "pool/[id]/table/[entryId]", and a second back button above the one
            the screen draws itself.

            Same options as the wizard above, deliberately: Ryan asked for this
            to feel like the World Cup prediction flow, and that flow is a
            full-screen modal whose only way out is its own back button. The
            table picker autosaves, so `gestureEnabled: false` protects nothing
            here — it is matched for consistency, not for safety. */}
        <Stack.Screen
          name="pool/[id]/table/[entryId]"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            gestureEnabled: false,
          }}
        />
        {/* Last Man Standing's picker. Declared for the same reason as the one
            above: undeclared it still renders, but with the stack's own header,
            titled from the FILE PATH and carrying a second back button over the
            one the screen draws itself. */}
        <Stack.Screen
          name="pool/[id]/survivor/[entryId]"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            gestureEnabled: false,
          }}
        />
        {/* Pick'em's picker, and the read-back of somebody else's week. Declared
            for the same reason as the two above: undeclared it still renders,
            but with the stack's own header, titled from the FILE PATH and
            carrying a second back button over the one the screen draws. */}
        <Stack.Screen
          name="pool/[id]/pickem/[entryId]"
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
        {/* The Profile hub's doors. Same card push as settings — each draws its
            own back header. */}
        <Stack.Screen name="profile/trophies" options={{ headerShown: false }} />
        <Stack.Screen name="profile/scouting" options={{ headerShown: false }} />
        <Stack.Screen name="profile/seasons" options={{ headerShown: false }} />
        {/* Crews (154) — My Crews and one crew. Each draws its own SettingsHeader, like Seasons. */}
        <Stack.Screen name="profile/crews/index" options={{ headerShown: false }} />
        <Stack.Screen name="profile/crews/[id]" options={{ headerShown: false }} />
        {/* Settings hierarchy — its index is the Profile tab itself since the
            hub rebuild. No `presentation` on purpose — the default
            card transition gives the push + edge-swipe-back that a settings
            hierarchy should have. Each screen draws its own SettingsHeader. */}
        <Stack.Screen name="settings/account" options={{ headerShown: false }} />
        <Stack.Screen name="settings/notifications" options={{ headerShown: false }} />
        <Stack.Screen name="settings/archived-pools" options={{ headerShown: false }} />
        <Stack.Screen name="settings/blocked-members" options={{ headerShown: false }} />
        <Stack.Screen name="settings/help" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        {/* DEV-ONLY — the onboarding journey, built on the real screens. Declared so it renders
            full-bleed; undeclared it arrives with the stack's header titled from the file path. */}
        <Stack.Screen name="onboarding-flow" options={{ headerShown: false }} />
        {/* THROWAWAY — the onboarding redesign concept harness. Declared only so it renders
            full-bleed instead of under the stack's default header, which would title itself
            "onboarding-harness" from the file path. Delete with the harness. */}
        <Stack.Screen name="onboarding-harness" options={{ headerShown: false }} />
        </Stack>
        <SplashOverlay routingSettled={routingSettled} />
      </PendingActionsProvider>
      </ActivityProvider>
      </TournamentMatchesProvider>
      </PresenceProvider>
      </HomeDataProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
    </KeyboardProvider>
    </GestureHandlerRootView>
    </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// Branded splash overlay. Stays mounted (over the rest of the tree) until
// HomeData + Activity + Tournament Matches have hydrated and a 1.2s
// minimum-floor has elapsed, then fades out and unmounts. Sibling to
// <Stack> so the tabs mount and prefetch behind the splash from frame
// zero. The floor gives the entrance animation (scale-in + bob) time to
// play out so the brand identity registers.
// ⚠ MEASURED FROM WHEN THE WORDMARK CAN BE DRAWN, NOT FROM MOUNT — see the
// effect that starts it. It was 1.2s and it was buying an entrance animation
// that no longer exists: a scale-in, a bob, and three bouncing dots. With the
// cold start now resolving from disk, that floor was the ONLY thing left making
// the app slow, and it was the app performing a wait rather than taking one.
//
// What remains is just long enough that the name registers instead of flashing.
const SPLASH_MIN_MS = 400;

/**
 * ⚠ THE CEILING, AND IT COVERS THE DATA GATE ONLY.
 *
 * Before it, the gate below was an unbounded AND of three network fetches: if
 * one never settled, the splash never lifted. Not a slow app — a branded screen
 * with no way out, and no way for the person to know anything was wrong.
 *
 * Past this point we show the app regardless. That is safe because every tab
 * renders its own loading state — Home puts a spinner under its header, and an
 * error under that with a "Try Again" — so the worst case becomes a visible,
 * recoverable screen with navigation instead of an indefinite hold.
 *
 * ⚠ IT DELIBERATELY DOES NOT BYPASS THE AUTH / ONBOARDING GATE. Those decide
 * WHICH SCREEN the person lands on, and rushing them does not show the app
 * sooner, it shows the wrong thing first and then snatches it away — sign-in
 * flashing up at someone who is signed in. Those reads are local (SecureStore),
 * and the one that can touch the network — the token refresh inside
 * `getSession()` — is bounded by `fetchWithTimeout` and now fails closed rather
 * than hanging.
 */
const SPLASH_MAX_MS = 2500;

function SplashOverlay({ routingSettled }: { routingSettled: boolean }) {
  const preloadComplete = useSplashGate(routingSettled);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  return (
    <Splash
      preloadComplete={preloadComplete}
      onDismissed={() => setDismissed(true)}
    />
  );
}

function useSplashGate(routingSettled: boolean): boolean {
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
  const [ceilingReached, setCeilingReached] = useState(false);

  // This component only exists once the fonts have landed — `RootLayout` holds
  // the whole tree until then — so mount IS font-ready, and the floor starts
  // counting from the moment the wordmark can actually be drawn.
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setCeilingReached(true), SPLASH_MAX_MS);
    return () => clearTimeout(t);
  }, []);

  if (!minElapsed) return false;
  if (authLoading || onboardingLoading || pushPermissionStatus === null) return false;
  // ⚠ THE CEILING GOES FIRST NOW, above everything it is meant to rescue —
  // including the routing check below. Nothing beneath this line can strand
  // anyone. See `SPLASH_MAX_MS`.
  if (ceilingReached) return true;
  // ⚠ NOT "we have decided", but "we are there". `router.replace` is async, so
  // lifting the splash on the decision shows the frame BEFORE the redirect —
  // which is how the onboarding slides flashed up at people who had finished
  // them years ago. The routing effect sets this only once the router has
  // actually arrived.
  if (!routingSettled) return false;
  // Unauthenticated launch: nothing to prefetch, and routing has settled, so
  // the sign-in screen (or the slides) is already the thing underneath.
  if (!session) return true;
  return !homeLoading && !activityLoading && !matchesLoading;
}
