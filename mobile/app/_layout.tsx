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
import { useEffect } from 'react';
import { LogBox, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/lib/auth';
import { HomeDataProvider } from '@/lib/HomeDataProvider';
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

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {
        /* ignore */
      });
    }
  }, [loading]);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router]);

  if (loading) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <KeyboardProvider>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <HomeDataProvider>
        <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen
          name="join-pool"
          options={{
            presentation: 'formSheet',
            headerShown: false,
            sheetAllowedDetents: 'fitToContents',
            sheetCornerRadius: 50,
            sheetGrabberVisible: true,
          }}
        />
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
          name="pool/[id]/banter"
          options={{
            headerShown: false,
            presentation: 'modal',
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
      </HomeDataProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
    </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
