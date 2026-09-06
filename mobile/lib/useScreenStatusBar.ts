// =============================================================
// WHOSE STATUS BAR IS IT — one answer per screen
// =============================================================
// Ryan, 2026-09-06, on the duel decision page and then the prediction wizard:
// the clock, battery and signal were invisible. Same cause both times, and it
// will keep happening until every screen a Showdown pool can reach says what it
// wants.
//
// ## ⚠ THE SHOWDOWN BAND SETS `light`, AND IT LEAKS
//
// The pool screen sets `style="light"` because the Showdown band is dark in
// BOTH app themes — correct there, and wrong on every light screen pushed on
// top of it. `expo-status-bar` has no per-screen scoping: the last call wins,
// process-wide.
//
// Two things make that worse than it sounds:
//
//   · `<StatusBar>` applies its style on MOUNT and on a style CHANGE. It does
//     not re-apply when a screen is returned to, so the screen underneath never
//     gets its bar back on the way out.
//   · a native `Modal` resets the bar on iOS, so a popup over a dark surface
//     silently loses the light glyphs it needs.
//
// ## ⚠⚠ `'auto'` IS ALMOST ALWAYS THE RIGHT ANSWER, AND `'dark'` ALMOST NEVER IS
//
// Nearly every screen in this app sits on `theme.colors.snow`, which is
// `#F7F8FC` in light mode and `#121520` in DARK. Hardcoding `'dark'` fixes the
// light-mode screenshot in front of you and breaks dark mode exactly as badly —
// black glyphs on near-black. That very nearly shipped on the decision page.
//
// `'auto'` follows `useColorScheme()`, and `useTheme` resolves `snow` from the
// same `useColorScheme()` with no independent override, so the two cannot
// disagree. Pass an explicit style ONLY for a surface whose colour does not
// follow the theme at all — the Showdown band (always dark) and the recap
// scrim (always `rgba(4,6,16,0.72)`) are the only two in the app today.
//
// ## ⚠ EVERY SCREEN ASSERTS ITS OWN, ON FOCUS
//
// No screen restores anybody else's. A page that set the bar back on its way
// out would have to know which screen it came from and what that screen wanted
// — the decision page would need to know whether the pool behind it is a
// Showdown. The screen that owns the answer gives it, every time it is focused.
// =============================================================

import { useFocusEffect } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';

/** The subset of `expo-status-bar` styles worth asking for by name. */
export type ScreenStatusBarStyle = 'auto' | 'light' | 'dark';

/**
 * Claim the status bar for as long as this screen is focused.
 *
 * ⚠ CALL IT UNCONDITIONALLY, like any hook — pass the style rather than
 * skipping the call. A screen that only asserts sometimes leaves whatever the
 * previous screen set, which is the bug this exists to end.
 *
 * ⚠ THE DECLARATIVE `<StatusBar>` IS STILL WORTH RENDERING ALONGSIDE IT on a
 * screen that can be the first thing painted: this fires on focus, and focus
 * can land a frame after the first paint.
 */
export function useScreenStatusBar(style: ScreenStatusBarStyle = 'auto') {
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(style, true);
    }, [style]),
  );
}
