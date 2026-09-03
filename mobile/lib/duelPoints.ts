/**
 * What a Showdown duel is worth — the phone's copy.
 *
 * ⚠⚠ THIS IS A COPY, AND IT IS GUARDED. The owner is
 * `lib/league/duelPoints.ts`, whose owner in turn is `league_score_duels`
 * (migration 121). Mobile cannot import from the web tree — `mobile/tsconfig`
 * maps `@/*` to `mobile/` and nothing reaches outside it — so the values are
 * restated here and `lib/league/__tests__/duelPoints.guard.test.ts` reads BOTH
 * files against the migration and fails if either drifts.
 *
 * ## Why a drift here is worse than a wrong number
 *
 * Nothing errors. The duel card reads a settled 500, classifies it with a stale
 * `=== 3`, and tells a member who WON that they lost — while the leaderboard
 * beside it, which gets its ranking from SQL, has them moving up. Two surfaces
 * disagreeing about who won a fight is the one bug this mode cannot survive.
 *
 * That is not hypothetical: `headToHead()` on the web carried `=== 3` after
 * migration 121 raised the scale, and would have scored every meeting in the
 * head-to-head record as a loss for everybody.
 *
 * Nothing in this file computes a score. SQL writes the numbers; this only
 * names them.
 */

/** Beat your opponent. Half a perfect matchweek. */
export const DUEL_WIN = 500
/** Level with your opponent. A quarter of a perfect matchweek. */
export const DUEL_TIE = 250
/**
 * No opponent this week — worth exactly a tie.
 *
 * ⚠ Identical to `DUEL_TIE` by design, so a bye CANNOT be told from a tie by
 * looking at the points. Separate them structurally — a bye has no opponent
 * entry at all (`entry_b === null`) — never by value. Migration 100 settled the
 * reasoning: no opponent, so no defeat.
 */
export const DUEL_BYE = 250
/** Lose. */
export const DUEL_LOSS = 0

export type DuelResult = 'won' | 'tied' | 'lost'

/**
 * What a points value on a settled duel means.
 *
 * ⚠ Only valid for a duel that HAD an opponent. A bye scores `DUEL_BYE`, which
 * equals `DUEL_TIE`, so this would call it a tie — check for an opponent first.
 */
export function duelResult(points: number | null): DuelResult | null {
  if (points === null) return null
  if (points >= DUEL_WIN) return 'won'
  if (points >= DUEL_TIE) return 'tied'
  return 'lost'
}
