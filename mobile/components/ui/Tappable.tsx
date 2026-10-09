import { Pressable as RNPressable, type PressableProps } from 'react-native';

import { hapticTap, playFeel, type FeelName } from '@/lib/haptics';

// =============================================================
// Pressable, but it answers your finger
// =============================================================
// Ryan: *"anything that can be interacted with needs a haptic feedback"* — said
// twice, the second time after hearing the case against it. So this is the
// app's Pressable, and it buzzes. Every screen imports `Pressable` from
// `@/components/ui` instead of from `react-native`, which is 507 handlers
// across 135 files, and `pressableImport.guard.test.ts` fails the build if a
// new file reaches past it to the raw one.
//
// ⭐⭐ WHY A PRIMITIVE AND NOT 507 EDITS. A policy applied by hand at every call
// site is a policy that decays — the next screen somebody writes will forget,
// and nothing will say so. Applied here, the default is inherited, the
// exceptions are explicit, and changing the app's entire tap feel is one line
// in `lib/haptics.ts`. If five buzzes in eight seconds of browsing turns out to
// be too much on a real device, that is a tuning change, not a revert.
//
// ⚠⚠ THIS DEPARTS FROM BOTH PLATFORMS ON PURPOSE. Neither iOS nor Android
// buzzes on ordinary taps; Apple reserves haptics for selection changes,
// toggles, drags, thresholds and notifications. See `hapticTap` for the full
// note. It is written down so nobody later reads it as a bug.
//
// ⚠ THE DEFAULT IS THE FAINTEST FEEL WE HAVE. If every tap used `press`, the
// firm one would stop meaning "a control did something". The stronger feels
// stay earned.

export type TappableProps = PressableProps & {
  /**
   * Which feel this control uses, or `false` for silence.
   *
   * ⭐ `false` is for controls that fire their OWN haptic and would otherwise
   * double up — `TapScoreField` (a tick on tap, a warning rhythm on long-press
   * reset), `OutcomePicker`, the drag handles in `TablePicker` and
   * `BracketPickerWizard` (the pickup comes from the list's `onDragStart`, not
   * from touching the handle), and the four dialogs, which choose between a
   * press and a warning on their `destructive` flag.
   *
   * ⚠ Silence it rather than letting two haptics stack. Two in the same frame
   * do not read as "stronger" — on an Android rotating-mass motor they read as
   * one mushy buzz, which is worse than either alone.
   */
  haptic?: FeelName | false;
  // ⚠ `undefined` is not the same as `false` here. Omitting the prop means
  // "the app default", which is what 507 call sites rely on; `false` is an
  // explicit request for silence. `'tap'` is deliberately NOT accepted — it is
  // a dispatcher, not a row in the FEELS table, and tsc rejected it when the
  // first version of this file tried to use it as the default.
};

/**
 * ⚠ NAMED `Pressable` ON EXPORT, deliberately. The codemod that moved 135 files
 * over only had to change the import line — every bit of JSX in the app still
 * reads `<Pressable>`, so the diff is import statements and nothing else, and a
 * reviewer can see at a glance that no behaviour moved with it.
 */
export function Pressable({ haptic, onPress, ...rest }: TappableProps) {
  return (
    <RNPressable
      {...rest}
      // ⚠ ON PRESS, NOT PRESS-IN. A press-in fires while a finger is still
      // down, so a scroll that grazes a row would buzz without ever activating
      // it — and a list of cards is exactly where that happens. `onPress` only
      // fires on a completed tap. (The bottom nav is the one exception, in
      // `haptic-tab.tsx`, where press-in is what makes the tab bar feel quick.)
      //
      // ⚠ Pressable does not call this while `disabled`, so a dimmed control
      // stays silent with no guard of its own.
      onPress={(ev) => {
        if (haptic === undefined) hapticTap();
        else if (haptic) playFeel(haptic);
        onPress?.(ev);
      }}
    />
  );
}
