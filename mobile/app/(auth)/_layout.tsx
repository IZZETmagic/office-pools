import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* No swipe-back: behind it is a reset that has already worked, and the
          root gate would bring them straight back here while `recovering`. */}
      <Stack.Screen name="new-password" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
