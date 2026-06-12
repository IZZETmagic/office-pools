// Server-side helper to resolve an entry's XP level for list surfaces (pool
// cards, dashboard) so they match the in-pool Form tab.
//
// The Form tab computes level LIVE from predictions/results/badges. The cheap
// snapshot `entry_xp_state.current_level` is only written during scoring, so it
// is empty PRE-tournament — which made cards show Level 1 even when the Form tab
// already shows Level 2 (a fully-submitted entry earns the Lightning Rod +
// Stadium Regular submission badges → 110 XP → Level 2).
//
// resolveEntryLevel() bridges that gap:
//   - If a scored snapshot exists, trust it (matches the Form tab post-scoring).
//   - Otherwise compute the pre-tournament level with the SAME engine the Form
//     tab uses, so the only XP in play (the submission badges) is counted
//     without duplicating any thresholds here.

import { computeFullXPBreakdown } from '@/app/pools/[pool_id]/analytics/xpSystem'
import type { StreakData, PredictionResult, CrowdMatch } from '@/app/pools/[pool_id]/analytics/analyticsHelpers'
import type { MatchData, PredictionData } from '@/app/pools/[pool_id]/types'

const EMPTY_STREAKS: StreakData = {
  currentStreak: { type: 'none', length: 0 },
  longestHotStreak: 0,
  longestColdStreak: 0,
  timeline: [],
}

/**
 * Pre-tournament level for an entry — driven purely by the submission badges
 * (Lightning Rod, Stadium Regular), the only XP available before any match is
 * scored. Reuses computeFullXPBreakdown so the badge math stays in one place.
 *
 * `predictionCount` is the number of predictions the entry has made; only its
 * length matters to the badge checks, so a sized empty array is sufficient.
 */
export function computePreTournamentLevel(predictionCount: number, totalMatches: number): number {
  const breakdown = computeFullXPBreakdown({
    predictionResults: [] as PredictionResult[],
    matches: [] as MatchData[],
    crowdData: [] as CrowdMatch[],
    streaks: EMPTY_STREAKS,
    entryPredictions: new Array(predictionCount) as unknown as PredictionData[],
    entryRank: null,
    totalMatches,
  })
  return breakdown.currentLevel.level
}

/**
 * Resolve an entry's level: prefer the scored snapshot, else compute the
 * pre-tournament level. Bracket-picker entries have no `predictions` rows, so
 * predictionCount is 0 → Level 1, matching their Form tab pre-tournament.
 */
export function resolveEntryLevel(opts: {
  snapshotLevel: number | null | undefined
  predictionCount: number
  totalMatches: number
}): number {
  if (opts.snapshotLevel != null) return opts.snapshotLevel
  return computePreTournamentLevel(opts.predictionCount, opts.totalMatches)
}
