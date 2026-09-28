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
// ⚠⚠ THE TWO CALLERS FEED THIS DIFFERENT NUMBERS, AND TODAY THAT IS A KNOWN
// DIVERGENCE, NOT A CHOICE.
//
// The card display passes rank and points from the home-scoring API summary
// where it has one, falling back to the stored columns — because selecting an
// entry by production's rank and then printing shadow's points describes two
// different entries on one card.
//
// The progressive "still owes a prediction" branch passes the STORED columns
// only. Not because that is right, but because it runs a wave earlier than the
// fetch that produces the summary, so the better numbers do not exist yet.
//
// Where the summary and the stored columns disagree — and they do; stored
// totals have drifted from the engine before, ranks out by three — those two
// callers can select DIFFERENT entries. The card then answers the same question
// twice: an amber "predictions needed" describing one entry beside a rank
// describing another. That is the exact signature of the pools-tab bugs, and it
// is one card giving two answers.
//
// The fix is not here. It is to make the summary available before this is asked
// (the wave collapse), at which point both callers pass the same accessors and
// the divergence ends. Until then it is pinned by a test so that the day
// somebody reorders those waves, the behaviour change is visible rather than
// discovered on a card.
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
