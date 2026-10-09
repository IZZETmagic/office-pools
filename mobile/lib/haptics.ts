import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// =============================================================
// Haptics
// =============================================================
// One place for every buzz in the app, because the two platforms want
// genuinely different calls and the choice is not obvious at a call site.
//
// ⚠⚠ ANDROID HAS TWO ENGINES AND THEY ARE NOT EQUIVALENT.
//
//   1. `impactAsync` / `selectionAsync` / `notificationAsync` write a RAW
//      WAVEFORM to the Vibrator (`HapticsModule.kt` → `createWaveform`).
//      Expo's own doc comment on `impactAsync` says this "is not recommended
//      for implementing haptics feedback". It needs the VIBRATE permission and
//      it does NOT go through the user's system touch-feedback setting — a
//      member who has turned touch feedback off still gets buzzed.
//
//   2. `performAndroidHapticsAsync` calls `View.performHapticFeedback()` with
//      the platform's own HapticFeedbackConstants, so the OEM's tuned effect
//      plays and the system setting is honoured. This is the one to use.
//
// ⚠⚠ BUT MOST CONSTANTS ARE NOT SAFE AT OUR minSdk. `HapticsRecord.kt`
// resolves them by REFLECTION, and only five — CLOCK_TICK, CONTEXT_CLICK,
// KEYBOARD_TAP, LONG_PRESS, VIRTUAL_KEY — have a fallback for older API
// levels. Everything else throws HapticsNotSupportedException below the level
// that introduced it.
//
// ⚠ AND WE CANNOT CONFIRM WHAT OUR minSdk ACTUALLY IS. There is no
// `expo-build-properties` in `app.json`, so it is whatever Expo 54's prebuild
// template sets, and that template is not present in a managed checkout. So
// this file does not depend on the number: every ladder below ENDS in a rung
// that works at any API level, and `haptics.guard.test.ts` fails the build if
// one ever does not.
//
// ⭐⭐ WHY A TABLE AND NOT SEVEN FUNCTIONS. The first version of this file was
// seven hand-rolled ternaries, and two of them quietly collided:
//
//   · `hapticSelection` and `hapticPress` BOTH called `selectionAsync()` on
//     iOS. The pickem screen was built to feel firmer on the matchweek arrow
//     than on a club — a distinction that did not exist on any iPhone.
//   · `hapticDragStart` and `hapticLongPress` both fell to `Long_Press` below
//     API 34, so picking a club up felt the same as opening a menu.
//
// Neither was visible by reading one function; both are obvious when the calls
// sit in one table. That is the whole reason for the shape, and the guard test
// now asserts no two feels resolve alike on either platform.
//
// ⭐ EVERY EXPORT SWALLOWS ITS OWN FAILURE. A device with no haptics engine
// rejects, and a missing buzz must never surface as an unhandled rejection or
// interrupt the interaction it was decorating. Callers fire and forget.
//
// ⚠ NOTHING HERE MAY SET STATE. Several callers are Reanimated worklets
// hopping back via `runOnJS`, and on iOS with Reanimated 4.1.x any React
// commit stalls a running animation — so a haptic that re-rendered would kill
// the drag it was decorating. These are all fire-and-forget by construction;
// keep it that way.
// =============================================================

/** `Platform.Version` is the API level on Android, a version string on iOS. */
const ANDROID_API = Platform.OS === 'android' ? Number(Platform.Version) : 0;

/**
 * The five constants `HapticsRecord.kt` can resolve at ANY API level, because
 * they are the only ones with an explicit `when` fallback when reflection
 * misses. A ladder's terminal rung must be one of these, or a pattern.
 */
type AlwaysSafeConstant =
  | Haptics.AndroidHaptics.Clock_Tick
  | Haptics.AndroidHaptics.Context_Click
  | Haptics.AndroidHaptics.Keyboard_Tap
  | Haptics.AndroidHaptics.Long_Press
  | Haptics.AndroidHaptics.Virtual_Key;

/** A rung that only applies at or above `minApi`. */
type GatedRung = { minApi: number; constant: Haptics.AndroidHaptics };

/**
 * The bottom of a ladder. Either one of the five safe constants, or a raw
 * Vibrator pattern — which always works, and is the only way to get a RHYTHM
 * rather than a single tap on a device too old for `Confirm`/`Reject`.
 */
type TerminalRung = { constant: AlwaysSafeConstant } | { pattern: Haptics.NotificationFeedbackType };

/** Highest API first; the last entry is reached by every device. */
type AndroidLadder = readonly [...GatedRung[], TerminalRung];

type Feel = {
  /** iOS goes straight to the generator UIKit provides for the intent. */
  ios: () => Promise<void>;
  android: AndroidLadder;
};

const A = Haptics.AndroidHaptics;
const IMPACT = Haptics.ImpactFeedbackStyle;
const NOTIFY = Haptics.NotificationFeedbackType;

/**
 * ⭐⭐ READ THIS TABLE DOWN THE `ios` COLUMN AND DOWN EACH LADDER. Every value
 * in a column must be distinct, because two feels that resolve to the same
 * call are one feel wearing two names — which is exactly the bug this shape
 * exists to prevent. `haptics.guard.test.ts` checks it at API 24, 30 and 34.
 */
