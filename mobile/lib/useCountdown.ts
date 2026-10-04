import { useIsFocused } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { countdownBand } from './countdownFormat';

// =============================================================
// ONE TICKING CLOCK, AND IT DOES NOT RE-RENDER
// =============================================================
// The Showdown surfaces run two countdowns at once — the sealed band's
// "opponent opens in", and the duel header's "first game in" — and they were
// about to become two implementations of the same second.
//
// ## ⚠ IT COUNTS DOWN TO A TARGET. IT DOES NOT WORK ONE OUT.
//
// Every instant this counts to comes from the server: the reveal from
// `league_duel_reveals_at` (migration 127) and the kickoff from
// `league_matchweeks.first_kickoff_at`. Migration 127 exists precisely because
// a front end re-derived the first of those and spent a fortnight counting down
// accurately to the wrong matchweek. A hook that renders a clock is allowed;
// one that decides what the clock is for is not.
//
// ## ⚠⚠ AND IT TICKS ON A SHARED VALUE, NEVER IN STATE
//
// This used to be `useState` + `setInterval`, re-rendering once a second. That
// is a React commit once a second — and on iOS a React commit STALLS every
// Reanimated animation until it has mounted.
//
// `ReanimatedCommitHook.cpp:96`: when a commit arrives that Reanimated did not
// originate, it merges the current animated props in and then calls
// `pauseReanimatedCommits()`, which holds until `ReanimatedMountHook.cpp:50`
// unpauses at mount. While paused, `performOperations` returns early and the
// animated value for those frames is NEVER APPLIED. The source says why in a
// comment: not pausing "could lead to RN commits being delayed until the
// animation is finished (very bad)". It is a deliberate trade — commits win,
// animations stall.
//
// There is no escape hatch on this version: the direct-to-view fast path in
// `ReanimatedModuleProxy.cpp` is inside `#ifdef ANDROID` (lines 695-1100), so
// iOS has nothing to fall back on. Reanimated 4.7.0 adds an `#if __APPLE__`
// branch that fixes it properly, but Expo SDK 54 pins `~4.1.1`.
//
// So the Showdown band — whose `translateY` follows the scroll 1:1 — froze for a
// frame and jumped, once a second, the whole time you dragged. The clock did not
// have to be EXPENSIVE to do that. It only had to commit.
//
// ⚠ THE RULE THIS ENCODES: on a surface that animates from scroll, no React
// commits while the finger is down. Not "cheap renders" — none. A shared-value
// write is Reanimated's own commit, which the hook above does not pause.
//
// ⚠ SO NOTHING HERE MAY GO BACK TO RETURNING THE NUMBER. `running` is a boolean
// that flips at most once per target, for callers that need to choose between a
// clock and a sentence. The digits belong to `CountdownText`, which reads the
// shared value on the UI thread.
//
// ## ⭐ THE FINAL HOUR TICKS EVERY FRAME — Ryan, 2026-10-04
//
// Inside the hour the face is `11m 09s 83`, and hundredths on a once-a-second
// tick would sit still for a second and then jump. So below the hour a
// `useFrameCallback` takes over the shared value and the JS interval stops
// writing it. Still no React commit; the UI thread does all of it.
//
// ⚠ IT READS THE WALL CLOCK EVERY FRAME rather than running a `withTiming` to
// zero. An animation measures from frame timestamps, which stop while the phone
// is asleep — lock the screen for ten minutes and a timing would wake ten
// minutes behind. `Date.now()` per frame cannot fall behind.
//
// ⚠ AND IT STOPS WHEN THE SCREEN IS NOT FOCUSED. The pool screen stays mounted
// under a pushed duel screen, and both carry the header — a clock nobody can
// see would otherwise redraw sixty times a second for an hour.
//
// ⚠ TWO MORE COMMITS PER TARGET, AT MOST, and that is what the width needs. The
// three faces are different widths, and `CountdownText` sizes its box from a
// render — so crossing into the next band has to commit once to re-measure. The
// crossings are at known instants (a day out, an hour out), not once a second.
// =============================================================

const HOUR = 3_600_000;

/**
 * Milliseconds left on `target`, floored at zero. `NaN` target reads as expired.
 */
function msLeft(target: number): number {
  return Number.isNaN(target) ? 0 : Math.max(0, target - Date.now());
}

/** What the last render was told: which instant, whether it has passed, and which face it wears. */
function reading(target: number) {
  const ms = msLeft(target);
  return { target, expired: ms <= 0, band: countdownBand(ms) };
}

export type CountdownClock = {
  /**
   * Milliseconds remaining — once a second above the hour, every frame below it.
   *
   * ⚠ READ IT FROM A WORKLET, not from render — that is the entire point. See
   * `CountdownText`.
   */
  remaining: SharedValue<number>;
  /**
   * The instant being counted to, as epoch ms. `NaN` when there is no target.
   *
   * ⚠ IT IS EXPOSED SO `CountdownText` CAN SIZE ITSELF without reading the shared
   * value during render. See the note on its sizer.
   */
  target: number;
  /**
   * Is there still time on the clock?
   *
   * False when there is no target at all AND once the target has passed, because
   * both callers treat those the same way: they fall back to a sentence. Flips
   * at most once while a target is current, so it costs one commit rather than
   * one a second.
   */
  running: boolean;
};

