/**
 * How a settled duel is described — the scoreline and the verdict term.
 *
 * Pure. Two members' per-fixture points in, a headline out. Every value is a
 * function of real results, which is what keeps this side of gate 5 trivial:
 * nothing here invents uncertainty, it only names what the sport produced.
 *
 * ⚠ A TERM MAY NEVER BE PICKED FOR DRAMA. `SPLIT DECISION` on a five-fixture
 * gap would be the first lie the product tells, and it would be the kind nobody
 * could catch from the outside. The bands below are the whole contract.
 */

import { DUEL_WIN, DUEL_TIE, duelResult } from './duelPoints'

/** A fixture caps at 100 in BOTH depths — migration 066. So one fixture is 100. */
export const ONE_FIXTURE = 100

export type DuelVerdictTerm =
  | 'SHUTOUT'
  | 'UNANIMOUS DECISION'
  | 'DECISION'
  | 'SPLIT DECISION'
  | 'DRAW'
  | 'BYE'

export type DuelScoreline = {
  /**
   * Fixtures each member outscored the other on. ⭐ THE BIG NUMBER on the card
   * — Ryan's call, 2026-08-31, over raw points.
   *
   * ⚠ It works at both depths, which raw points do not: at Results depth a
   * fixture is 100 or 0, so a pick count and a points total are the same
   * reading; at Scores depth a fixture pays 100/75/50/0 and "6 correct" is not
   * a thing anybody could count. "Fixtures I beat you on" is a real
   * head-to-head number either way.
   */
  yourFixtures: number
  theirFixtures: number
  /** Fixtures where the two scored the same — including both missing it. */
  levelFixtures: number
  /** The audit trail, and what the duel was ACTUALLY decided on. */
  yourPoints: number
  theirPoints: number
}

export type DuelVerdict = {
  term: DuelVerdictTerm
  /** From the viewer's side. A bye is neither won nor lost. */
  outcome: 'won' | 'lost' | 'tied' | 'bye'
  /** Points margin, always ≥ 0. */
  margin: number
  /**
   * ⚠ TRUE WHEN THE SCORELINE DISAGREES WITH THE RESULT, which is possible and
   * is not a bug.
   *
   * The duel is decided on POINTS; the scoreline counts FIXTURES. At Scores
   * depth those can part company — win six fixtures at 50 apiece (300) against
   * four at 100 (400) and you took more games while they took the duel. At
   * Results depth it cannot happen, since every fixture is 100 or 0.
   *
   * The card must SAY so when it happens rather than showing a 6–4 above the
   * words "Sarah beat you" and looking broken. It is a genuinely good line —
   * "you took more games, Sarah took more points" — but only if it is written.
   */
  scorelineDisagrees: boolean
}

/**
 * Count the fixtures each side outscored the other on.
 *
 * ⚠ THE UNION OF BOTH MAPS, not one member's keys. An entry with no pick has no
 * row in `league_match_scores` at all, so iterating your own fixtures would
 * silently drop every fixture only your opponent played — and hand them fewer
 * fixtures than they won.
 */
export function duelScoreline(
  yourFixtures: Map<number, number> | undefined,
  theirFixtures: Map<number, number> | undefined,
): DuelScoreline {
  const mine = yourFixtures ?? new Map<number, number>()
  const theirs = theirFixtures ?? new Map<number, number>()
  const all = new Set([...mine.keys(), ...theirs.keys()])

  let you = 0, them = 0, level = 0, yourPoints = 0, theirPoints = 0
  for (const n of all) {
    const a = mine.get(n) ?? 0
    const b = theirs.get(n) ?? 0
    yourPoints += a
    theirPoints += b
    if (a > b) you++
    else if (b > a) them++
    else level++
  }
  return {
    yourFixtures: you, theirFixtures: them, levelFixtures: level,
    yourPoints, theirPoints,
  }
}

