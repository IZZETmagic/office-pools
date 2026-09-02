'use client'

// =============================================================
// THE COUNTDOWN — one clock, two faces
// =============================================================
// Lived inside app/pools/[pool_id]/DuelsTab.tsx, which was fine while the duel
// page was the only thing counting down. The pool card now counts down too, and
// a dashboard importing a 2,600-line pool tab to get a `setInterval` is how a
// bundle grows without anyone deciding to grow it.
//
// The TICK is shared and the FORMAT is a parameter, because the two surfaces
// have measurably different room — see `countdownText`.
// =============================================================

import { useEffect, useRef, useState } from 'react'


/**
 * `clock` is the duel page's — hours, minutes and seconds, always.
 * `compact` is the pool card's. See `countdownText` for why they differ.
 */
export type CountdownFormat = 'clock' | 'compact'

/**
 * How long is left, as text.
 *
 * ⚠ HOURS, NOT DAYS, in both formats. `1d 21:21:54` made the reader do
 * arithmetic to answer the only question they had — how long — and the two
 * halves were in different units, so the number stopped being scannable at a
 * glance. Hours carry all of it and keep one clock.
 *
 * ⚠ `compact` SWITCHES AT ONE HOUR, not at twelve. The pool card's tile is 54px
 * wide and its value is Geist Mono at 18px, which is 10.8px a character —
 * measured, like every other number on that card. So `01:30:07` (86.4px) never
 * fits and five characters (54.0px) is the whole budget, which is what makes a
 * two-field clock the only option. mm:ss cannot express anything past 59
 * minutes, so the handover has to be the hour: above it the seconds are noise
 * on a 48-hour hold, and below it they are the entire point.
 *
 * The bands are unambiguous only because the tile captions them — "hrs to
 * reveal" against "min to reveal". `45:00` means nothing on its own.
 */
export function countdownText(msLeft: number | null, format: CountdownFormat = 'clock'): string {
  if (msLeft === null) return ''
  if (msLeft <= 0) return 'any moment'
  const s = Math.floor(msLeft / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  // It cannot run away: the hold is 48h, floored at 24h before lock (123), so
  // the hours are two digits in every ordinary week. A postponement stalling
  // settlement (094) can push it further, and `padStart(2)` widens rather than
  // truncating — three digits is ugly and correct, which beats tidy and wrong.
  const hours = Math.floor(s / 3600)
  if (format === 'compact') {
    return s >= 3600 ? `${pad(hours)}:${pad(Math.floor((s % 3600) / 60))}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
  }
  return `${pad(hours)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/** True while `compact` is showing hours rather than minutes — the caption's cue. */
export function countdownIsHours(msLeft: number | null): boolean {
  return msLeft !== null && msLeft >= 3_600_000
}

/**
 * The tick, for callers that need more than the text — a tile captioning its
 * own clock in hours or minutes, say.
 *
 * ⚠ `msLeft` IS NULL UNTIL MOUNTED, and that is not the same as zero. See the
 * note on `Countdown`: anything derived from `Date.now()` differs between the
 * server render and the first client one, so the caller must render nothing
 * rather than render a guess.
 */
export function useCountdown(to: string, onExpire?: () => void): number | null {
  const [msLeft, setMsLeft] = useState<number | null>(null)
  // ⚠ THE CALLBACK LIVES IN A REF, not the dependency array. Callers pass an
  // inline arrow, which is a new function every render — in the deps it tears
  // down and restarts the interval each time the parent re-renders, and a clock
  // that keeps restarting never survives long enough to reach zero.
  const expire = useRef(onExpire)
  useEffect(() => { expire.current = onExpire })
  useEffect(() => {
    const target = new Date(to).getTime()
    // ⚠ BOUNDED RETRIES, not one shot. The first fire is immediate; if the
    // server still says sealed afterwards (clock skew between this browser and
    // Postgres is real, and the window is derived from `lock_at`) it tries
    // twice more, 30s apart, then stops. Three attempts is enough for skew and
    // few enough that a wrong `to` cannot turn a page into a polling loop.
    let fires = 0
    let lastFire = 0
    const tick = () => {
      const ms = target - Date.now()
      setMsLeft(ms)
      if (ms <= 0) {
        const now = Date.now()
        if (fires < 3 && now - lastFire >= 30_000) { fires++; lastFire = now; expire.current?.() }
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [to])
  return msLeft
}

/**
 * A ticking countdown to an instant.
 *
 * ⚠ CLIENT-ONLY, like `components/LocalTime` and for the same reason: a value
 * derived from `Date.now()` differs between the server render and the first
 * client render, and React keeps the server text rather than reconciling it.
 * So it renders nothing until mounted, then ticks.
 */
export function Countdown({
  to,
  onExpire,
  format = 'clock',
}: {
  to: string
  onExpire?: () => void
  format?: CountdownFormat
}) {
  return <>{countdownText(useCountdown(to, onExpire), format)}</>
}