export function useCountdownClock(iso: string | null | undefined): CountdownClock {
  const target = iso ? Date.parse(iso) : NaN;
  // ⚠ SEEDED AT MOUNT so the first paint has real digits. A shared value's
  // initialiser runs once; the effect below owns every value after it.
  const remaining = useSharedValue(msLeft(target));
  // ⚠ THE FRAME CALLBACK READS THE TARGET FROM HERE, not from its closure. Its
  // closure is re-registered whenever this component renders, which is rarely
  // and never on the target's schedule; a shared value is always current.
  const targetAt = useSharedValue(target);

  /**
   * ⚠ KEYED ON THE TARGET AND ADJUSTED DURING RENDER — React's documented
   * pattern for deriving state from changed props, and the same one
   * `app/pool/[id].tsx` uses to land a pool on its first tab.
   *
   * An effect would commit the correct branch one frame LATE, which on a target
   * change is a visible flash of "9 to play" where a clock belongs. React
   * discards this render and re-runs immediately, so nothing is ever painted
   * holding the old answer.
   *
   * `band` is in here only so that crossing one re-renders `CountdownText` and
   * re-measures its box — see the header. Nothing reads it.
   */
  const [seen, setSeen] = useState(() => reading(target));
  /**
   * ⚠⚠ `Object.is`, NOT `!==`, AND IT SHIPPED BROKEN ONCE FOR WANT OF IT.
   *
   * `target` is `NaN` whenever there is nothing to count to — a sealed week
   * before the hold has a floor, a settled duel, a bye. And `NaN !== NaN` is
   * ALWAYS TRUE, so the guard fired on every render, which set state, which
   * rendered: "Too many re-renders" on the Showdown band in every phase that has
   * no clock, which is most of them.
   *
   * `Object.is` treats `NaN` as equal to itself. It is also what React uses for
   * its own state bail-out, so this comparison and React's now agree — which is
   * the real reason to reach for it rather than special-casing `Number.isNaN`.
   */
  if (!Object.is(seen.target, target)) setSeen(reading(target));

  const focused = useIsFocused();

  /** The final hour's tick. Off until the effect below turns it on. */
  const frames = useFrameCallback(() => {
    'worklet';
    remaining.set(Math.max(0, targetAt.get() - Date.now()));
  }, false);

  useEffect(() => {
    if (Number.isNaN(target) || !focused) return;
    targetAt.set(target);

    /**
     * Tell React what it needs to know, and nothing else. The updater returns
     * the same object when the band and the expiry are unchanged, so React
     * bails out; it only ever commits on a crossing.
     */
    const land = (ms: number) => {
      const next = { target, expired: ms <= 0, band: countdownBand(ms) };
      setSeen((s) => (s.expired === next.expired && s.band === next.band ? s : next));
    };

    let ms = msLeft(target);
    // ⚠ Straight away, not on the first tick: on a refocus the shared value
    // still holds whatever it read when the screen was left.
    remaining.set(ms);
    land(ms);
    if (ms <= 0) return;

    let band = countdownBand(ms);
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const startFrames = (left: number) => {
      frames.setActive(true);
      // ⚠ To the millisecond, so the sentence replaces the clock as it reaches
      // zero rather than up to a second after. The interval stays on as the
      // backstop in case a sleeping phone holds this timer back.
      expiry = setTimeout(finish, left);
    };
    const finish = () => {
      clearInterval(id);
      clearTimeout(expiry);
      frames.setActive(false);
      remaining.set(0);
      // The commit this hook was always allowed: at zero the caller swaps the
      // digits for a sentence.
      land(0);
    };

    // ⚠ Cleared on unmount. These live inside a tab pager where several screens
    // stay mounted off-view; a timer per mounted copy is how a list of pools
    // ends up ticking a dozen times a second in the background.
    const id = setInterval(() => {
      ms = msLeft(target);
      if (ms <= 0) return finish();
      // Inside the hour the frame callback owns the digits.
      if (band === 'minutes') return;
      // ⚠⚠ A SHARED-VALUE WRITE, NOT A `setState`. See the header — this line is
      // the whole fix, and turning it back into state re-breaks the band.
      remaining.set(ms);
      const now = countdownBand(ms);
      if (now !== band) {
        band = now;
        land(ms);
        if (band === 'minutes') startFrames(ms);
      }
    }, 1000);
    if (band === 'minutes') startFrames(ms);

    return () => {
      clearInterval(id);
      clearTimeout(expiry);
      frames.setActive(false);
    };
    // ⚠ `remaining`, `targetAt` and `frames` are stable refs; `target` and
    // `focused` are the real dependencies. Re-reading `Date.now()` on every tick
    // and every frame is what makes this self-correcting after the app has been
    // backgrounded, so no AppState listener is needed.
  }, [target, focused, remaining, targetAt, frames]);

  return { remaining, target, running: !Number.isNaN(target) && !seen.expired };
}
