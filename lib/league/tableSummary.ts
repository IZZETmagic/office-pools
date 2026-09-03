// =============================================================
// ONE TABLE PREDICTION, ADDED UP — the only copy of this arithmetic
// =============================================================
// Lifted out of `TableBreakdownView.tsx` when React Native needed the same
// answer. It was a web component's local helper; mobile is a separate npm
// project that cannot import from `app/`, so the choice was a second copy or
// this. A second copy of the band-bonus formula is exactly the drift the
// original file's own header warns about — and it would have been the THIRD,
// after `league_score_table`.
//
// So the server computes it once and both surfaces render the answer. That is
// the same rule the rest of the scoring follows: the backend adds up, the
// frontends display.
//
// ⚠ THIS MIRRORS SQL, AND THE COUPLING IS THE RISK. The authority is
// `league_score_table` (migration 093/113):
//
//     champion_hit      * champ
//   + top_hits          * top_bonus
//   + (top_hits = top_n AND top_n > 0 ? perfect : 0)
//   + releg_hits        * releg_bonus
//   + europa_hits       * eur_bonus
//   + conference_hits   * conf_bonus
//
// It is repeated here rather than returned by the RPC because the breakdown is
// per CLUB and the bonuses are per ENTRY. If the engine's formula changes this
// must change with it, and the way you find out is that the total below stops
// matching the leaderboard — which is the symptom that made it necessary in the
// first place: a modal saying 700 beside a leaderboard saying 1,240, with
// nothing on screen to explain the 540.
// =============================================================

import type { TableBreakdownRow } from './table'

export type TablePrices = {
  /** What a club placed exactly right is worth, and what each place out costs. */
  exactPoints: number
  stepPenalty: number
  championBonus: number
  topFourBonus: number
  perfectTopFourBonus: number
  relegationBonus: number
  europaBonus: number
  conferenceBonus: number
}

/**
 * How far along the ramp a club sits: 0 exact, 1 worth nothing.
 *
 * Kept separate from any colour so the progression can be tested as a number
 * rather than by string-matching a CSS expression.
 */
export function deltaHeatRatio(delta: number, zeroAt: number): number {
  if (zeroAt <= 0) return 0
  return Math.min(1, Math.abs(delta) / zeroAt)
}

/**
 * The first distance worth nothing, derived from the pool's OWN prices rather
 * than fixed at five — a pool charging 25 a place runs the ramp over four. On
 * the default 100/20 it is exactly the five the Scoring Rules ladder prints,
 * which is the point: the two screens describe one scale.
 */
export function zeroAtFor(prices: Pick<TablePrices, 'exactPoints' | 'stepPenalty'>): number {
  return prices.stepPenalty > 0 ? Math.ceil(prices.exactPoints / prices.stepPenalty) : 0
}

export type BandBonusLine = { label: string; points: number }

/** The band bonuses, counted from the same per-row flags the engine counted. */
export function bandBonuses(rows: TableBreakdownRow[], topN: number, prices: TablePrices) {
  const championHits = rows.filter((r) => r.champion_hit).length
  const topHits = rows.filter((r) => r.top_hit).length
  const relegHits = rows.filter((r) => r.releg_hit).length
  const europaHits = rows.filter((r) => r.europa_hit).length
  const conferenceHits = rows.filter((r) => r.conference_hit).length
  const perfectTop = topN > 0 && topHits === topN

  const lines: BandBonusLine[] = []
  if (championHits > 0) lines.push({ label: 'Champion called right', points: championHits * prices.championBonus })
  if (topHits > 0) lines.push({ label: `Top ${topN} named — ${topHits}`, points: topHits * prices.topFourBonus })
  if (perfectTop) lines.push({ label: `All ${topN}, as a set`, points: prices.perfectTopFourBonus })
  if (europaHits > 0) lines.push({ label: `Europa places named — ${europaHits}`, points: europaHits * prices.europaBonus })
  if (conferenceHits > 0) lines.push({ label: `Conference places named — ${conferenceHits}`, points: conferenceHits * prices.conferenceBonus })
  if (relegHits > 0) lines.push({ label: `Relegation named — ${relegHits}`, points: relegHits * prices.relegationBonus })

  return { lines, total: lines.reduce((sum, l) => sum + l.points, 0) }
}

export type TableSummary = {
  /** Points from where each club was put — the per-club half. */
  positional: number
  /** The band bonuses, itemised. Most of a good table's score lives here. */
  lines: BandBonusLine[]
  bonusTotal: number
  total: number
  /** How many clubs are in exactly the right place right now. */
  exact: number
  /** True once the season-end snapshot exists — until then, provisional. */
  isFinal: boolean
  /** The distance at which a club stops being worth anything. */
  zeroAt: number
}

/**
 * Everything a screen needs to state a table's score without doing arithmetic
 * of its own.
 *
 * ⚠ Positional points come from the rows and the bonuses from their flags —
 * NEVER from `league_entry_totals`. Both are true, but they settle at different
 * moments: the breakdown RPC reads the live standings, and the total is written
 * by the engine on its own schedule. Mixing them is how a screen shows a total
 * that its own lines do not add up to.
 */
export function summariseTable(
  rows: TableBreakdownRow[],
  topN: number,
  prices: TablePrices,
): TableSummary {
  const positional = rows.reduce((sum, r) => sum + (r.points ?? 0), 0)
  const bonuses = bandBonuses(rows, topN, prices)
  return {
    positional,
    lines: bonuses.lines,
    bonusTotal: bonuses.total,
    total: positional + bonuses.total,
    exact: rows.filter((r) => r.delta === 0).length,
    isFinal: rows[0]?.is_final ?? false,
    zeroAt: zeroAtFor(prices),
  }
}

/**
 * The per-place ladder a Scoring screen prints — "exactly right", a couple of
 * rungs down, then the first distance worth nothing.
 *
 * Moved here from `LeagueScoringRulesTab` so React Native can print the same
 * rungs. It is the same arithmetic `zeroAtFor` does, and two screens quoting
 * different ladders for one pool is the drift this module exists to prevent.
 */
export function placeLadder(exact: number, step: number): Array<{ label: string; value: number }> {
  const rungs = [{ label: 'Exactly right', value: exact }]

  // No decay: there is no ladder to climb down, and dividing by it would not
  // terminate. The paragraph below says so in words instead.
  if (step <= 0) return rungs

  // The first distance worth nothing. Everything beyond it is also nothing, so
  // the ladder ends there rather than running to twenty.
  const zeroAt = Math.ceil(exact / step)

  // A long ladder is worse than the rate it replaces — a pool priced 100/5
  // would print twenty rows. Show where it starts, where it ends, and let the
  // sentence carry the middle.
  const detailed = zeroAt <= 6 ? zeroAt - 1 : 2

  for (let out = 1; out <= detailed; out++) {
    rungs.push({
      label: out === 1 ? '1 place out' : `${out} places out`,
      value: Math.max(0, exact - step * out),
    })
  }

  // A penalty at or above the full value zeroes a club the moment it is out of
  // position, so there is no ladder — just a cliff, and it should say so rather
  // than print "1 or more places out" next to nothing else.
  rungs.push(
    zeroAt === 1
      ? { label: 'Anywhere else', value: 0 }
      : { label: `${zeroAt} or more places out`, value: 0 },
  )

  return rungs
}
