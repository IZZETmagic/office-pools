// =============================================================
// HOW FAR YOU ARE FROM THE MEMBER ABOVE YOU
// =============================================================
// ⚠ THIS IS THE COPY. `lib/league/ladderGap.ts` IS CANONICAL — edit that one and
// re-copy, or `ladderGapMirror.guard.test.ts` fails. `mobile/` is a separate npm
// project whose `@/*` resolves to `mobile/*` and cannot import the web app's
// `lib/`; same forced duplication as `duelPhase.ts`, `duelSheet.ts` and
// `duelPoints.ts`.
//
// The reasoning — why the member ABOVE and never the leader, why one line on
// your own row, why a negative gap says nothing — is in the canonical file's
// banner. It is not repeated here, because two copies of an argument drift the
// same way two copies of a rule do.
//
// ⚠ NOTHING HERE MAY IMPORT REACT NATIVE. That is what keeps it inside the root
// vitest runner's reach (`mobile/**/__tests__/**/*.test.ts`).
// =============================================================

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
