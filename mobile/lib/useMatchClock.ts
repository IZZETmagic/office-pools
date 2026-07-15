import { useEffect, useRef, useState } from 'react';

export type MatchClockInput = {
  status?: string | null;
  livePeriod?: string | null;
  liveMinute?: number | null;
  liveAdded?: number | null;
};

function pad2(n: number): string {
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
export function useMatchClock(m: MatchClockInput): string | null {
  const isLive = m.status === 'live';
  const period = m.livePeriod ?? null;
  const minute = m.liveMinute ?? null;
  const added = m.liveAdded ?? null;

  // Frozen phases (and the pre-minute window) don't tick — don't spin an interval.
  const frozen = period === 'HT' || period === 'PEN';
  const ticking = isLive && !frozen && minute != null;

  const [seconds, setSeconds] = useState(0);
  const anchorRef = useRef(0);

  // Re-anchor to :00 whenever the feed advances the minute or stoppage (or the
  // match transitions), so the local count restarts from each confirmed value.
  useEffect(() => {
    anchorRef.current = Date.now();
    setSeconds(0);
  }, [minute, added, period, isLive]);

  useEffect(() => {
    if (!ticking) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - anchorRef.current) / 1000);
      setSeconds(elapsed < 0 ? 0 : elapsed > 59 ? 59 : elapsed);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ticking]);

  if (!isLive) return null;
  if (period === 'HT') return 'HT';
  if (period === 'PEN') return 'PENS';
  if (minute == null) return period === 'ET' ? 'ET' : null;

  const body = period === 'ET' ? `ET ${minute}:${pad2(seconds)}` : `${minute}:${pad2(seconds)}`;
  return added != null && added > 0 ? `${body} +${added}` : body;
}
