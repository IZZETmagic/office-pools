import { useMemo } from 'react';
import { useWindowDimensions, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, type ColorToken } from '@/theme';

// =============================================================
// The top of a sheet, defined once
// =============================================================
// Eight sheets in this app slide up from the bottom and every one of them was
// making the same three decisions on its own: the corner radius, the colour of
// the grab handle, and how tall to be. That is how they drifted — six gorhom
// sheets sat on the library's default `borderRadius: 15`, `PlayerStatSheet` was
// at `radii.lg` and `ReactionsSheet` on a hardcoded 20 that matched no token at
// all. A shell decision copied eight times is eight places to get it wrong.
//
// ## ⚠⚠ GORHOM'S HANDLE IS A PERCENTAGE OF A STALE SCREEN WIDTH
//
// Its default indicator is `width: (7.5 * Dimensions.get('window').width) / 100`
// — read at MODULE SCOPE, inside the library. Two consequences, and neither is
// visible on the phone it was built on:
//
//   · It SCALES WITH THE DEVICE. 29pt on a 390pt phone, 77pt on a 1024pt iPad.
//     A grab handle is a control, not a layout — it should be the same size
//     everywhere, the way a checkbox is.
//   · It NEVER UPDATES. Module scope runs once, so after a rotation, a fold, or
//     an iPad split-view resize the handle keeps the width of whatever the
//     screen was when the JS bundle loaded.
//
// Setting an explicit `width` is the only way out; the library offers no prop
// for it beyond the style.
//
// ## ⚠ THE RADIUS IS DELIBERATELY NOT RESPONSIVE
//
// 32pt is 32pt on every screen, and that is correct: a corner radius is a
// property of the SURFACE, not of the viewport. Scaling it by screen width is
// what makes a tablet look like a stretched phone.
// =============================================================

/**
 * How wide the grab handle is, everywhere.
 *
 * ⚠ A FIXED NUMBER ON PURPOSE — see the header. 40pt sits between iOS's own
 * 36pt sheet grabber and the ~29pt gorhom happened to produce on the phone this
 * was designed against, so it reads as deliberate on both a small phone and a
 * tablet.
 */
export const SHEET_HANDLE_WIDTH = 40;

/**
 * The top corners of every sheet.
 *
 * ⚠ `xl` (32) IS THE HOUSE SHEET RADIUS, and it is one step rounder than the
 * `radii.lg` cards that sit inside these sheets. The outermost surface should be
 * the roundest thing on screen; a container as sharp as its contents reads as a
 * mistake.
 *
 * ## ⚠⚠ `borderCurve: 'continuous'` IS THE POINT, NOT THE RADIUS
 *
 * React Native's `borderRadius` draws a CIRCULAR arc: the curve begins abruptly,
 * at full curvature, where it leaves the straight edge. iOS draws every system
 * surface — sheets, alerts, app icons and THE PHONE'S OWN SCREEN CORNERS — as a
 * continuous curve, which eases in. Side by side the circle looks pinched, and
 * the eye reads it as two edges that do not line up rather than as a corner of
 * the wrong size.
 *
 * ⚠ IT ONLY SHOWS WHERE THE TWO SHAPES CAN BE COMPARED, which is why this went
 * unnoticed for so long. Measured off a screenshot, 1290×2796 @3x: the Banter
 * sheet opens at `insets.top` = 59pt and a 15 Pro Max rounds its screen at
 * ~55pt, so a circular corner sits 4pt from a continuous one and the mismatch
 * is obvious. The scout sheet opens 164pt down, 109pt clear of anything, and
 * the IDENTICAL 32pt circle looks perfectly fine there.
 *
 * ⚠ TWO FIXES FAILED BEFORE THIS ONE, and both failed for the same reason: a
 * bigger circle is still a circle, and so is a lower one. The corner measured a
 * flawless 96px circle, symmetric to the pixel, every time.
 *
 * ⚠ iOS ONLY, AND SAFELY SO. Android ignores the property — no crash, no
 * warning. Android's own surfaces are circular, so there is nothing to match.
 */
export const SHEET_RADIUS: keyof ReturnType<typeof useTheme>['radii'] = 'xl';

/**
 * Background and handle for a gorhom `BottomSheet`, ready to spread.
 *
 * ⚠ BOTTOM CORNERS ARE LEFT ALONE. They are off-screen at every snap point this
 * app uses, so naming them would be stating a preference about something nobody
 * can see — and it would also override the library's own value for the
 * `detached` case, which this app does not use but might.
 */
export function useSheetChrome(background: ColorToken = 'surface'): {
  backgroundStyle: ViewStyle;
  handleIndicatorStyle: ViewStyle;
} {
  const theme = useTheme();
  return useMemo(
    () => ({
      backgroundStyle: {
        backgroundColor: theme.colors[background],
        borderTopLeftRadius: theme.radii[SHEET_RADIUS],
        borderTopRightRadius: theme.radii[SHEET_RADIUS],
        // ⚠ THE SHAPE, NOT THE SIZE — see the header.
        borderCurve: 'continuous',
      },
      handleIndicatorStyle: {
        backgroundColor: theme.colors.silver,
        width: SHEET_HANDLE_WIDTH,
      },
    }),
    [theme, background],
  );
}

/**
 * How tall a sheet should be on THIS screen, in points.
 *
 * ## ⚠⚠ WHY NOT A PERCENTAGE SNAP POINT
 *
 * `snapPoints={['88%']}` is responsive in the arithmetic sense and wrong in the
 * product sense, because the leftover is what the number is really choosing. On
 * a 932pt phone 12% leaves 112pt of the screen behind the sheet — a glimpse of
 * where you came from, which is the point. On a 568pt SE, or on ANY phone in
 * landscape, the same 12% leaves 68pt or less: too little to read as context and
 * too much to spare from a report that is already scrolling.
 *
 * So the fraction is a ceiling, `min` is a floor in POINTS, and the available
 * height wins over both. Small screens end up effectively full-height, which is
 * what every native app does there too.
 *
 * ⚠ `useWindowDimensions`, NEVER `Dimensions.get`. The hook re-renders on
 * rotation, on a fold, and on an iPad split-view drag; `Dimensions.get` in a
 * render body returns the right answer once and then lies, because nothing
 * subscribes it to a change.
 *
 * ⚠ IT SUBTRACTS THE TOP INSET, so the caller should pass `topInset={insets.top}`
 * to the sheet. The two together mean a full-height sheet stops exactly at the
 * bottom of the status bar instead of underlapping it.
 */
export function useSheetHeight(fraction: number, opts?: { min?: number }): number {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const min = opts?.min ?? 0;

  const available = Math.max(0, height - insets.top);
  return Math.round(Math.min(available, Math.max(available * fraction, min)));
}
