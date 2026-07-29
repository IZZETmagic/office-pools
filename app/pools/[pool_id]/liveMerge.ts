import type { MatchData, MatchScoreNarrow, MemberData, EntryStatsData } from './types'
import type { PoolLiveResponse } from '@/app/api/pools/[pool_id]/live/route'

/**
 * Merge helpers for the /live delta.
 *
 * These are pure and live outside the component on purpose. Score rows only
 * exist for matches that are completed or live (lib/scoring/core.ts:222), and
 * as of the 2026 World Cup finishing, EVERY match in the database is completed
 * — so the live delta is empty and the score-merge path below cannot be
 * exercised by any production data until the next competition starts.
 *
 * Untestable-in-practice merge logic guarding a product guarantee is a bad
 * trade, so the logic is extracted here and covered by unit tests instead.
 * See __tests__/liveMerge.test.ts.
 */

/**
 * Did a match finish since the client loaded?
 *
 * If so, its scores moved from the live half into the immutable half, which the
 * client holds from its initial render. A delta cannot express that transition,
 * so the caller must fall back to a full refresh rather than merge.
 */
export function needsFullRefresh(localMatches: MatchData[], live: PoolLiveResponse): boolean {
  const completedLocally = localMatches.filter((m) => m.status === 'completed').length
  return live.completed_matches !== completedLocally
}

/** Apply status and score changes for matches still in play. */
export function mergeMatches(prev: MatchData[], live: PoolLiveResponse): MatchData[] {
  if (live.matches.length === 0) return prev
  const byId = new Map(live.matches.map((m) => [m.match_id, m]))
  let changed = false
  const next = prev.map((m) => {
    const update = byId.get(m.match_id)
    if (!update) return m
    if (
      m.status === update.status &&
      m.home_score_ft === update.home_score_ft &&
      m.away_score_ft === update.away_score_ft
    ) {
      return m
    }
    changed = true
    return {
      ...m,
      status: update.status,
      home_score_ft: update.home_score_ft,
      away_score_ft: update.away_score_ft,
    }
  })
  // Preserve referential identity when nothing moved, so React skips the
  // re-render rather than re-rendering every tab on an idle 30s tick.
  return changed ? next : prev
}

/**
 * Apply new totals and ranks to each member's entries.
 *
 * Takes only the `entries` slice, not the whole response, because two callers
 * feed it now: the /live HTTP delta and the leaderboard broadcast, which carries
 * exactly these fields and nothing else.
 */
export function mergeMembers(
  prev: MemberData[],
  live: Pick<PoolLiveResponse, 'entries'>,
): MemberData[] {
  if (live.entries.length === 0) return prev
  const byEntry = new Map(live.entries.map((e) => [e.entry_id, e]))
  let changed = false
  const next = prev.map((member) => {
    if (!member.entries?.length) return member
    let memberChanged = false
    const entries = member.entries.map((entry) => {
      const update = byEntry.get(entry.entry_id)
      if (!update) return entry
      if (
        entry.match_points === update.match_points &&
        entry.bonus_points === update.bonus_points &&
        entry.point_adjustment === update.point_adjustment &&
        entry.scored_total_points === update.scored_total_points &&
        entry.current_rank === update.current_rank &&
        entry.previous_rank === update.previous_rank
      ) {
        return entry
      }
      memberChanged = true
      return {
        ...entry,
        match_points: update.match_points,
        bonus_points: update.bonus_points,
        point_adjustment: update.point_adjustment,
        scored_total_points: update.scored_total_points,
        current_rank: update.current_rank,
        previous_rank: update.previous_rank,
      }
    })
    if (!memberChanged) return member
    changed = true
    return { ...member, entries }
  })
  return changed ? next : prev
}

/**
 * Upsert live score rows by (entry_id, match_id).
 *
 * A match goes live exactly once and its rows are final once it completes, so
 * there is no ordering hazard here — a row is either updated in place or is new
 * because that match was scored for the first time since page load.
 */
export function mergeMatchScores(
  prev: MatchScoreNarrow[],
  live: PoolLiveResponse,
): MatchScoreNarrow[] {
  if (live.scores.length === 0) return prev
  const key = (entryId: string, matchId: string) => `${entryId}:${matchId}`
  const incoming = new Map(live.scores.map((s) => [key(s.entry_id, s.match_id), s]))

  const next = prev.map((row) => {
    const k = key(row.entry_id, row.match_id)
    const update = incoming.get(k)
    if (!update) return row
    incoming.delete(k)
    return update
  })
  // Whatever is left is a match scored for the first time since page load.
  for (const row of incoming.values()) next.push(row)
  return next
}

/**
 * Replace each entry's precomputed leaderboard stats with the fresher row.
 *
 * The delta always carries the WHOLE row per entry (they are ~10 fields), so
 * this is a straight replace rather than a field-wise merge — there is no
 * partial-stat state to reconcile.
 *
 * An entry absent from the delta keeps what it has: the response only omits an
 * entry when it has no stored row at all (no predictions), and in that case
 * there was nothing to update. An entry present in the delta but NOT in the
 * current array is appended — that is an entry whose first-ever row was written
 * while this page was open.
 */
export function mergeEntryStats(
  prev: EntryStatsData[],
  live: PoolLiveResponse,
): EntryStatsData[] {
  if (live.stats.length === 0) return prev
  const incoming = new Map(live.stats.map((s) => [s.entry_id, s]))

  let changed = false
  const next = prev.map((row) => {
    const update = incoming.get(row.entry_id)
    if (!update) return row
    incoming.delete(row.entry_id)
    // Preserve referential identity when the numbers are unmoved, so an idle
    // 30s tick doesn't re-render every leaderboard row.
    if (
      row.hit_rate === update.hit_rate &&
      row.exact_count === update.exact_count &&
      row.total_completed === update.total_completed &&
      row.contrarian_wins === update.contrarian_wins &&
      row.crowd_agreement_pct === update.crowd_agreement_pct &&
      row.total_xp === update.total_xp &&
      row.current_level === update.current_level &&
      row.current_streak?.type === update.current_streak?.type &&
      row.current_streak?.length === update.current_streak?.length &&
      row.last_five.join() === update.last_five.join()
    ) {
      return row
    }
    changed = true
    return update
  })

  for (const row of incoming.values()) {
    next.push(row)
    changed = true
  }
  return changed ? next : prev
}