/**
 * The verdict, from the scoreline and what the engine paid.
 *
 * `points` is the viewer's `points_a`/`points_b` — read, never recomputed, so a
 * revaluation of a duel needs no change here.
 *
 * ⚠ `isBye` IS PASSED IN, not inferred. A bye pays `DUEL_BYE`, which IS
 * `DUEL_TIE`, so no number reaching this function can tell them apart.
 */
export function duelVerdict(
  scoreline: DuelScoreline,
  points: number | null,
  isBye: boolean,
): DuelVerdict {
  const margin = Math.abs(scoreline.yourPoints - scoreline.theirPoints)

  if (isBye) {
    return { term: 'BYE', outcome: 'bye', margin: 0, scorelineDisagrees: false }
  }

  const outcome =
    points !== null && points >= DUEL_WIN ? 'won'
      : points !== null && points >= DUEL_TIE ? 'tied'
        : 'lost'

  // The scoreline counts fixtures; the duel was decided on points. See the note
  // on `scorelineDisagrees`.
  const fixtureLead = scoreline.yourFixtures - scoreline.theirFixtures
  const scorelineDisagrees =
    (outcome === 'won' && fixtureLead < 0) ||
    (outcome === 'lost' && fixtureLead > 0) ||
    (outcome === 'tied' && fixtureLead !== 0)

  // ⚠ BANDS IN FIXTURE-EQUIVALENTS. A fixture caps at 100 in both depths, so
  // "within one fixture" is a sentence a member can check against the team
  // sheet. "Within 100 points" is the same rule and nobody can picture it.
  const term: DuelVerdictTerm =
    outcome === 'tied' ? 'DRAW'
      // A shutout is the opponent scoring NOTHING, not merely losing badly.
      : Math.min(scoreline.yourPoints, scoreline.theirPoints) === 0 ? 'SHUTOUT'
        : margin <= ONE_FIXTURE ? 'SPLIT DECISION'
          : margin <= ONE_FIXTURE * 3 ? 'DECISION'
            : 'UNANIMOUS DECISION'

  return { term, outcome, margin, scorelineDisagrees }
}

/**
 * The fixture that decided it: the one where the two diverged which, had it
 * gone the other way, would have changed the result.
 *
 * ⚠ Returns null when there ISN'T one — a duel decided by three fixtures has no
 * single decisive game, and claiming one would be a story we made up. The card
 * must handle null rather than assume a fixture is always there.
 *
 * The test is `swing > margin`: flipping a fixture moves the gap by twice its
 * difference (you lose your points on it, they gain theirs), so it changes the
 * outcome only when that exceeds the margin. Among the fixtures that qualify,
 * the tightest one is the truest answer — the game that was closest to going
 * the other way.
 */
export function decisiveFixture(
  yourFixtures: Map<number, number> | undefined,
  theirFixtures: Map<number, number> | undefined,
): number | null {
  const mine = yourFixtures ?? new Map<number, number>()
  const theirs = theirFixtures ?? new Map<number, number>()
  const all = [...new Set([...mine.keys(), ...theirs.keys()])]
  const margin = Math.abs(
    [...all].reduce((n, k) => n + (mine.get(k) ?? 0) - (theirs.get(k) ?? 0), 0),
  )
  if (margin === 0) return null

  let best: { n: number; swing: number } | null = null
  for (const n of all) {
    const diff = (mine.get(n) ?? 0) - (theirs.get(n) ?? 0)
    if (diff === 0) continue
    const swing = Math.abs(diff) * 2
    if (swing <= margin) continue
    if (!best || swing < best.swing) best = { n, swing }
  }
  return best?.n ?? null
}

