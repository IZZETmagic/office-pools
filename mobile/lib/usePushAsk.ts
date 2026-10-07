// The phone-side half of asking a member whose notifications are off. What is shown, and when,
// is decided in `lib/pushAsk.ts`; this holds the two flags it reads and the one action it takes.
//
// One module-level store, so the popup on Home, the card on Activity and the tile on Profile read
// the same flags: closing the card is seen everywhere without a remount, and the welcome screens
// can mark the popup shown before Home has mounted at all.

import * as SecureStore from 'expo-secure-store';
import { useCallback, useSyncExternalStore } from 'react';
import { Alert, Platform } from 'react-native';

import { hapticSuccess, hapticWarning } from './haptics';
import { pushAskMode, type PushAskMode } from './pushAsk';
import { usePushPermission } from './usePushPermission';

// ISO timestamps; only their presence is read. Per phone, like the permission they are about.
const POPUP_SHOWN_KEY = 'push_ask_popup_shown_at';
const CARD_CLOSED_KEY = 'push_ask_card_closed_at';

type State = {
  /** `null` until SecureStore has answered. */
  popupShown: boolean | null;
  cardClosed: boolean | null;
  /**
   * DEV ONLY (app/push-ask-harness.tsx): draw the card and the tile as if notifications were off
   * this way. Memory only, and never touches the phone's permission.
   */
  preview: PushAskMode | null;
  previewCardClosed: boolean;
};

let state: State = { popupShown: null, cardClosed: null, preview: null, previewCardClosed: false };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function setState(patch: Partial<State>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function load(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      try {
        const [shown, closed] = await Promise.all([
          SecureStore.getItemAsync(POPUP_SHOWN_KEY),
          SecureStore.getItemAsync(CARD_CLOSED_KEY),
        ]);
        // ⚠ `??`: a mark made while the read was in flight (the welcome screens finishing) wins.
        setState({
          popupShown: state.popupShown ?? shown !== null,
          cardClosed: state.cardClosed ?? closed !== null,
        });
      } catch (err) {
        // ⚠ FAILS CLOSED. If the flags can't be read they can't be written either, and a popup
        // that can never be marked shown is a popup on every launch.
        console.warn('[pushAsk] SecureStore read failed', err);
        setState({ popupShown: state.popupShown ?? true, cardClosed: state.cardClosed ?? true });
      }
    })();
  }
  return loading;
}

function subscribe(listener: () => void): () => void {
  void load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => state;

async function persist(key: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, new Date().toISOString());
  } catch (err) {
    console.warn('[pushAsk] SecureStore write failed', err);
  }
}

/**
 * This phone has been asked: the popup opened, or the welcome screens asked, which counts the same
 * (lib/useOnboardingProgress.ts). Memory first, so a Home that mounts a moment later already knows.
 */
export async function markPushAskShown(): Promise<void> {
  setState({ popupShown: true });
  await persist(POPUP_SHOWN_KEY);
}

/** The card's ×. Closed for good on this phone; in a preview, only until the preview changes. */
export async function closePushCard(): Promise<void> {
  if (state.preview !== null) {
    setState({ previewCardClosed: true });
    return;
  }
  setState({ cardClosed: true });
  await persist(CARD_CLOSED_KEY);
}

/** DEV ONLY — app/push-ask-harness.tsx. `null` ends the preview. */
export function setPushAskPreview(mode: PushAskMode | null): void {
  setState({ preview: mode, previewCardClosed: false });
}

/** DEV ONLY — which preview is on. Reads the store alone, so the harness never mounts a permission read. */
export function usePushAskPreview(): PushAskMode | null {
  return useSyncExternalStore(subscribe, snapshot).preview;
}

/** DEV ONLY — forget both flags on this phone, so the real popup and card can be seen again. */
export async function resetPushAsk(): Promise<void> {
  setState({ popupShown: false, cardClosed: false });
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(POPUP_SHOWN_KEY),
      SecureStore.deleteItemAsync(CARD_CLOSED_KEY),
    ]);
  } catch (err) {
    console.warn('[pushAsk] SecureStore reset failed', err);
  }
}

export function usePushAsk() {
  const s = useSyncExternalStore(subscribe, snapshot);
  const { status, canAskAgain, request, openSettings } = usePushPermission();
  /** The phone's own answer. The popup reads only this — a preview never opens it. */
  const realMode =
    status === null || canAskAgain === null ? null : pushAskMode({ status, canAskAgain });
  const previewing = s.preview !== null;
  /** What the card and the tile draw: the preview while there is one, else the phone. */
  const mode = s.preview ?? realMode;

  /**
   * "Turn on": the OS box while the phone can still show it, else the phone's Settings. Coming
   * back from Settings needs nothing here — usePushPermission re-reads on foreground, and
   * usePushTokenRegistration registers the phone as soon as it reads 'granted'.
   */
  const turnOn = useCallback(async (): Promise<void> => {
    if (previewing) {
      Alert.alert(
        'Preview',
        mode === 'settings'
          ? 'On a phone where notifications are blocked, this opens SportPool in Settings.'
          : `On a phone that hasn’t been asked, this shows ${Platform.OS === 'ios' ? 'the iPhone’s' : 'the phone’s'} own permission box.`,
      );
      return;
    }
    if (realMode === 'prompt') {
      // ⚠ The OUTCOME, not the press — a "no" is an answer, not a failure (same rhythm as the
      // welcome screens).
      const next = await request();
      if (next === 'granted') hapticSuccess();
      else hapticWarning();
      return;
    }
    if (realMode === 'settings') await openSettings();
  }, [previewing, mode, realMode, request, openSettings]);

  return {
    mode,
    realMode,
    previewing,
    popupShown: s.popupShown,
    cardClosed: previewing ? s.previewCardClosed : s.cardClosed,
    turnOn,
  };
}
