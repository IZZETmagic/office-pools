// =============================================================
// WHAT AN ENTRY'S DUELS ADD UP TO — W / T / L, byes, form, points
// =============================================================
// ⚠ THIS IS THE COPY. `lib/league/duelRecord.ts` IS CANONICAL — edit that one
// and re-copy, or `duelRecordMirror.guard.test.ts` fails. `mobile/` is a
// separate npm project whose `@/*` resolves to `mobile/*` and cannot import the
// web app's `lib/`; same forced duplication as `duelPhase.ts`, `duelSheet.ts`,
// `ladderGap.ts` and `duelPoints.ts`.
//
// ⚠ IT REPLACES THE `duelTable` MEMO THAT LIVED IN `useDuel.ts`. That version
// pushed `form` in PAYLOAD order and sliced the last five, so a phone showed a
// member's results in an order they were never played in whenever the season
// ran out of numerical sequence — which migration 101 measured happening by up
// to 121 days. The reasoning for every rule here is in the canonical file's
// banner and is not repeated, because two copies of an argument drift the same
// way two copies of a rule do.
//
// ⚠ THE STYLE IS THE WEB'S — no semicolons — because the mirror is a BYTE
// comparison and the two cannot both be idiomatic. `duelPoints.ts` already sits
// this way for the same reason.
//
// ⚠ NOTHING HERE MAY IMPORT REACT NATIVE. `DuelRow` is an `import type`, which
// is erased at runtime, so the hook it comes from is never loaded.
// =============================================================

import { duelResult } from './duelPoints'
import type { DuelRow } from './useLeaguePool'

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

/**
 * How far each member moved when the last duel settled — IN DUEL ORDER.
 *
 * ## ⚠⚠ THIS IS NOT `current_rank` / `previous_rank`, AND THAT WAS THE BUG
 *
 * Those two columns are the SEASON table's order: the engine ranks on
 * `(total_points + duel_points) DESC` and stores the movement of that. The
 * Duels board is ordered by duel points alone — nothing in the database ranks
 * by them — so a board that numbers its rows one way and arrows them the other
 * is telling two stories at once. `Dev 1 ▲3` meant "first on duel points, up
 * three in the season table", and nobody would ever read it that way.
 *
 * ⚠ DERIVED, NOT STORED, AND THERE IS NO COLUMN THAT WOULD DO.
 * `league_entry_totals.previous_final_rank` tracks the weekly ACCURACY rank,
 * which is a third order again.
 *
 * ## ⚠ THE MOST RECENTLY SETTLED MATCHWEEK, NOT THE HIGHEST-NUMBERED ONE
 *
 * Rounds are played out of numerical order — migration 101 measured a minimum
 * gap of MINUS 121 days across three real seasons — so `max(matchweek_number)`
 * picks a week that may not have happened yet, and the arrow would describe a
 * movement nobody made.
 *
 * @param currentOrder  the board AS RENDERED, entry ids in display order. Taken
 *                      from the caller rather than re-sorted here: the Duels
 *                      board breaks ties on the season total, which this module
 *                      has never seen, and an arrow computed against a slightly
 *                      different order than the one on screen is worse than no
 *                      arrow. The PRIOR order is approximated (duel points, then
 *                      wins) because the season totals of a week ago are gone.
 *
 * @returns entry_id → places climbed. Positive is a CLIMB. Absent means no
 *          movement, or no prior row at all — a member new to the board is not
 *          a riser, and drawing them one would invent a story.
 */
export function duelMovement(
  duels: DuelRow[],
  currentOrder: string[],
): Map<string, number> {
  const out = new Map<string, number>()
  const settled = duels.filter((d) => d.settled_at)
  if (settled.length === 0) return out

  const latest = settled.reduce((a, b) => (a.settled_at! > b.settled_at! ? a : b))
  // ⚠ NO ENGINE POINTS. `league_entry_totals.duel_points` includes the week
  // being removed, so handing them in would rank the "before" board on the
  // "after" numbers and every arrow would read zero.
  const before = [...buildDuelRecords(
    duels.filter((d) => d.matchweek_number !== latest.matchweek_number),
  ).values()].sort((a, b) => b.duelPoints - a.duelPoints || b.won - a.won)

  const was = new Map(before.map((r, i) => [r.entry, i + 1]))
  currentOrder.forEach((entry, i) => {
    const prior = was.get(entry)
    if (prior !== undefined && prior !== i + 1) out.set(entry, prior - (i + 1))
  })
  return out
}
