// The one notifications popup, on Home. `lib/pushAsk.ts` decides whether; this decides when.
//
// It opens a beat after Home is the screen in front AND the launch splash has gone (a native Modal
// would otherwise open on top of the splash), and is marked shown the moment it opens, so a
// force-quit with the popup up still counts as the one time.
//
// ⚠ IT READS THE PHONE, NEVER THE PREVIEW. The dev preview (app/push-ask-harness.tsx) redraws the
// card and the tile; the popup it shows is its own copy, so previewing can't use up the real one.

import { useIsFocused } from '@react-navigation/native';
import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { shouldShowPushPopup, type PushAskMode } from '@/lib/pushAsk';
import { useSplashGone } from '@/lib/splashState';
import { markPushAskShown, usePushAsk } from '@/lib/usePushAsk';

import { PushAskSheet } from './PushAskSheet';

/** Long enough to read as the app speaking rather than as part of the launch. */
const OPEN_DELAY_MS = 700;

export function PushAskGate() {
  const { user } = useAuth();
  const homeFocused = useIsFocused();
  const splashGone = useSplashGone();
  const { realMode, popupShown, turnOn } = usePushAsk();
  // The mode is fixed when it opens, so the sheet doesn't change under the member's thumb when the
  // OS box answers; `visible` goes false first so the close can play before it unmounts.
  const [sheet, setSheet] = useState<{ mode: PushAskMode; visible: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = shouldShowPushPopup({
    signedIn: !!user,
    mode: realMode,
    shown: popupShown,
    homeFocused,
    splashGone,
  });

  useEffect(() => {
    if (!ready || realMode === null) return;
    const mode = realMode;
    const timer = setTimeout(() => {
      setSheet({ mode, visible: true });
      void markPushAskShown();
    }, OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, realMode]);

  if (!sheet) return null;
  const close = () => setSheet((s) => (s ? { ...s, visible: false } : s));

  return (
    <PushAskSheet
      visible={sheet.visible}
      mode={sheet.mode}
      busy={busy}
      onTurnOn={async () => {
        setBusy(true);
        try {
          await turnOn();
        } finally {
          setBusy(false);
          close();
        }
      }}
      onClose={close}
    />
  );
}
