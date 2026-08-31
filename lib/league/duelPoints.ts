/**
 * What a Showdown duel is worth.
 *
 * ⚠ SQL OWNS THESE NUMBERS. `league_score_duels` (migration 121) writes them
 * into `league_duels.points_a/points_b`, and `league_finalize_ranks` adds the
 * sum to `total_points`. Nothing here computes a score — this file exists so
 * the front end can say *"you won"* when it sees a 500 without three different
 * components each carrying their own literal, which is how `DuelsTab` ended up
 * with `points === 3` in three separate places.
 *
 * `duelPoints.guard.test.ts` reads the migration and fails if these drift.
 *
 * ## Where 500 comes from
 *
 * Both scoring depths cap at 100 a fixture (migration 066: Results pays 100 for
 * the right result, Scores pays 100 for an exact scoreline), so a perfect
 * matchweek is fixtures × 100 whatever the depth. A 20-team league plays 10
 * fixtures a week ⇒ a perfect week is 1,000 ⇒ **a win is half of one**.
 *
 * ⚠ It is a CONSTANT, not a percentage, so in an 18-team league (Bundesliga,
 * Ligue 1 — neither launched) 500 is 55.6% of a perfect week rather than 50%.
 * Symmetry holds inside any one pool, which is the gate that matters. Recorded
 * rather than solved; see migration 121's header.
 */

/** Beat your opponent. Half a perfect matchweek. */
export const DUEL_WIN = 500
/** Level with your opponent. A quarter of a perfect matchweek. */
export const DUEL_TIE = 250
/**
 * No opponent this week — worth exactly a tie.
 *
 * ⚠ Identical to `DUEL_TIE` by design, so it CANNOT be told apart from a tie by
 * looking at the points. Callers separate the two structurally (a bye has no
 * opponent entry at all), never by value. Migration 100 settled the reasoning:
 * no opponent, so no defeat.
 */
export const DUEL_BYE = 250
/** Lose. */
export const DUEL_LOSS = 0

export type DuelResult = 'won' | 'tied' | 'lost'

/**
 * What a points value on a settled duel means.
 *
 * ⚠ Only valid for a duel that HAD an opponent. A bye scores `DUEL_BYE`, which
 * equals `DUEL_TIE`, so this would call it a tie — check `them` first.
 */
export function duelResult(points: number | null): DuelResult | null {
  if (points === null) return null
  if (points >= DUEL_WIN) return 'won'
  if (points >= DUEL_TIE) return 'tied'
  return 'lost'
}
