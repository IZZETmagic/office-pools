// Single source of truth for the iOS app icon badge.
//
// The OS badge persists at whatever value was last set via APNs payload or
// setBadgeCountAsync until someone explicitly changes it — iOS does NOT
// auto-decrement when notifications are read or dismissed. So we explicitly
// refresh the badge from the server-side truth at every meaningful moment:
//   - App boot / foreground (handled in usePushNotificationHandlers)
//   - After the user reads banter messages (handled in usePoolBanter.markAsRead)
//   - After the user opens a tab that clears pending actions (handled in
//     the relevant tab components via the usePendingActions context)
//
// On Android most launchers ignore setBadgeCountAsync — they drive the icon
// dot off the system notification tray instead — so this is mostly a no-op
// on that platform. Samsung One UI honors it though, so calling it is the
// right cross-platform default.
//
// Server source of truth is get_user_badge_count (migration 019) which equals
// unread banter messages + total incomplete user_pending_actions.

import * as Notifications from 'expo-notifications';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fetch the user's true badge count from the server and apply it to the OS.
 * Best-effort — failures are silently swallowed so a flaky network doesn't
 * disrupt UI flow. Returns the count that was set, or null on failure.
 */
export async function refreshIconBadge(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<number | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabase.rpc('get_user_badge_count', {
      p_user_id: userId,
    });
    if (error || typeof data !== 'number') return null;
    await Notifications.setBadgeCountAsync(data);
    return data;
  } catch {
    return null;
  }
}
