// =============================================================
// THE SHOWDOWN CLOCK'S FACE — three bands, lettered units
// =============================================================
// Ryan, 2026-10-04: days, hours and minutes while it is more than a day away;
// hours, minutes and seconds inside the day; minutes, seconds and hundredths
// inside the hour, running down to zero.
//
//     2d 04h 11m   →   4h 11m 09s   →   11m 09s 83
//
// ⚠ THIS REVERSES 2026-08-31's "hours, no days" (c3b06cc4), deliberately. That
// call was about `1d 21:21:54`, a day count glued to a clock in a different
// unit. Every field here carries its own letter, and every band is the same
// shape — three fields, the largest unpadded — so nothing has to be converted
// in your head.
//
// ⚠ LETTERS, NOT COLONS, BECAUSE THE BANDS WOULD OTHERWISE COLLIDE. `02:04:11`
// is two days on one band and two hours on the next; only the letter says which.
//
// ⚠ MIRRORED in `mobile/lib/countdownFormat.ts`, which mobile cannot import from
// here. `mobile/lib/__tests__/countdownFormat.test.ts` runs both against one
// table, so they cannot drift apart without a failing test.
//
// ⚠ IT FORMATS A DURATION. IT DOES NOT DECIDE WHAT IS BEING COUNTED TO, and it
// does not decide what to show once the clock has run out — every caller swaps
// the digits for a sentence at zero. Below zero it reads as zero.
// =============================================================

const HOUR = 3_600_000
const DAY = 86_400_000

/** Which of the three faces `ms` is shown in. The width changes between them. */
export type CountdownBand = 'days' | 'hours' | 'minutes'

export function countdownBand(ms: number): CountdownBand {
  return ms >= DAY ? 'days' : ms >= HOUR ? 'hours' : 'minutes'
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * `2d 04h 11m`, `4h 11m 09s`, or `11m 09s 83`.
 *
 * ⚠ FLOORED, every field — a clock that rounds up shows `0m 00s 01` for a
 * moment that has already gone. The hundredths are bare digits on purpose:
 * Ryan picked that face, and `cs` would be one more letter for a field that
 * never stops moving.
 */
export function formatCountdown(ms: number): string {
  // `|| 0`: a missing target is NaN, and NaN reads as zero rather than `NaNm`.
  const t = Math.max(0, Math.floor(ms)) || 0
  const s = Math.floor(t / 1000)
  if (t >= DAY) {
    return `${Math.floor(s / 86400)}d ${pad(Math.floor((s % 86400) / 3600))}h ${pad(Math.floor((s % 3600) / 60))}m`
  }
  if (t >= HOUR) {
    return `${Math.floor(s / 3600)}h ${pad(Math.floor((s % 3600) / 60))}m ${pad(s % 60)}s`
  }
  return `${Math.floor(s / 60)}m ${pad(s % 60)}s ${pad(Math.floor((t % 1000) / 10))}`
}
