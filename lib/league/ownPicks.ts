// =============================================================
// YOUR OWN PICKS, WHATEVER DEPTH THE POOL ASKS FOR
// =============================================================
// One rule, in one place: *a member has picked a fixture if EITHER shape of
// pick exists for it.*
//
// ## Why this is a file and not four lines in a component
//
// Migration 064 gave a league pool two pick shapes and made them mutually
// exclusive per row: a Results pool files `predicted_outcome`, a Scores pool
// files `predicted_home_score` / `predicted_away_score`, and
// `league_predictions_shape_ck` refuses a row carrying both or neither.
// `readAllLeaguePredictions` splits them on exactly that test, into two arrays
// that reach the front end separately.
//
// So for a Scores pool the outcomes array is **empty, not partial** — and any
// code that counts it alone reports a member who has picked every game as
// having picked none. That is not hypothetical: `DuelsTab`'s "Your sheet" and
// "Your season" cards both did it, and on `Showdown: Exact Scores` a full sheet
// of ten scorelines rendered as "0 / 10", an empty bar, ten fixtures listed as
// "still open" and a button asking the member to finish picks they had already
// made. Ryan found it on 2026-09-01.
//
// Two components had independently made the same wrong assumption, which is the
// signal that the rule needed an owner rather than a third copy.
//
// ## ⚠ THE DERIVATION ONLY RUNS ONE WAY
//
// A stored scoreline can be READ as a direction — 2-1 means the member backed
// the home side, and saying so invents nothing. The reverse is forbidden:
// `write.ts` and Decision 9 both spell it out, because filing "home" as a
// sentinel 1-0 would score as a genuine exact and show somebody a scoreline
// they never entered. Nothing here writes.
// =============================================================

export type LeagueDirection = 'home' | 'draw' | 'away'

/** A Results-depth tap, as the bulk route delivers it. */
export type OutcomeRow = { entry_id: string; match_id: string; outcome: LeagueDirection }

/** A Scores-depth scoreline, as the bulk route delivers it. */
export type ScoreRow = {
  entry_id: string
  match_id: string
  predicted_home_score: number
  predicted_away_score: number
}

/** Which way a scoreline leans. Level scores are a draw, not a home win. */
export function directionOf(homeScore: number, awayScore: number): LeagueDirection {
  if (homeScore > awayScore) return 'home'
  if (homeScore < awayScore) return 'away'
  return 'draw'
}

/**
 * Every fixture one entry has picked, at either depth, as fixture → direction.
 *
 * The direction is what the two callers need — a completion count wants the
 * keys, a tendency bar wants the values — and it is the only thing both shapes
 * can express. Points, margins and exact scorelines are deliberately dropped:
 * this answers "did you pick, and which way", nothing else.
 *
 * ⚠ A TAP WINS OVER A SCORELINE if a row somehow carried both. The CHECK
 * constraint says that cannot happen; this does not depend on it, and neither
 * does `DuelsTab`'s `pickLabel`, which resolves the same collision the same
 * way. Two readers disagreeing about a row is worse than either answer.
 */
export function ownPickDirections(
  entryId: string | null | undefined,
  outcomes: readonly OutcomeRow[],
  predictions: readonly ScoreRow[],
): Map<string, LeagueDirection> {
  const byFixture = new Map<string, LeagueDirection>()
  if (!entryId) return byFixture
  for (const o of outcomes) {
    if (o.entry_id === entryId) byFixture.set(o.match_id, o.outcome)
  }
  for (const p of predictions) {
    if (p.entry_id !== entryId || byFixture.has(p.match_id)) continue
    byFixture.set(p.match_id, directionOf(p.predicted_home_score, p.predicted_away_score))
  }
  return byFixture
}