/**
 * The fixture you gained most on them.
 *
 * ⚠ NOT the same as `decisiveFixture`, and the difference is the point of
 * having both. Decisive means "flip this and the result changes" — it is about
 * the margin. Best call means "this is where you took the most out of them" —
 * it is about the pick. In a one-fixture win they are often the same game; in a
 * comfortable win they are usually not, and the best call is the more
 * interesting line because the decisive one does not exist.
 *
 * Null when you gained on nothing — a shutout defeat has no best call, and
 * inventing one would be consolation, which this card does not do.
 */
export function bestCall(
  yourFixtures: Map<number, number> | undefined,
  theirFixtures: Map<number, number> | undefined,
): number | null {
  const mine = yourFixtures ?? new Map<number, number>()
  const theirs = theirFixtures ?? new Map<number, number>()
  let best: { n: number; gain: number } | null = null
  for (const n of new Set([...mine.keys(), ...theirs.keys()])) {
    const gain = (mine.get(n) ?? 0) - (theirs.get(n) ?? 0)
    if (gain <= 0) continue
    if (!best || gain > best.gain) best = { n, gain }
  }
  return best?.n ?? null
}

export type DuelStreak = { outcome: 'won' | 'lost' | 'tied'; run: number }

/**
 * The run this duel is part of — "third win in a row".
 *
 * ⚠ ORDERED BY `settled_at`, never by matchweek number. Rounds are played out
 * of numerical order (101: a minimum gap of minus 121 days), so numbering them
 * would count a "run" that never happened in that sequence.
 *
 * ⚠ BYES BREAK NOTHING AND COUNT AS NOTHING. A week with no opponent is not a
 * win and not a defeat, so it is skipped rather than ending a run — the
 * rotation hands them out, and a member should not lose a streak to the draw.
 *
 * Returns a run of 1 for an isolated result; callers decide that is not worth
 * saying.
 */
export function duelStreak(
  duels: Array<{
    entry_a: string; entry_b: string | null
    points_a: number | null; points_b: number | null
    settled_at: string | null
  }>,
  entry: string,
): DuelStreak | null {
  const mine = duels
    .filter((d) => d.settled_at && (d.entry_a === entry || d.entry_b === entry))
    .sort((a, b) => b.settled_at!.localeCompare(a.settled_at!))

  let outcome: 'won' | 'lost' | 'tied' | null = null
  let run = 0
  for (const d of mine) {
    if (d.entry_b === null) continue                    // a bye: neither, skip
    const r = duelResult(d.entry_a === entry ? d.points_a : d.points_b)
    if (r === null) continue
    if (outcome === null) { outcome = r; run = 1; continue }
    if (r !== outcome) break
    run++
  }
  return outcome === null ? null : { outcome, run }
}

export type DuelFormResult = 'won' | 'tied' | 'lost' | 'bye'

/**
 * A member's last five duel results, OLDEST FIRST.
 *
 * The season table has its own copy of this shape inside `DuelsTab`; this one
 * is exported because the decision page needs it on the server. If a third
 * caller appears, the tab's should move here rather than a third being written.
 *
 * ⚠ ORDERED BY `settled_at`, never matchweek number — rounds are played out of
 * numerical order (101: a minimum gap of minus 121 days), so numbering them
 * would show a run in an order the season was not played in.
 *
 * ⚠ A BYE IS ITS OWN RESULT and is detected structurally: it pays `DUEL_BYE`,
 * which IS `DUEL_TIE`, so the number cannot tell them apart.
 */
export function duelForm(
  duels: Array<{
    entry_a: string; entry_b: string | null
    points_a: number | null; points_b: number | null
    settled_at: string | null
  }>,
  entry: string,
  limit = 5,
): DuelFormResult[] {
  return duels
    .filter((d) => d.settled_at && (d.entry_a === entry || d.entry_b === entry))
    .sort((a, b) => a.settled_at!.localeCompare(b.settled_at!))
    .map((d): DuelFormResult => d.entry_b === null
      ? 'bye'
      : duelResult(d.entry_a === entry ? d.points_a : d.points_b) ?? 'lost')
    .slice(-limit)
}
