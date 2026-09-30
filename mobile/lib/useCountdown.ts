import { useEffect, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

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
// =============================================================

/**
 * Milliseconds left on `target`, floored at zero. `NaN` target reads as expired.
 */
function msLeft(target: number): number {
  return Number.isNaN(target) ? 0 : Math.max(0, target - Date.now());
}

export type CountdownClock = {
  /**
   * Milliseconds remaining, advanced once a second.
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

  /**
   * ⚠ KEYED ON THE TARGET AND ADJUSTED DURING RENDER — React's documented
   * pattern for deriving state from changed props, and the same one
   * `app/pool/[id].tsx` uses to land a pool on its first tab.
   *
   * An effect would commit the correct branch one frame LATE, which on a target
   * change is a visible flash of "9 to play" where a clock belongs. React
   * discards this render and re-runs immediately, so nothing is ever painted
   * holding the old answer.
   */
  const [seen, setSeen] = useState(() => ({ target, expired: msLeft(target) <= 0 }));
  if (seen.target !== target) setSeen({ target, expired: msLeft(target) <= 0 });

  useEffect(() => {
    if (Number.isNaN(target)) return;
    let ms = msLeft(target);
    remaining.set(ms);
    if (ms <= 0) return;

    // ⚠ Cleared on unmount. These live inside a tab pager where several screens
    // stay mounted off-view; a timer per mounted copy is how a list of pools
    // ends up ticking a dozen times a second in the background.
    const id = setInterval(() => {
      ms = msLeft(target);
      // ⚠⚠ A SHARED-VALUE WRITE, NOT A `setState`. See the header — this line is
      // the whole fix, and turning it back into state re-breaks the band.
      remaining.set(ms);
      if (ms <= 0) {
        clearInterval(id);
        // The one commit this hook is allowed: the moment the clock runs out,
        // its caller has to swap the digits for a sentence.
        setSeen({ target, expired: true });
      }
    }, 1000);
    return () => clearInterval(id);
    // ⚠ `remaining` is a stable ref; `target` is the real dependency. Re-reading
    // `Date.now()` on every tick is what makes this self-correcting after the app
    // has been backgrounded, so no AppState listener is needed.
  }, [target, remaining]);

  return { remaining, target, running: !Number.isNaN(target) && !seen.expired };
}

/**
 * ⚠ WORKLET-MARKED, ALL THREE, because `CountdownText` formats on the UI thread.
 * They stay callable from JS as well — a workletised function is not confined to
 * the UI runtime. `lib/showdownBeats.ts` does the same thing for the walkout.
 */
function pad(n: number): string {
  'worklet';
  return String(n).padStart(2, '0');
}

/**
 * `HH:MM:SS`, with hours ACCUMULATING past 24 — three days out reads `72:00:00`
 * rather than rolling over to `00:00:00` and looking like it has expired.
 */
export function formatHms(ms: number): string {
  'worklet';
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * `2d 04:11:09` — for waits long enough that a raw hour count stops meaning much.
 *
 * ⚠ IT HAS A CALLER AGAIN — `SealedMiddle` in `ShowdownDuelHeader`, 2026-09-06.
 * It sat unused from 2026-09-03, when the Duel tab's sealed card came out and
 * the header replaced it with a single line of text and no clock at all. The
 * note kept here then said it was retained "because the sealed card is on the
 * list to come back"; it came back into the band instead.
 *
 * ⚠ AND THE SEALED CLOCK MUST USE THIS ONE, NOT `formatHms`. The wait is a day
 * at minimum (129) and up to twenty across an international break, and
 * `formatHms` accumulates hours rather than rolling over — so it would render
 * `499:00:00`, which is technically correct and unreadable.
 */
export function formatDhms(ms: number): string {
  'worklet';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const rest = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}d ${rest}` : rest;
}
