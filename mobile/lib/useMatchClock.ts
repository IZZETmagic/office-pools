import { useEffect, useRef } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

export type MatchClockInput = {
  status?: string | null;
  livePeriod?: string | null;
  liveMinute?: number | null;
  liveAdded?: number | null;
};

/**
 * ⚠ WORKLET-MARKED, because the clock's seconds are formatted on the UI thread.
 * Still callable from JS — a workletised function is not confined to the UI
 * runtime. `lib/useCountdown.ts` does the same for its formatters.
 */
export function pad2(n: number): string {
  'worklet';
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Live match clock with locally-estimated seconds.
 *
 * The feed (api-football) only reports a whole minute — `elapsed` — refreshed by
 * the sync roughly once a minute; there are no real seconds. So seconds are
 * interpolated on-device: they tick 00→59 from the moment a new minute/stoppage
 * value arrives, and clamp at :59 so we never overshoot into a minute the feed
 * hasn't confirmed (a late sync just stalls at :59 instead of showing a wrong
 * minute). Each real update re-anchors the count to :00. This is an estimate —
 * it can sit up to a minute behind and will snap when the sync lands.
 *
 * Output:
 *   - 1H / 2H:        "67:23"        (running minute + estimated seconds)
 *   - end of a half:  "45:23 +2"     (minute holds, stoppage shown alongside)
 *   - extra time:     "ET 105:23"    (keeps counting 91→120), "ET 105:23 +2"
 *   - breaks:         "HT" / "PENS"  (frozen — no ticking)
 * Returns null when the match isn't live (or has no minute yet, outside ET).
 */
export type MatchClockParts = {
  /**
   * Estimated seconds, 0-59, advanced once a second.
   *
   * ⚠ READ IT FROM A WORKLET. That is the entire point — see below.
   */
  seconds: SharedValue<number>;
  /**
   * The whole label when it does NOT tick: `HT`, `PENS`, `ET`, or null when the
   * match is not live. Render it as ordinary text.
   */
  staticLabel: string | null;
  /** Everything before the seconds — `67:` or `ET 105:`. Null while static. */
  prefix: string | null;
  /** Everything after them — ` +2` — or the empty string. */
  suffix: string;
};

/**
 * Live match clock with locally-estimated seconds.
 *
 * ## ⚠⚠ THE SECONDS TICK ON A SHARED VALUE, NEVER IN STATE
 *
 * This used to be `useState` + `setInterval`, re-rendering once a second for the
 * whole 90 minutes. On iOS a React commit pauses Reanimated until it has
 * mounted, and the animated values for those frames are never applied — so a
 * ticking clock in the match header stalled every animation on the screen once a
 * second, including the player sheet's open spring and its inner scroll. The
 * clock did not have to be EXPENSIVE to do that; it only had to commit. The
 * mechanism is written out in full in `lib/useCountdown.ts`.
 *
 * ⚠ ONLY THE SECONDS MOVE. The minute, period and stoppage all arrive as props
 * and change rarely, so they stay in `prefix`/`suffix` as ordinary strings and a
 * real render happens when the feed advances them. That is also what keeps the
 * rendered width stable: `00`-`59` is always two characters.
 */
export function useMatchClock(m: MatchClockInput): MatchClockParts {
  const isLive = m.status === 'live';
  const period = m.livePeriod ?? null;
  const minute = m.liveMinute ?? null;
  const added = m.liveAdded ?? null;

  // Frozen phases (and the pre-minute window) don't tick — don't spin an interval.
  const frozen = period === 'HT' || period === 'PEN';
  const ticking = isLive && !frozen && minute != null;

  const seconds = useSharedValue(0);
  const anchorRef = useRef(0);

  // Re-anchor to :00 whenever the feed advances the minute or stoppage (or the
  // match transitions), so the local count restarts from each confirmed value.
  useEffect(() => {
    anchorRef.current = Date.now();
    seconds.set(0);
  }, [minute, added, period, isLive, seconds]);

  useEffect(() => {
    if (!ticking) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - anchorRef.current) / 1000);
      // ⚠⚠ A SHARED-VALUE WRITE, NOT A `setState`. This line is the fix; turning
      // it back into state re-breaks every animation on the match screen.
      seconds.set(elapsed < 0 ? 0 : elapsed > 59 ? 59 : elapsed);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ticking, seconds]);

  // ⚠ Clamped at :59 so we never overshoot into a minute the feed has not
  // confirmed — a late sync stalls at :59 rather than showing a wrong minute.
  if (!isLive) return { seconds, staticLabel: null, prefix: null, suffix: '' };
  if (period === 'HT') return { seconds, staticLabel: 'HT', prefix: null, suffix: '' };
  if (period === 'PEN') return { seconds, staticLabel: 'PENS', prefix: null, suffix: '' };
  if (minute == null) {
    return { seconds, staticLabel: period === 'ET' ? 'ET' : null, prefix: null, suffix: '' };
  }

  return {
    seconds,
    staticLabel: null,
    prefix: period === 'ET' ? `ET ${minute}:` : `${minute}:`,
    suffix: added != null && added > 0 ? ` +${added}` : '',
  };
}