const FEELS = {
  /**
   * The lightest tick, for moving through a set: a swatch in a row of 22, a
   * club in a fixture card, a tile in a grid of 25.
   *
   * ⭐ MUST STAY FEATHER-LIGHT. Browsing skin tones is eight taps in three
   * seconds, and eight overlapping impacts on a cheap rotating-mass motor is a
   * rattle rather than feedback. iOS's selection generator is built for this;
   * `Clock_Tick` is what an Android time picker uses while scrubbing.
   */
  selection: {
    ios: () => Haptics.selectionAsync(),
    android: [{ constant: A.Clock_Tick }],
  },

  /**
   * A discrete press of a control — a tab, a segment, a matchweek arrow.
   *
   * ⚠⚠ `Rigid`, NOT `selectionAsync`. This used to be `selectionAsync()`,
   * identical to `selection` above, which made the whole "firmer for
   * navigation, lighter for picking" design a no-op on iOS. Rigid is a sharp,
   * low-give tap — a different TEXTURE from the selection tick rather than a
   * louder version of it, which is what makes the two tellable apart.
   */
  press: {
    ios: () => Haptics.impactAsync(IMPACT.Rigid),
    android: [{ constant: A.Context_Click }],
  },

  /**
   * An object has been picked up to be moved — the moment a long press on a
   * drag handle takes hold.
   *
   * ⭐⭐ NOT DECORATION. A drag handle with `delayLongPress` has no other way
   * to say the hold registered: until the row lifts, a member who pressed
   * 200ms and one who pressed 20ms see the same screen. The buzz IS the
   * affordance.
   *
   * ⚠ `Gesture_Start` is the middle rung for a reason. `Drag_Start` is the
   * exact constant but it is API 34+, and dropping straight to `Long_Press`
   * made this identical to `longPress` below on every device under 34.
   */
  dragStart: {
    ios: () => Haptics.impactAsync(IMPACT.Light),
    android: [
      { minApi: 34, constant: A.Drag_Start },
      { minApi: 30, constant: A.Gesture_Start },
      { constant: A.Virtual_Key },
    ],
  },

  /**
   * A long press opened something — a reaction picker, a context menu.
   *
   * ⚠ The weight is inherited, not invented: `app/pool/[id]/banter.tsx` used a
   * Medium impact for the bubble long-press long before this file existed, and
   * the point of routing it through here is that `BanterSheet` — the same
   * gesture on the same message — feels identical.
   */
  longPress: {
    ios: () => Haptics.impactAsync(IMPACT.Medium),
    android: [{ constant: A.Long_Press }],
  },

  /** A commit landed — the thing you pressed Done on is saved. */
  success: {
    ios: () => Haptics.notificationAsync(NOTIFY.Success),
    android: [{ minApi: 30, constant: A.Confirm }, { pattern: NOTIFY.Success }],
  },

  /** A commit was refused or failed. */
  failure: {
    ios: () => Haptics.notificationAsync(NOTIFY.Error),
    android: [{ minApi: 30, constant: A.Reject }, { pattern: NOTIFY.Error }],
  },

  /**
   * You are about to do something destructive, or you just undid something.
   *
   * ⚠ Terminates straight into a pattern on BOTH platforms, unlike everything
   * above. This needs to be a two-pulse RHYTHM rather than another single tap,
   * and no HapticFeedbackConstant is a rhythm. `Reject` would be closer on API
   * 30+ but it means "that failed", not "are you sure" — which is `failure`.
   */
  warning: {
    ios: () => Haptics.notificationAsync(NOTIFY.Warning),
    android: [{ pattern: NOTIFY.Warning }],
  },
} as const satisfies Record<string, Feel>;

export type FeelName = keyof typeof FEELS;

/**
 * The first rung this device satisfies. Exported for the guard test, which
 * walks every ladder at API 24, 30 and 34 looking for collisions.
 */
export function resolveAndroidRung(ladder: AndroidLadder, api: number): GatedRung | TerminalRung {
  for (const rung of ladder) {
    if (!('minApi' in rung) || api >= rung.minApi) return rung;
  }
  // Unreachable: the type makes the last rung terminal and ungated.
  return ladder[ladder.length - 1] as TerminalRung;
}

function play(name: FeelName): void {
  const feel: Feel = FEELS[name];
  try {
    const run =
      Platform.OS === 'ios'
        ? feel.ios()
        : (() => {
            const rung = resolveAndroidRung(feel.android, ANDROID_API);
            return 'pattern' in rung
              ? Haptics.notificationAsync(rung.pattern)
              : Haptics.performAndroidHapticsAsync(rung.constant);
          })();
    run.catch(() => {});
  } catch {
    // A synchronous throw from the bridge — same policy as a rejection.
  }
}

// The call sites keep plain named functions rather than `play('selection')`:
// several are handed to `runOnJS` from a worklet, where a bare reference is
// clearer than a closure, and a named import is what makes a grep for
// `hapticWarning` find every destructive confirm in the app.

/** @see FEELS.selection */
export function hapticSelection(): void {
  play('selection');
}

/** @see FEELS.press */
export function hapticPress(): void {
  play('press');
}

/** @see FEELS.dragStart */
export function hapticDragStart(): void {
  play('dragStart');
}

/** @see FEELS.longPress */
export function hapticLongPress(): void {
  play('longPress');
}

/** @see FEELS.success */
export function hapticSuccess(): void {
  play('success');
}

/** @see FEELS.failure */
export function hapticFailure(): void {
  play('failure');
}

/** @see FEELS.warning */
export function hapticWarning(): void {
  play('warning');
}

/** Exported for the guard test only — not a call site API. */
export const __FEELS_FOR_TEST = FEELS;
