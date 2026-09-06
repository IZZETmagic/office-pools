import { useEffect, useState } from 'react';

// =============================================================
// ONE TICKING CLOCK
// =============================================================
// The Showdown surfaces run two countdowns at once — the sealed card's
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
// =============================================================

/**
 * Milliseconds remaining until `iso`, re-rendering once a second.
 *
 * `null` once the target has passed, or when there is no target — so a caller
 * can fall back to whatever it says when there is nothing to wait for.
 */
export function useCountdown(iso: string | null | undefined): number | null {
  const target = iso ? Date.parse(iso) : NaN;
  const [, tick] = useState(0);

  useEffect(() => {
    if (Number.isNaN(target)) return;
    // ⚠ Cleared on unmount. These live inside a tab pager where several screens
    // stay mounted off-view; a timer per mounted copy is how a list of pools
    // ends up ticking a dozen times a second in the background.
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (Number.isNaN(target)) return null;
  const ms = target - Date.now();
  return ms > 0 ? ms : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `HH:MM:SS`, with hours ACCUMULATING past 24 — three days out reads `72:00:00`
 * rather than rolling over to `00:00:00` and looking like it has expired.
 */
export function formatHms(ms: number): string {
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
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const rest = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}d ${rest}` : rest;
}
