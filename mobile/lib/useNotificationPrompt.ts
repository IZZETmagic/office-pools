// Decides whether to surface the in-app "would you like notifications?"
// soft-ask, and gives the screen a single function to handle each choice.
//
// Why a "soft-ask" instead of just calling requestPermissionsAsync directly:
// iOS only shows the native system prompt ONCE per install — after the user
// dismisses or denies it, you cannot re-prompt programmatically. They must
// flip the switch in Settings. So if we fire the system prompt at the wrong
// moment (e.g. first launch before they've seen any value) and they tap "Don't
// allow," we've burned our one shot.
//
// Strategy:
//   1. Show our OWN in-app dialog first — context-aware, framed around the
//      benefit ("get pinged when pool activity happens"). Doesn't touch the
//      native permission state.
//   2. If the user taps "Enable Notifications," THEN we call
//      requestPermissionsAsync, which surfaces the native iOS prompt
//      while the user is in the "yes" frame of mind.
//   3. If the user dismisses our dialog, we record that and don't ask
//      again. Profile screen still has the manual opt-in path.
//
// The dismiss flag is persisted via expo-secure-store so the prompt only
// fires once per install — even if the user signs out and back in.

import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';

import { usePushPermission, type PushPermissionStatus } from './usePushPermission';

// SecureStore key. ISO timestamp string of when the prompt was shown (or
// dismissed). Presence of the key means we already asked.
const SOFT_ASK_KEY = 'notification_soft_ask_handled_at';

export function useNotificationPrompt(opts?: {
  /**
   * Whether the user is signed in. Pass `false` while auth is loading or the
   * user hasn't signed in yet — we don't want to ask about notifications
   * before the user has any reason to care about them.
   */
  enabled?: boolean;
}) {
  const enabled = opts?.enabled ?? true;
  const { status, request } = usePushPermission();
  const [softAskHandled, setSoftAskHandled] = useState<boolean | null>(null);

  // Read the persisted "already asked" flag once per session.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const value = await SecureStore.getItemAsync(SOFT_ASK_KEY);
        if (cancelled) return;
        setSoftAskHandled(value !== null);
      } catch {
        // SecureStore failure is non-critical — fall back to "not handled"
        // so the user still gets the prompt (and we won't loop because
        // the dismiss handler also tries to write the flag).
        if (!cancelled) setSoftAskHandled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Surface the prompt only when:
  //   - the caller says the screen is ready (enabled, e.g. user signed in)
  //   - we've read the flag (softAskHandled !== null)
  //   - the flag isn't set yet (softAskHandled === false)
  //   - and the OS still considers permission "undetermined" — meaning
  //     we CAN still trigger the native prompt. If status is "denied" or
  //     "granted," there's nothing to soft-ask about.
  const shouldPrompt =
    enabled &&
    softAskHandled === false &&
    status === ('undetermined' as PushPermissionStatus);

  const markHandled = useCallback(async () => {
    try {
      await SecureStore.setItemAsync(SOFT_ASK_KEY, new Date().toISOString());
    } catch {
      // best effort
    }
    setSoftAskHandled(true);
  }, []);

  /** User tapped "Not now" — dismiss permanently, don't trigger the OS prompt. */
  const dismiss = useCallback(async () => {
    await markHandled();
  }, [markHandled]);

  /**
   * User tapped "Enable Notifications" — fire the native OS prompt while
   * they're in the right frame of mind, then mark handled regardless of
   * the outcome (we've burned our one-time slot either way).
   */
  const enable = useCallback(async (): Promise<PushPermissionStatus> => {
    const result = await request();
    await markHandled();
    return result;
  }, [request, markHandled]);

  return { shouldPrompt, dismiss, enable };
}
