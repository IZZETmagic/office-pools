// =============================================================
// HOW FAR YOU ARE FROM THE MEMBER ABOVE YOU
// =============================================================
// Ryan's line for the Showdown leaderboard, written into
// `ShowdownLeaderboard`'s header the day it was designed and not built until
// 2026-09-07:
//
//   *"The edge does not come from painting a table darker. It comes from one
//   line: how far you are from the member above you. A standings table tells you
//   where you sit; a gap tells you what to do about it."*
//
// ## ⚠ THE MEMBER ABOVE YOU, NEVER THE LEADER
//
// The gap to the person one rung up is a number you can do something about —
// usually one duel, sometimes one matchweek. The gap to the leader is a number
// nobody in eighth can act on, and in a pool built around "no bad feelings" it
// is a line telling half the room the season is over in October. The distance
// being SMALL is what makes it motivating; a rule that can produce a big one has
// a different meaning on every row.
//
// It passes the disclosure gate on its own terms: *"we show how far you are from
// the person one place above you"* is the whole mechanism, and every number in
// it is inherited from the football.
//
// ## ⚠ IT IS ONE LINE, ON YOUR OWN ROW
//
// Not a column on every row. The two numbers a row already carries make each
// gap derivable, so putting it everywhere is arithmetic in the margin — and it
// is the reader's own distance that means something, not the distance between
// two people they are not.
//
// ## ⚠ A NEGATIVE GAP SAYS NOTHING, DELIBERATELY
//
// On the Table board the ORDER is the engine's `current_rank` while the VALUE is
// computed here from the stored columns, and those two can part company for as
// long as a rescore takes — `league_finalize_ranks` writes ranks and totals in
// one pass, but a client holding a half-refreshed payload does not. A line
// reading "−100 behind" would be worse than no line at all, so the rule fails
// closed. This is the same reason `duelRecord` prefers the engine's stored duel
// points to its own sum.
//
// ## ⚠ THIS FILE IS THE CANONICAL ONE. `mobile/lib/ladderGap.ts` IS A COPY.
//
// `mobile/` is a separate npm project whose `@/*` resolves to `mobile/*` and
// cannot import the web app's `lib/`. Same forced duplication as `duelPhase.ts`,
// `duelSheet.ts`, `duelPoints.ts` and `design/oklch.ts`, and handled the same
// way: `ladderGapMirror.guard.test.ts` compares the two below their banners.
//
// ⚠ The copy's style is the phone's — semicolons — because the mirror is a BYTE
// comparison and the two cannot both be idiomatic.
//
// ⚠ NOTHING HERE MAY IMPORT REACT NATIVE, which is what keeps the copy inside
// the root vitest runner's reach.

/** What to say on the viewer's own row, if anything. */
export type LadderGap =
  /** Top of the board, with somebody behind them. */
  | { kind: 'leading'; by: number }
  /** Dead level on points with the row above — separated only by the tiebreak. */
  | { kind: 'level'; name: string }
  | { kind: 'behind'; by: number; name: string };

export type LadderGapRow = {
  /** The name to say out loud. */
  name: string;
  /** The number the board is ordered by — the season total, or duel points. */
  value: number;
};

/**
 * @param rows   the board AS RENDERED, in its display order. Whichever order
 *               that is — the engine's rank or ours — the row above is the row
 *               above, and this compares against the neighbour rather than
 *               re-deriving a position.
 * @param index  the row being described.
 *
 * @returns null when there is nothing honest to say: a pool of one, or a value
 *          gap that runs the wrong way (see the header).
 */
export function ladderGap(rows: LadderGapRow[], index: number): LadderGap | null {
  if (index < 0 || index >= rows.length) return null;
  // Nobody above and nobody below — a pool of one has no ladder.
  if (rows.length < 2) return null;

  if (index === 0) {
    const next = rows[1];
    const by = rows[0].value - next.value;
    if (by < 0) return null;
    // ⚠ LEVEL AT THE TOP IS STILL LEVEL. Being first on a tiebreak is not a
    // lead, and "leading by 0" states the opposite of what happened.
    return by === 0 ? { kind: 'level', name: next.name } : { kind: 'leading', by };
  }

  const above = rows[index - 1];
  const by = above.value - rows[index].value;
  if (by < 0) return null;
  return by === 0
    ? { kind: 'level', name: above.name }
    : { kind: 'behind', by, name: above.name };
}

/**
 * How many characters wide the points column has to be for THIS board.
 *
 * ⚠⚠ THIS IS WHAT ALIGNS THE FORM STRIP, AND A `minWidth` DOES NOT.
 *
 * The strip sits immediately left of the points, and the points column was
 * sized `min-width: X`. That aligns every row whose number happens to fit in X
 * and NO row that does not — so a board reading 1,000 / 750 / 0 puts three
 * different widths in that column, and the dots land at three different
 * offsets. The strip was internally aligned the whole time and still could not
 * be read down the list, which is the one thing it exists for.
 *
 * A minimum cannot fix that, because the failure IS the content exceeding it.
 * The column has to be one width for the whole board, and the only width that
 * is both constant and never clips is the widest value on it.
 *
 * ⚠ IT IS PER BOARD, NOT PER POOL. Table shows season totals and Duels shows
 * duel points — five figures against three — so sizing both from the larger
 * would leave the Duels board with a column of air.
 *
 * ⚠ `toLocaleString()`, THE SAME CALL THE ROW RENDERS WITH. A separator is
 * locale-dependent and "1,000" is five characters where "1000" is four;
 * measuring with one and drawing with the other is how a column ends up one
 * character short on somebody else's phone.
 */
export function ladderNumberChars(rows: LadderGapRow[]): number {
  let max = 1;
  for (const r of rows) max = Math.max(max, r.value.toLocaleString().length);
  return max;
}

/**
 * The sentence, so both platforms say it the same way.
 *
 * ⚠ NO ADVERBS AND NO CONSOLATION. "Only 250 behind" and "just one duel back"
 * are the same sentence with a thumb on the scale, and the recap sheet's rule
 * applies here too: a surface that softens a loss teaches people to distrust it
 * when it does not. The number is the whole message.
 *
 * @param unit  what the points are called on this board — the two boards are
 *              different currencies and a bare number would read as one.
 */
export function ladderGapLabel(gap: LadderGap, unit: string): string {
  if (gap.kind === 'leading') return `Leading by ${gap.by.toLocaleString()} ${unit}`;
  if (gap.kind === 'level') return `Level with ${gap.name}`;
  return `${gap.by.toLocaleString()} ${unit} behind ${gap.name}`;
}
