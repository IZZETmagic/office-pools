// Whether the launch splash has gone (`SplashOverlay` in app/_layout.tsx).
//
// ⚠ A native Modal opened before then draws ON TOP of the splash, because the splash is an
// ordinary view and a Modal is a separate window. So anything that opens by itself at launch waits
// for this — today, the notifications popup (lib/pushAsk.ts).
//
// Module-level, so a screen that mounts after the splash went still reads `true`.

import { useSyncExternalStore } from 'react';

let gone = false;
const listeners = new Set<() => void>();

export function markSplashGone(): void {
  if (gone) return;
  gone = true;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSplashGone(): boolean {
  return useSyncExternalStore(subscribe, () => gone);
}
