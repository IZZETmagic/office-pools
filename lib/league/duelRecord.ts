// =============================================================
// WHAT AN ENTRY'S DUELS ADD UP TO — W / T / L, byes, form, points
// =============================================================
// One owner for the duel record, because two surfaces now render it and they
// were already disagreeing about the same member on the same card.
//
// ## ⚠⚠ A BYE IS `entry_b IS NULL`. IT IS NEVER READ OFF THE POINTS.
//
// `DUEL_BYE === DUEL_TIE === 250` by design (migration 121), so anything that
// classifies a result by its value calls a bye a draw against an opponent who
// never existed. `buildDuelTable` in `DuelsTab` did exactly that: it walked
// `[entry_a, points_a]` and `[entry_b, points_b]`, and for a bye row `entry_b`
// is null so only side A survived — with 250 points, which `duelResult` reads
// back as `tied`.
//
// The card above it counted byes correctly, so a member with one bye read
// "0W 0T 0L, 1 bye" in the header and picked up a T in the table underneath.
// Nothing errored; the two numbers simply were not the same number.
//
// ## ⚠ `duelResult`, NEVER A LITERAL
//
// A win has been 500 since migration 121. `headToHead()` survived that sweep
// still comparing against 3 and would have scored every meeting as a LOSS for
// everybody, silently. `duelPoints.ts` owns the values and its guard test reads
// them out of the migration.
//
// ## ⚠ THE ENGINE'S POINTS WIN WHERE THEY EXIST
//
// `league_entry_totals.duel_points` is what the ranker adds to `total_points`.
// Summing the per-duel column here is a FALLBACK for a pool whose totals row has
// not been written yet — an entry that never picked has no row at all (migration
// 085 exists because 084 used UPDATE where it needed INSERT). Preferring the
// local sum would let this table and the leaderboard part company after a
// rescore.
//
// ⚠ NOT MIRRORED TO THE PHONE — yet. RN's equivalent lives inside
// `mobile/lib/useDuel.ts`'s `duelTable` memo, tangled with the hook. Lifting it
// out is owed; until then this is the web's owner and the phone's is its own.
// The two agree today and there is no guard holding them there.

import { duelResult } from './duelPoints'
import type { DuelRow } from './duels'

/** One duel's outcome for one side. ⚠ `bye` is not a value `duelResult` returns. */
export type DuelFormResult = 'won' | 'tied' | 'lost' | 'bye'

export type DuelRecord = {
  entry: string
  /** From `league_entry_totals` where it exists; the per-duel sum otherwise. */
  duelPoints: number
  won: number
  tied: number
  lost: number
  byes: number
  /**
   * Every settled duel, OLDEST FIRST.
   *
   * ⚠ ORDERED BY `settled_at`, NEVER BY MATCHWEEK NUMBER. Rounds are played out
   * of numerical order — migration 101 measured a minimum gap of minus 121 days
   * across three real seasons — so a form strip sorted by number would show a
   * member's results in an order they never happened in.
   */
  form: DuelFormResult[]
}

const empty = (entry: string): DuelRecord => ({
  entry, duelPoints: 0, won: 0, tied: 0, lost: 0, byes: 0, form: [],
})

/** The blank record for an entry with no duels — so callers need no `?? {}`. */
export const EMPTY_DUEL_RECORD: DuelRecord = Object.freeze(empty(''))

/**
 * @param duels         every duel the viewer may see. A sealed week is not in
 *                      here at all — migration 116 withholds the rows — which is
 *                      why this can be run over the whole payload safely.
 * @param enginePoints  `league_entry_totals.duel_points`, per entry.
 */
export function buildDuelRecords(
  duels: DuelRow[],
  enginePoints?: Map<string, number>,
): Map<string, DuelRecord> {
  const rows = new Map<string, DuelRecord>()
  /** Σ of the engine's own per-duel column — the fallback, kept separate. */
  const summed = new Map<string, number>()
  /** Settled results with their instant, so `form` can be ordered by time. */
  const timeline = new Map<string, Array<{ at: string; result: DuelFormResult }>>()

  const ensure = (e: string) => {
    let r = rows.get(e)
    if (!r) { r = empty(e); rows.set(e, r) }
    return r
  }
  const push = (e: string, at: string, result: DuelFormResult) => {
    const t = timeline.get(e) ?? []
    t.push({ at, result })
    timeline.set(e, t)
  }

  for (const d of duels) {
    // ⚠ EVERY PARTICIPANT GETS A ROW, settled or not. A member whose only duel
    // is this week's would otherwise be missing from the table entirely rather
    // than sitting on zero — the same call migration 085 makes.
    ensure(d.entry_a)
    if (d.entry_b) ensure(d.entry_b)
    if (!d.settled_at) continue

    // ⚠⚠ THE BYE BRANCH IS FIRST AND IS STRUCTURAL. `entry_b === null` is the
    // only safe test; the points cannot tell a bye from a tie.
    if (d.entry_b === null) {
      const r = ensure(d.entry_a)
      r.byes++
      if (d.points_a !== null) summed.set(d.entry_a, (summed.get(d.entry_a) ?? 0) + d.points_a)
      push(d.entry_a, d.settled_at, 'bye')
      continue
    }

    for (const [e, p] of [[d.entry_a, d.points_a], [d.entry_b, d.points_b]] as const) {
      if (p === null) continue
      const r = ensure(e)
      summed.set(e, (summed.get(e) ?? 0) + p)
      const o = duelResult(p)
      if (o === 'won') r.won++
      else if (o === 'tied') r.tied++
      else r.lost++
      push(e, d.settled_at, o ?? 'lost')
    }
  }

  for (const r of rows.values()) {
    r.duelPoints = enginePoints?.get(r.entry) ?? summed.get(r.entry) ?? 0
    r.form = (timeline.get(r.entry) ?? [])
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((x) => x.result)
  }
  return rows
}
