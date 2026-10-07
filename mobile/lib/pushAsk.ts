// =============================================================
// Asking a member whose notifications are off (Ryan, 2026-10-07)
// =============================================================
//   the popup   once per phone, on Home, after the launch splash. It replaces the old one-time
//               dialog (useNotificationPrompt), which only covered people never asked and still
//               described the World Cup.
//   the card    at the top of Activity, until notifications are on or the member closes it.
//   the tile    Profile's Notifications tile says "Off" for as long as they are.
//
// ⚠ "ONCE" IS SHARED WITH THE WELCOME SCREENS. Everyone who signs up is asked there
// (`app/(onboarding)/notifications.tsx`), and that ask marks the popup as shown too, so nobody is
// asked twice in their first minute. Only a phone that went through the welcome screens before the
// popup existed sees it — once.
//
// Disclosure gate: "If notifications are off on your phone, we ask once when you open the app, and
// a card offers to turn them on until you do or close it."
//
// ⚠ PURE ON PURPOSE: vitest runs this without React Native (see vitest.config.ts). The SecureStore
// half lives in `usePushAsk.ts`.
// =============================================================

/** What a "turn on" button can do on this phone. */
export type PushAskMode =
  /** The OS can still show its own permission box. */
  | 'prompt'
  /** It can't, so the only way is the phone's Settings. */
  | 'settings';

export type PermissionSnapshot = {
  status: 'undetermined' | 'granted' | 'denied';
  /** expo-notifications' `canAskAgain`: whether `requestPermissionsAsync()` can still show the OS box. */
  canAskAgain: boolean;
};

/**
 * Off, and which way back. `null` when notifications are on or the phone hasn't answered yet.
 *
 * ⚠ `canAskAgain`, NOT `status === 'denied'`. Android lets an app ask twice, so after one refusal
 * the status is 'denied' while the box can still be shown; iOS never shows it again after any
 * answer. Reading the status alone would send an Android member to Settings for something one tap
 * could do.
 */
export function pushAskMode(permission: PermissionSnapshot | null): PushAskMode | null {
  if (permission === null || permission.status === 'granted') return null;
  return permission.canAskAgain ? 'prompt' : 'settings';
}

export type PopupInputs = {
  signedIn: boolean;
  mode: PushAskMode | null;
  /** Whether this phone has had the popup (or the welcome-screen ask). `null` until it is read. */
  shown: boolean | null;
  /** Home is the screen on top. */
  homeFocused: boolean;
  /** The launch splash has gone. The popup is a native Modal, which would open on top of it. */
  splashGone: boolean;
};

/** The popup: notifications off, never asked on this phone, and Home in front of the member. */
export function shouldShowPushPopup(i: PopupInputs): boolean {
  return i.signedIn && i.mode !== null && i.shown === false && i.homeFocused && i.splashGone;
}

/** The card: notifications off, and never closed on this phone. Not yet known is not shown. */
export function shouldShowPushCard(mode: PushAskMode | null, closed: boolean | null): boolean {
  return mode !== null && closed === false;
}
