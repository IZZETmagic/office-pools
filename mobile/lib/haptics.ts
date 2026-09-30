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
// ⚠⚠ BUT ONLY FIVE CONSTANTS ARE SAFE AT OUR minSdk. `HapticsRecord.kt`
// resolves them by REFLECTION and only CLOCK_TICK, CONTEXT_CLICK,
// KEYBOARD_TAP, LONG_PRESS and VIRTUAL_KEY have a fallback for older API
// levels; everything else (Confirm, Reject, Toggle_On…) is API 30/34+ and
// throws HapticsNotSupportedException below that. Expo 54 ships minSdk 24, so
// the nicer-sounding ones would misfire on real devices in the install base.
// Where this file wants one, it gates on the API level rather than catching
// the throw, so the control flow stays readable.
//
// ⭐ EVERY EXPORT SWALLOWS ITS OWN FAILURE. A device with no haptics engine
// rejects, and a missing buzz must never surface as an unhandled rejection or
// interrupt the interaction it was decorating. Callers fire and forget.

/** `Platform.Version` is the API level on Android, a version string on iOS. */
const ANDROID_API = Platform.OS === 'android' ? Number(Platform.Version) : 0;

function fire(run: () => Promise<void>): void {
  try {
    run().catch(() => {});
  } catch {
    // A synchronous throw from the bridge — same policy as a rejection.
  }
}

/**
 * The lightest tick, for moving through a set: a swatch in a row of 22, a tile
 * in a grid of 25.
 *
 * ⭐ This is the one that must stay FEATHER-LIGHT. Browsing skin tones is
 * eight taps in three seconds, and eight overlapping impacts on a cheap
 * rotating-mass motor is a rattle rather than feedback. iOS's selection
 * generator is built for exactly this; `Clock_Tick` is the Android constant a
 * time picker uses while scrubbing, and the lightest of the five that are safe
 * at minSdk 24.
 */
export function hapticSelection(): void {
  fire(() =>
    Platform.OS === 'ios'
      ? Haptics.selectionAsync()
      : Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick),
  );
}

/**
 * A discrete press of a control — a tab, a segment, a step in a rail.
 *
 * ⚠ Deliberately firmer than `hapticSelection`. A tab tap is one decision that
 * moves you somewhere; a swatch tap is one of many while you browse. Giving
 * both the same weight is what makes an over-hapticked app feel cheap.
 */
export function hapticPress(): void {
  fire(() =>
    Platform.OS === 'ios'
      ? Haptics.selectionAsync()
      : Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click),
  );
}

/**
 * A commit landed — the thing you pressed Done on is now saved.
 *
 * ⭐ THE ONLY PLACE A HEAVIER, PATTERNED BUZZ IS EARNED. It is terminal and it
 * involved a network round trip, so it is the one moment a member benefits
 * from feeling something distinguishable from a tick rather than louder.
 *
 * ⚠ Android takes the Vibrator path below API 30 on purpose. `Confirm` is the
 * better effect where it exists, but the two-pulse waveform is the only way to
 * get a PATTERN (rather than another single tick) on API 24–29, and a commit
 * that feels identical to a swatch tap defeats the point of marking it.
 */
export function hapticSuccess(): void {
  fire(() =>
    Platform.OS === 'android' && ANDROID_API >= 30
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}

/** A commit was refused or failed. Same reasoning as {@link hapticSuccess}. */
export function hapticFailure(): void {
  fire(() =>
    Platform.OS === 'android' && ANDROID_API >= 30
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  );
}

/**
 * An object has been picked up to be moved — the moment a long press on a drag
 * handle takes hold.
 *
 * ⭐⭐ THIS ONE IS NOT DECORATION. A drag handle with `delayLongPress` has no
 * other way to tell you the hold registered: until the row lifts, a member who
 * pressed 200ms and a member who pressed 20ms see the same screen. The buzz IS
 * the affordance, which is why `BracketPickerWizard` has always had it and why
 * `TablePicker` reads as unresponsive without it.
 *
 * ⚠ `Drag_Start` is the exact constant for this but it is API 34+, so older
 * devices take `Long_Press` — which is one of the five with a fallback and is
 * the literal gesture being performed anyway.
 */
export function hapticDragStart(): void {
  fire(() =>
    Platform.OS === 'ios'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.performAndroidHapticsAsync(
          ANDROID_API >= 34 ? Haptics.AndroidHaptics.Drag_Start : Haptics.AndroidHaptics.Long_Press,
        ),
  );
}

/**
 * A long press opened something — a reaction picker, a context menu.
 *
 * ⚠ Firmer than {@link hapticDragStart} on iOS on purpose, and the weight is
 * inherited rather than invented: `app/pool/[id]/banter.tsx` has always used a
 * Medium impact for the bubble long-press, and the point of routing it through
 * here is that `BanterSheet` — the same gesture on the same message, in the
 * sheet instead of the screen — feels identical.
 */
export function hapticLongPress(): void {
  fire(() =>
    Platform.OS === 'ios'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      : Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press),
  );
}

/**
 * You are about to do something destructive, or you just undid something.
 *
 * ⚠ BOTH PLATFORMS TAKE THE WAVEFORM PATH, unlike everything above, and it is
 * deliberate: this needs to be a two-pulse RHYTHM rather than another single
 * tick, and there is no patterned HapticFeedbackConstant that is safe at
 * minSdk 24. `Reject` would be closer on API 30+ but it means "that failed",
 * not "are you sure" — see {@link hapticFailure} for the failure case.
 */
export function hapticWarning(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
