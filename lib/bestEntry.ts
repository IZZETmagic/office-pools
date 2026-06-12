// "Best entry" for card surfaces (dashboard + pools list) = the entry holding
// the user's best (lowest) leaderboard position, so the card's rank, points,
// and form dots all describe the same entry. Unranked entries sort last; ties
// break on scored points, then stable order.
//
// Replaces best-by-`total_points` — a legacy column v2 scoring never writes
// (0 for every entry), which made the old reduce silently degenerate to
// "whichever entry the DB returned first".
export function pickBestEntry<
  T extends { current_rank?: number | null; scored_total_points?: number | null },
>(entries: T[]): T | null {
  if (entries.length === 0) return null
  return entries.reduce((best, e) => {
    const bestRank = best.current_rank ?? Number.MAX_SAFE_INTEGER
    const rank = e.current_rank ?? Number.MAX_SAFE_INTEGER
    if (rank < bestRank) return e
    if (rank === bestRank && (e.scored_total_points ?? 0) > (best.scored_total_points ?? 0)) return e
    return best
  })
}
