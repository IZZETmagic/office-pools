// =============================================================
// THE SHOWDOWN CLOCK'S FACE — three bands, lettered units
// =============================================================
// ⚠ A HAND COPY of `lib/countdownFormat.ts` on the web, because mobile is its
// own npm project and cannot import it. The reasoning for the bands lives
// there; `mobile/lib/__tests__/countdownFormat.test.ts` runs both copies
// against one table, so change them together or that test fails.
//
//     2d 04h 11m   →   4h 11m 09s   →   11m 09s 83
//
// The one difference is the `'worklet'` directives: `CountdownText` formats on
// the UI thread, so everything here has to be callable there. A workletised
// function stays callable from JS as well.
//
// ⚠ PURE ON PURPOSE — no `react-native-reanimated` import. The root vitest
// config cannot resolve it, and this file is what that test imports.
// =============================================================

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Which of the three faces `ms` is shown in. The width changes between them. */
export type CountdownBand = 'days' | 'hours' | 'minutes';

export function countdownBand(ms: number): CountdownBand {
  'worklet';
  return ms >= DAY ? 'days' : ms >= HOUR ? 'hours' : 'minutes';
}

function pad(n: number): string {
  'worklet';
  return String(n).padStart(2, '0');
}

/** `2d 04h 11m`, `4h 11m 09s`, or `11m 09s 83`. Floored; below zero reads as zero. */
export function formatCountdown(ms: number): string {
  'worklet';
  // `|| 0`: a missing target is NaN, and NaN reads as zero rather than `NaNm`.
  const t = Math.max(0, Math.floor(ms)) || 0;
  const s = Math.floor(t / 1000);
  if (t >= DAY) {
    return `${Math.floor(s / 86400)}d ${pad(Math.floor((s % 86400) / 3600))}h ${pad(Math.floor((s % 3600) / 60))}m`;
  }
  if (t >= HOUR) {
    return `${Math.floor(s / 3600)}h ${pad(Math.floor((s % 3600) / 60))}m ${pad(s % 60)}s`;
  }
  return `${Math.floor(s / 60)}m ${pad(s % 60)}s ${pad(Math.floor((t % 1000) / 10))}`;
}
