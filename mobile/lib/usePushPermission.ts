// Push notification permission state + request flow.
// Wrapped in a hook so the Profile screen (and any future deeplink prompts)
// can share a single source of truth.

import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

export type PushPermissionStatus = 'undetermined' | 'granted' | 'denied';

function normalize(status: Notifications.PermissionStatus): PushPermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

export function usePushPermission() {
  // `null` while we're still reading the initial status from the OS so the
  // UI can show a brief "checking…" state rather than flashing the wrong CTA.
  const [status, setStatus] = useState<PushPermissionStatus | null>(null);

  const check = useCallback(async () => {
    const res = await Notifications.getPermissionsAsync();
    setStatus(normalize(res.status));
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  // Re-check when the app comes back to the foreground. If the user dipped
  // into iOS Settings to enable/disable notifications, this picks up the new
  // status without requiring a manual refresh.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, [check]);

  const request = useCallback(async (): Promise<PushPermissionStatus> => {
    // iOS: requestPermissionsAsync triggers the native prompt only when the
    // current status is "undetermined". If the user already denied, the call
    // resolves immediately with the same denied status — they must flip the
    // switch in Settings. Caller handles that branch.
    const res = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    const next = normalize(res.status);
    setStatus(next);
    return next;
  }, []);

  const openSettings = useCallback(async () => {
    // iOS deep-links straight to the app's notification settings page.
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
    } else {
      await Linking.openSettings();
    }
  }, []);

  return { status, request, openSettings, refresh: check };
}
