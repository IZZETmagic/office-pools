// "Best entry" for card surfaces (dashboard + pools list) = the entry holding
// the user's best (lowest) leaderboard position, so the card's rank, points,
// and form dots all describe the same entry. Unranked entries sort last; ties
// break on scored points, then stable order.
//
// Replaces best-by-`total_points` — a legacy column v2 scoring never writes
// (0 for every entry), which made the old reduce silently degenerate to
// "whichever entry the DB returned first".
//
// ⚠ AND IT HAPPENED AGAIN, one layer along. The columns below live on
// `pool_entries`, which is only the leaderboard for a **prod** pool. A shadow
// pool's ranks are in `shadow_entry_totals` and a league's are in
// `league_entry_totals` — and for a league entry `pool_entries.current_rank`
// and `.scored_total_points` are NULL for every row in production, so the
// reduce degenerates exactly as it used to: an arbitrary entry, whose points
// and form then get shown under a rank belonging to a different one.
//
// So the caller may pass the scoring rows it is ALREADY reading for the card.
// Where a row exists it wins; where it does not, the `pool_entries` values are
// used unchanged. A prod pool passes nothing and behaves exactly as before.

type Ranked = { current_rank?: number | null; scored_total_points?: number | null }

/**
 * @param scored Optional map of entry_id to the rank/points the CARD will
 *   display, from `readEntryScoring`. Pass it whenever the pool's leaderboard
 *   is not `pool_entries` — that is, for any shadow or league pool — so the
 *   entry chosen and the numbers shown come from one source.
 */
export function pickBestEntry<T extends Ranked & { entry_id?: string }>(
  entries: T[],
  scored?: Map<string, Ranked>,
): T | null {
  if (entries.length === 0) return null
  const rankOf = (e: T) => {
    const s = e.entry_id ? scored?.get(e.entry_id) : undefined
    return (s ?? e).current_rank ?? Number.MAX_SAFE_INTEGER
  }
  const pointsOf = (e: T) => {
    const s = e.entry_id ? scored?.get(e.entry_id) : undefined
    return (s ?? e).scored_total_points ?? 0
  }
  return entries.reduce((best, e) => {
    const bestRank = rankOf(best)
    const rank = rankOf(e)
    if (rank < bestRank) return e
    if (rank === bestRank && pointsOf(e) > pointsOf(best)) return e
    return best
  })
}
