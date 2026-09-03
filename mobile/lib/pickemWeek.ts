// =============================================================
// WHAT A PICK'EM MATCHWEEK IS, AND WHAT MAY BE SHOWN OF IT
// =============================================================
// Pure logic, no React Native import — so the ROOT vitest suite reaches it. That
// is deliberate and it is the pattern `resultsSections.ts` and `homeMatches.ts`
// established: the rules a screen gets wrong are rules about time and
// visibility, and neither needs a renderer to be asserted.
//
// ## ⚠⚠ THE ONE RULE: GATE ON THE CLOCK, NEVER ON A STATE STRING
//
// A matchweek's picks become visible pool-wide the moment its own `lock_at`
// passes, and that is the ONLY test. `lib/league/read.ts:508` spells out why in
// the source: in the round-state vocabulary `'locked'` means BOTH "its deadline
// has passed" and "its turn has not come", because every unopened matchweek is
// seeded `'locked'` exactly as the World Cup seeds unopened bracket rounds. A
// screen reading that string would declare matchweek 30 revealed in August.
//
// `computeReveal` answers it with the clock for precisely this reason, and the
// server strips the rows before they cross the wire. This module decides what to
// ASK FOR and what to SAY; it is not the gate, and it must never be treated as
// one — if these two ever disagree, the server wins and the screen is lying.
//
// ## ⚠ `lock_at` is NOT the first kickoff
//
// Migration 101 closes picks an HOUR before the first game of the matchweek.
// Deriving one from the other is a live bug on the web today — the scoring rules
// tab still tells members picks close "at the moment the first match of that
// matchweek starts" — so both come over the contract and neither is computed.
// =============================================================

import type { LeagueMatch, LeagueMatchweek } from './useLeaguePool'

export type WeekState =
  /** Picks are open. This is the only week anything may be WRITTEN for. */
  | 'open'
  /**
   * `lock_at` has passed. Everybody's picks are visible, and nobody's can
   * change. Covers the week being played and every week already finished — the
   * distinction matters to the football, not to visibility.
   */
  | 'locked'
  /**
   * Its turn has not come. ⚠ NOT the same as locked, though the round-state
   * vocabulary spells them the same way. Nothing may be shown and nothing may
   * be written: migration 058 refuses a pick for any matchweek but the open one.
   */
  | 'future'

/**
 * Where a matchweek stands, as of `now`.
 *
 * `now` is injected rather than read from the ambient clock so this is
 * deterministic — the same discipline `computeReveal` applies for the same
 * reason.
 *
 * ⚠ OPEN IS ASKED, NOT DERIVED. `openMatchweekNumber` comes from the server,
 * which resolves it by which week LOCKS NEXT rather than by number — three real
 * seasons contain a round played before its predecessor (the minimum gap between
 * consecutive rounds is −121 days), so "the lowest unlocked number" is wrong and
 * has been wrong in production.
 */
export function weekState(
  mw: LeagueMatchweek | undefined,
  openMatchweekNumber: number | null,
  now: number,
): WeekState {
  if (!mw) return 'future'
  // The clock first, and it outranks everything: a week whose deadline has
  // passed is locked even if the server still calls it open, because that is
  // what every member can verify against their own watch.
  if (mw.lock_at !== null && Date.parse(mw.lock_at) <= now) return 'locked'
  if (openMatchweekNumber !== null && mw.number === openMatchweekNumber) return 'open'
  return 'future'
}

/**
 * The fixtures of one matchweek, in the order they are played.
 *
 * ⚠ `round_number` IS the matchweek number — the World Cup's name for it,
 * carried through `fixtureToMatch`'s positional mapping. There is no
 * `matchweek_number` on a match and reaching for one silently yields `undefined`.
 */
export function fixturesForWeek(matches: LeagueMatch[], weekNumber: number): LeagueMatch[] {
  return matches
    .filter((m) => m.round_number === weekNumber)
    .sort((a, b) => {
      const ta = a.match_date ? Date.parse(a.match_date) : Number.POSITIVE_INFINITY
      const tb = b.match_date ? Date.parse(b.match_date) : Number.POSITIVE_INFINITY
      // ⚠ An unparseable or missing kickoff sorts LAST rather than first. The
      // fixtures list found this exact bug once already: `NaN` comparisons are
      // always false, so a date-less fixture drifted to the front and became
      // "the next game". `match_number` is the stable tiebreak.
      if (ta !== tb) return ta - tb
      return a.match_number - b.match_number
    })
}

/**
 * Which week the wizard opens on — the ACTIVE one.
 *
 * Ryan, 2026-09-03: *"should default to the active or inplay matchweek."*
 *
 * ⚠⚠ OPEN LEADS, IN-PLAY FOLLOWS — and that is the opposite order to the LMS
 * leaderboard's, deliberately, because this is a PICKER and that is a viewer.
 *
 * From Friday to Monday the week being WATCHED and the week you can still PICK
 * for are different weeks. A viewer should name the football happening now; a
 * picker opening on that week presents ten locked fixtures and no way to enter
 * the picks the member came to make. `LeaguePickemTab` recorded the same rule
 * before it was reverted: *"it picks for the OPEN matchweek, not the in-play
 * one — a screen using the wrong one offers picks on games in progress."*
 *
 * They coincide whenever no week is being played, which is most of the time and
 * is the case today (MW3 open, nothing in play), so this ordering only shows
 * itself on a matchday. If the wizard should instead follow the football when
 * the two diverge, swap the first two clauses — nothing else depends on it.
 *
 * Falls back to the last week that LOCKED, because a season with nothing open
 * is either finished or between weeks and the most recent football beats an
 * empty screen; then to the first week, before a ball is kicked.
 */
export function defaultWeek(
  matchweeks: LeagueMatchweek[],
  openMatchweekNumber: number | null,
  inPlayMatchweekNumber: number | null,
  now: number,
): number | null {
  if (openMatchweekNumber !== null) return openMatchweekNumber
  if (inPlayMatchweekNumber !== null) return inPlayMatchweekNumber
  const locked = matchweeks
    .filter((m) => m.lock_at !== null && Date.parse(m.lock_at) <= now)
    .map((m) => m.number)
  if (locked.length > 0) return Math.max(...locked)
  return matchweeks.length > 0 ? Math.min(...matchweeks.map((m) => m.number)) : null
}

/**
 * Step to the previous or next matchweek that actually exists.
 *
 * ⚠ Walks the LIST rather than doing `n ± 1`. A season's matchweeks are not
 * guaranteed to be a gapless run from the client's point of view, and stepping
 * arithmetically onto a number with no row renders an empty week that the
 * member cannot navigate out of in that direction.
 */
export function stepWeek(
  matchweeks: LeagueMatchweek[],
  from: number,
  direction: -1 | 1,
): number | null {
  const numbers = matchweeks.map((m) => m.number).sort((a, b) => a - b)
  const i = numbers.indexOf(from)
  if (i === -1) return null
  const next = numbers[i + direction]
  return next ?? null
}

/**
 * How many of this week's fixtures the entry has actually picked.
 *
 * ⚠ Counts against the week's OWN fixture count, never the season's. "7 of 10"
 * is the sentence a member needs before a deadline; "7 of 380" is noise.
 */
export function pickedCount(
  weekFixtures: LeagueMatch[],
  hasPick: (fixtureId: string) => boolean,
): number {
  return weekFixtures.reduce((n, f) => (hasPick(f.match_id) ? n + 1 : n), 0)
}
