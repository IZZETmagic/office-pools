// =============================================================
// WHICH OF A MEMBER'S ENTRIES DOES THE CARD SPEAK FOR?
// =============================================================
// A member can hold several entries in one pool, and a pool card has room for
// one. Every number on that card — the rank, the points, the level, whether it
// still owes a prediction — must describe THE SAME entry, or the card
// contradicts itself while every individual figure is correct.
//
// The rule: lowest rank wins, unranked sorts last, ties break on scored points.
//
// ⚠ `total_points` IS NOT THE TIE-BREAK. It is a dead legacy column that v2
// scoring never writes, so it is 0 for every entry — a comparison on it never
// fires, and "best entry" silently degenerated to "first entry the API
// returned". Read `scored_total_points`. See schema notes: scored total is
// canonical.
//
// ⚠⚠ THE ACCESSORS ARE THE ANSWER, SO THERE MUST ONLY EVER BE ONE SET OF THEM.
//
// Both callers — the card, and the progressive "still owes a pick" branch —
// pass rank and points from the home-scoring summary where there is one, and
// fall back to the stored columns otherwise. Selecting an entry by production's
// rank and then printing shadow's points would describe two different entries
// on one card.
//
// ⚠ It was not always so, and the failure is worth remembering. There used to
// be two copies of the rule, and the progressive branch could see only the
// stored columns because it ran a wave earlier than the fetch producing the
// summary. Stored totals have drifted from the engine before — ranks out by
// three — and where they disagreed the two copies selected DIFFERENT entries:
// an amber "predictions needed" describing one entry beside a rank describing
// another. One card, two answers, which is the signature of every pools-tab
// bug so far.
//
// Collapsing the fetch into a single wave put the summary in hand before either
// question is asked, and the two copies became one definition in
// `useHomeData`. Anyone adding a THIRD caller passes those same accessors; a
// caller that reads the stored columns directly is re-opening the bug.
//
// ⚠ NO REACT NATIVE IMPORTS — this file is reachable by the root vitest, which
// is the only reason the rule is asserted anywhere. See lib/needsPredictions.ts.
// =============================================================

/** Unranked entries sort last rather than first. */
export const UNRANKED = Number.MAX_SAFE_INTEGER;

/**
 * Pick the entry a pool card should speak for.
 *
 * `rankOf` and `pointsOf` are supplied by the caller so that the comparison —
 * the part that must never differ — is shared even while the inputs differ. See
 * the divergence note above.
 *
 * Returns null for no entries, which is a real case: an admin who deleted all
 * of theirs. The card must then show nothing rather than an arbitrary row.
 */
export function pickBestEntry<T>(
  entries: readonly T[],
  rankOf: (entry: T) => number,
  pointsOf: (entry: T) => number,
): T | null {
  if (entries.length === 0) return null;
  return entries.reduce((a, b) => {
    const aRank = rankOf(a);
    const bRank = rankOf(b);
    if (bRank < aRank) return b;
    if (bRank === aRank && pointsOf(b) > pointsOf(a)) return b;
    return a;
  });
}

/** The shape both callers' entries share, as far as this rule cares. */
export type StoredEntry = {
  entry_id: string;
  current_rank: number | null;
  scored_total_points: number | null;
};

/** Accessors reading the stored columns alone — the progressive branch's view. */
export const storedRankOf = (e: StoredEntry): number => e.current_rank ?? UNRANKED;
export const storedPointsOf = (e: StoredEntry): number => e.scored_total_points ?? 0;
