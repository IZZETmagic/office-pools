// =============================================================
// computeFullXPBreakdown — level ratchet
// =============================================================
// 2026-07-26. Migration 026 / drafts/2026-07-26_analytics_parity_result.md.
//
// Correcting the XP formula (badges.ts had been writing Σ match_points + badgeXP
// into the same columns as the real XP) moved 1,048 entries: 817 up and 231
// DOWN. A demotion means someone who was shown "Level 9 Oracle" silently
// becomes "Level 8 Manager".
//
// The product already refuses that for badges — badge_unlocks is append-only so
// "an earned badge never vanishes on recompute". `everReachedLevel` applies the
// same keep-once rule to levels.
//
// CONTRACT:
//   - total_xp stays HONEST and may fall.
//   - the displayed LEVEL never falls below everReachedLevel.
//   - nextLevel / xpToNextLevel stay consistent with the level actually shown
//     (no "Level 9" sitting next to a progress bar computed for Level 8).

import { describe, it, expect } from 'vitest'
import { computeFullXPBreakdown, LEVELS } from '@/app/pools/[pool_id]/analytics/xpSystem'
import type { StreakData, PredictionResult, CrowdMatch } from '@/app/pools/[pool_id]/analytics/analyticsHelpers'
import type { MatchData, PredictionData } from '@/app/pools/[pool_id]/types'

const EMPTY_STREAKS: StreakData = {
  currentStreak: { type: 'none', length: 0 },
  longestHotStreak: 0,
  longestColdStreak: 0,
  timeline: [],
}

/** Breakdown for an entry with no scored history — 0 XP, Level 1 live. */
const breakdown = (everReachedLevel?: number) =>
  computeFullXPBreakdown({
    predictionResults: [] as PredictionResult[],
    matches: [] as MatchData[],
    crowdData: [] as CrowdMatch[],
    streaks: EMPTY_STREAKS,
    entryPredictions: [] as PredictionData[],
    entryRank: null,
    totalMatches: 0,
    everReachedLevel,
  })

describe('computeFullXPBreakdown — level ratchet', () => {
  it('without everReachedLevel, level follows live XP', () => {
    expect(breakdown().currentLevel.level).toBe(1)
  })

  it('never displays a level below one already reached', () => {
    const b = breakdown(9)
    expect(b.currentLevel.level).toBe(9)
    expect(b.currentLevel.name).toBe('Oracle')
  })

  it('leaves total_xp honest — only the level ratchets', () => {
    // Same inputs ⇒ same XP. The ratchet must not inflate the XP number.
    expect(breakdown(9).totalXP).toBe(breakdown().totalXP)
  })

  it('keeps nextLevel consistent with the displayed level', () => {
    const b = breakdown(9)
    // Shown as Level 9 ⇒ the next rung must be Level 10, not Level 2.
    expect(b.nextLevel?.level).toBe(10)
    const lvl10 = LEVELS.find((l) => l.level === 10)!
    const lvl9 = LEVELS.find((l) => l.level === 9)!
    expect(b.xpToNextLevel).toBe(lvl10.xpRequired - lvl9.xpRequired)
  })

  it('is a floor, never a ceiling', () => {
    // everReached at or below the live level must leave the result untouched.
    expect(breakdown(1).currentLevel.level).toBe(breakdown().currentLevel.level)
    expect(breakdown(1).totalXP).toBe(breakdown().totalXP)
  })
})
