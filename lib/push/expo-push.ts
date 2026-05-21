// Expo Push API client — used for Android device tokens.
//
// On iOS we go direct to APNs (lib/push/apns.ts) because the Swift app
// already had that pipeline. For Android we use Expo's hosted relay, which
// forwards to FCM with the JWT signing handled for us. Trade-off: Expo as
// dependency in the critical path + 600 notifications/sec free tier rate
// limit. For our user volume that's fine; if we ever outgrow it we can
// migrate to direct FCM by adding a parallel lib/push/fcm.ts.
//
// Tokens look like `ExponentPushToken[xxxxxxxxxxxxxxxxxxxx]` and are stored
// in push_tokens with platform='android'.

import { createAdminClient } from '@/lib/supabase/server'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

type ExpoPushPayload = {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound: 'default' | null
  // Optional. On iOS this sets the app icon badge (Expo relays it through
  // to APNs); on Android most launchers ignore the field entirely. When
  // undefined we just omit it, so the device's current badge stays put.
  badge?: number
  // Android notification channel — must exist on the device. expo-notifications
  // auto-creates a 'default' channel for us on Android 8+.
  channelId: string
}

type ExpoPushTicket = {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: {
    error?: string
    [key: string]: unknown
  }
}

type ExpoPushResponse = {
  data?: ExpoPushTicket[]
  errors?: Array<{ code?: string; message?: string }>
}

/**
 * Send a push notification to a single Expo push token. Returns true on
 * success, false on any failure. Invalid tokens (`DeviceNotRegistered`)
 * are auto-removed from push_tokens, mirroring the APNs 410-Gone cleanup.
 */
export async function sendExpoPushNotification(
  expoToken: string,
  payload: {
    title: string
    body: string
    data?: Record<string, unknown>
    // Optional per-recipient badge count. Mirrors the APNs payload field;
    // see lib/push/apns.ts for the why. When unset we omit it, leaving
    // the device's current badge untouched (Android won't notice; iOS via
    // the Expo relay path will keep whatever was last set).
    badge?: number
  },
): Promise<boolean> {
  const message: ExpoPushPayload = {
    to: expoToken,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: 'default',
    channelId: 'default',
  }
  if (typeof payload.badge === 'number') {
    message.badge = payload.badge
  }

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify([message]),
    })
    const json = (await res.json()) as ExpoPushResponse

    if (!res.ok) {
      console.error(`[ExpoPush] HTTP ${res.status}:`, json)
      return false
    }

    const ticket = json.data?.[0]
    if (!ticket) {
      console.error('[ExpoPush] No ticket returned:', json)
      return false
    }

    if (ticket.status === 'error') {
      console.error(
        `[ExpoPush] Error for token ${tokenPreview(expoToken)}: ${ticket.message ?? '(no message)'}`,
        ticket.details,
      )
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await removeInvalidToken(expoToken)
      }
      return false
    }

    console.log(`[ExpoPush] Success for token ${tokenPreview(expoToken)}`)
    return true
  } catch (err) {
    console.error(`[ExpoPush] Exception for token ${tokenPreview(expoToken)}:`, err)
    return false
  }
}

function tokenPreview(token: string): string {
  // ExponentPushToken[xxxxxxxxxxxxxxxxxxxx] → xxxxxxxx…
  const match = token.match(/ExponentPushToken\[([^\]]+)\]/)
  const inner = match?.[1] ?? token
  return inner.slice(0, 8) + '…'
}

async function removeInvalidToken(token: string): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from('push_tokens').delete().eq('token', token)
    console.log(`[ExpoPush] Removed invalid token ${tokenPreview(token)}`)
  } catch (err) {
    console.error('[ExpoPush] Failed to remove invalid token:', err)
  }
}
