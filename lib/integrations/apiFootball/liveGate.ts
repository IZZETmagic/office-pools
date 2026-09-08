// =============================================================
// How often a live fixture is asked "what happened?"
// =============================================================
// ⚠ THE THING THIS FIXES: `res.changed` IS NOT WHAT ITS NAME SUGGESTS. The sync
// RPC compares eight columns, and three of them are the LIVE CLOCK —
// `live_minute`, `live_period`, `live_added`. So a fixture in play is "changed"
// every single minute, whether or not anything happened in it.
//
// Steps 7b3 and 7b4 iterate `changed`, so each was fetching per minute per live
// fixture: about 100 events calls and 100 statistics calls across a 90-minute
// match, to learn about perhaps eight real incidents. 7b3's own comment claimed
// it cost "ONE call per goal, card or status change" and contrasted that with
// "one call per in-window minute" — it was describing the behaviour it thought
// it had, not the one it had. Measured out, a five-league Saturday came to
// ~9,600 calls against a 7,500/day plan the fixture sync itself depends on.
//
// ⚠ THE GATE NEEDS NO STORED STATE, WHICH IS WHY THERE IS NO MIGRATION. The
// obvious design keeps an `events_synced_at` per fixture and compares clocks;
// that is a column, a migration, and a deploy ordering. The match clock is
// already a counter that advances once a minute and is already in hand, so
// "every third minute" is just `elapsed % 3`. It cannot drift, it needs nothing
// remembered between cron runs, and two fixtures kicking off at the same time
// naturally stagger by their own elapsed minutes rather than stampeding.
// =============================================================

/** Events: a card or substitution surfaces within this many minutes. */
export const EVENTS_EVERY_MINUTES = 3

/** Statistics: possession does not need to be fresher than this. */
export const STATS_EVERY_MINUTES = 10

export type LiveGateInput = {
  /** What we held before the RPC wrote. Null when the fixture is new to us. */
  priorStatus: string | null
  priorHomeGoals: number | null
  priorAwayGoals: number | null
  /** What the RPC just wrote. */
  status: string
  homeGoals: number | null
  awayGoals: number | null
  isCompleted: boolean
  /** The provider's match clock, or null when it is not running. */
  elapsed: number | null
}

/**
 * Whether this fixture is worth asking the provider about on this tick.
 *
 * ⚠ ANYTHING THAT MOVED THE SCOREBOARD IS IMMEDIATE. A goal, a status change
 * and the completion tick all fetch at once — those are the moments a member is
 * looking at the screen, and delaying them to fit a heartbeat would make the
 * feature worse to save nothing worth saving.
 *
 * ⚠ THE COMPLETION TICK IS NOT OPTIONAL. `is_completed` flips exactly once per
 * fixture and it is the reconciliation pass: a VAR-disallowed goal that
 * restores the previous score changes no column at all, so it produces no
 * `changed` row of its own, and full time is the only chance to notice the
 * timeline still carries a goal that never stood. 7b3 has always relied on it.
 *
 * ⚠ AND A FIXTURE WE HAVE NEVER SEEN IS ALWAYS FETCHED. `priorStatus === null`
 * means it was not in the window read, so there is nothing to compare and
 * nothing held — skipping it on a heartbeat would leave it blank until its
 * next goal.
 */
export function shouldRefetch(input: LiveGateInput, everyNMinutes: number): boolean {
  // Never seen it before — there is no "unchanged" to fall back on.
  if (input.priorStatus === null) return true

  // The scoreboard moved.
  if (input.priorStatus !== input.status) return true
  if (input.priorHomeGoals !== input.homeGoals) return true
  if (input.priorAwayGoals !== input.awayGoals) return true

  // Full time — the reconciliation pass.
  if (input.isCompleted) return true

  // Otherwise the clock is all that ticked. Ask on every Nth minute of it.
  //
  // ⚠ A NULL CLOCK IS A NO, NOT A YES. Before kickoff and after full time the
  // provider sends no elapsed minute, and nothing is happening to ask about —
  // treating null as 0 would make `0 % 3` true and fetch on every idle tick,
  // which is the bug this function exists to remove.
  if (input.elapsed === null) return false
  return input.elapsed % everyNMinutes === 0
}
