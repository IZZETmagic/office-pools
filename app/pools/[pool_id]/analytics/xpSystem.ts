import type { PredictionResult, CrowdMatch, StreakData } from './analyticsHelpers'
import type { MatchData, PredictionData } from '../types'

// =============================================
// TYPES
// =============================================

export type XPTier = 'exact' | 'winner_gd' | 'winner' | 'submitted'

export type MatchXP = {
  matchId: string
  matchNumber: number
  stage: string
  matchDate: string
  tier: XPTier
  baseXP: number
  multiplier: number
  multipliedXP: number
}

export type BonusXPEvent = {
  type: string
  label: string
  emoji: string
  xp: number
  matchNumber?: number
  detail?: string
}

export type BadgeDefinition = {
  id: string
  emoji: string
  name: string
  xpBonus: number
  condition: string
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Legendary'
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum'
}

export type EarnedBadge = BadgeDefinition & {
  earnedAt?: number
}

export type LevelDefinition = {
  level: number
  name: string
  xpRequired: number
  badge?: string
}

export type XPBreakdown = {
  matchXP: MatchXP[]
  bonusEvents: BonusXPEvent[]
  earnedBadges: EarnedBadge[]
  totalBaseXP: number
  totalBonusXP: number
  totalBadgeXP: number
  totalXP: number
  currentLevel: LevelDefinition
  nextLevel: LevelDefinition | null
  xpToNextLevel: number
  levelProgress: number
}

// =============================================
// CONSTANTS
// =============================================

const STAGE_MULTIPLIERS: Record<string, number> = {
  group: 1.0,
  round_32: 1.25,
  round_16: 1.5,
  quarter_final: 1.75,
  semi_final: 2.0,
  third_place: 1.5,
  final: 2.5,
}

const BASE_XP: Record<XPTier, number> = {
  exact: 120,
  winner_gd: 60,
  winner: 30,
  submitted: 10,
}

export const LEVELS: LevelDefinition[] = [
  { level: 1, name: 'Rookie', xpRequired: 0 },
  { level: 2, name: 'Matchday Fan', xpRequired: 100 },
  { level: 3, name: 'Armchair Pundit', xpRequired: 300 },
  { level: 4, name: 'Club Analyst', xpRequired: 600, badge: 'Pundit Badge' },
  { level: 5, name: 'Stadium Regular', xpRequired: 1100 },
  { level: 6, name: 'Tactician', xpRequired: 1800, badge: 'Tactician Badge' },
  { level: 7, name: 'Scout', xpRequired: 2700, badge: 'Scout Badge' },
  { level: 8, name: 'Manager', xpRequired: 3900 },
  { level: 9, name: 'Oracle', xpRequired: 5500, badge: 'Oracle Badge' },
  { level: 10, name: 'Legend', xpRequired: 7500, badge: 'Legend Badge' },
]

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: 'sharpshooter', emoji: '🎯', name: 'Sharpshooter', xpBonus: 50, condition: 'Score 2 exact predictions', rarity: 'Uncommon', tier: 'Bronze' },
  { id: 'oracle', emoji: '🔮', name: 'Oracle', xpBonus: 75, condition: '3 consecutive correct results', rarity: 'Uncommon', tier: 'Bronze' },
  { id: 'dark_horse', emoji: '🐴', name: 'Dark Horse', xpBonus: 60, condition: 'Correctly predict an upset (<25% crowd)', rarity: 'Rare', tier: 'Silver' },
  { id: 'ice_breaker', emoji: '🧊', name: 'Ice Breaker', xpBonus: 40, condition: 'End a cold streak of 5+ misses', rarity: 'Uncommon', tier: 'Bronze' },
  { id: 'on_fire', emoji: '🔥', name: 'On Fire', xpBonus: 80, condition: 'Hit a 5-match correct streak', rarity: 'Rare', tier: 'Silver' },
  { id: 'top_dog', emoji: '👑', name: 'Top Dog', xpBonus: 100, condition: 'Reach #1 on the leaderboard', rarity: 'Very Rare', tier: 'Gold' },
  { id: 'globe_trotter', emoji: '🌍', name: 'Globe Trotter', xpBonus: 75, condition: 'Predict all 12 groups with 50%+ accuracy', rarity: 'Rare', tier: 'Silver' },
  { id: 'lightning_rod', emoji: '⚡', name: 'Lightning Rod', xpBonus: 50, condition: 'Submit all predictions before deadline', rarity: 'Common', tier: 'Bronze' },
  { id: 'stadium_regular', emoji: '🏟️', name: 'Stadium Regular', xpBonus: 60, condition: 'Predict all 104 matches', rarity: 'Uncommon', tier: 'Bronze' },
  { id: 'showtime', emoji: '🎪', name: 'Showtime', xpBonus: 80, condition: 'Correct exact score in a knockout match', rarity: 'Very Rare', tier: 'Gold' },
  { id: 'grand_finale', emoji: '🏆', name: 'Grand Finale', xpBonus: 120, condition: 'Correctly predict the World Cup Final result', rarity: 'Legendary', tier: 'Gold' },
  { id: 'legend', emoji: '⭐', name: 'Legend', xpBonus: 200, condition: 'Reach Level 10', rarity: 'Legendary', tier: 'Platinum' },
]

// =============================================
// COMPUTATION FUNCTIONS
// =============================================

/**
 * Compute base XP per match prediction.
 * Maps each prediction result to a base XP tier and applies the stage multiplier.
 * XP tiers are EXCLUSIVE — player earns the highest tier they qualify for.
 */
export function computeMatchXP(
  predictionResults: PredictionResult[],
  matches: MatchData[]
): MatchXP[] {
  const matchLookup = new Map<string, MatchData>()
  for (const m of matches) {
    matchLookup.set(m.match_id, m)
  }

  return predictionResults.map(pr => {
    const match = matchLookup.get(pr.matchId)
    const stage = pr.stage || match?.stage || 'group'
    const matchDate = match?.match_date || ''
    const multiplier = STAGE_MULTIPLIERS[stage] ?? 1.0

    // Exclusive tier — miss still earns "submitted" (10 XP)
    let tier: XPTier
    if (pr.type === 'exact') tier = 'exact'
    else if (pr.type === 'winner_gd') tier = 'winner_gd'
    else if (pr.type === 'winner') tier = 'winner'
    else tier = 'submitted'

    const baseXP = BASE_XP[tier]
    const multipliedXP = Math.round(baseXP * multiplier)

    return {
      matchId: pr.matchId,
      matchNumber: pr.matchNumber,
      stage,
      matchDate,
      tier,
      baseXP,
      multiplier,
      multipliedXP,
    }
  })
}

/**
 * Compute bonus XP events from prediction results, crowd data, and streaks.
 * Bonuses STACK on top of base XP.
 */
export function computeBonusXP(
  predictionResults: PredictionResult[],
  matches: MatchData[],
  crowdData: CrowdMatch[],
  streaks: StreakData
): BonusXPEvent[] {
  const events: BonusXPEvent[] = []
  const matchLookup = new Map<string, MatchData>()
  for (const m of matches) {
    matchLookup.set(m.match_id, m)
  }

  // Sort prediction results by match number
  const sorted = [...predictionResults].sort((a, b) => a.matchNumber - b.matchNumber)

  // ---- Hot Streak (3 correct): +25 ----
  // ---- Hot Streak (5 correct): +50 ----
  // Scan for consecutive correct runs
  let hotRun = 0
  let awarded3 = false
  let awarded5 = false
  for (const pr of sorted) {
    const isCorrect = pr.type !== 'miss'
    if (isCorrect) {
      hotRun++
      if (hotRun >= 5 && !awarded5) {
        events.push({
          type: 'hot_streak_5',
          label: 'Hot Streak (5)',
          emoji: '🔥',
          xp: 50,
          matchNumber: pr.matchNumber,
          detail: '5 consecutive correct results',
        })
        awarded5 = true
      } else if (hotRun >= 3 && !awarded3) {
        events.push({
          type: 'hot_streak_3',
          label: 'Hot Streak (3)',
          emoji: '🔥',
          xp: 25,
          matchNumber: pr.matchNumber,
          detail: '3 consecutive correct results',
        })
        awarded3 = true
      }
    } else {
      hotRun = 0
      awarded3 = false
      awarded5 = false
    }
  }

  // ---- Contrarian Win: +30 ----
  // Correct when 75%+ of pool picked a different result
  const crowdLookup = new Map<string, CrowdMatch>()
  for (const cm of crowdData) {
    crowdLookup.set(cm.matchId, cm)
  }
  for (const pr of sorted) {
    if (pr.type === 'miss') continue
    const cm = crowdLookup.get(pr.matchId)
    if (!cm) continue
    if (cm.userIsContrarian && cm.userWasCorrect) {
      events.push({
        type: 'contrarian_win',
        label: 'Contrarian Win',
        emoji: '🧠',
        xp: 30,
        matchNumber: pr.matchNumber,
        detail: `Correct when the crowd got it wrong`,
      })
    }
  }

  // ---- Upset Caller: +40 ----
  // Exact score on a match where the actual result was predicted by <25% of pool
  for (const pr of sorted) {
    if (pr.type !== 'exact') continue
    const cm = crowdLookup.get(pr.matchId)
    if (!cm) continue
    // Determine what % of pool got the actual result right
    const match = matchLookup.get(pr.matchId)
    if (!match || match.home_score_ft === null || match.away_score_ft === null) continue
    const actualResult = getWinner(match.home_score_ft, match.away_score_ft)
    const resultPct =
      actualResult === 'home' ? cm.homeWinPct
        : actualResult === 'draw' ? cm.drawPct
          : cm.awayWinPct
    if (resultPct < 25) {
      events.push({
        type: 'upset_caller',
        label: 'Upset Caller',
        emoji: '🤯',
        xp: 40,
        matchNumber: pr.matchNumber,
        detail: `Exact score on an upset (only ${Math.round(resultPct)}% predicted this result)`,
      })
    }
  }

  // ---- Clean Sweep: +50 ----
  // All matches correct on a single matchday (grouped by match_date)
  const matchdayMap = new Map<string, PredictionResult[]>()
  for (const pr of sorted) {
    const match = matchLookup.get(pr.matchId)
    if (!match?.match_date) continue
    const date = match.match_date.substring(0, 10) // YYYY-MM-DD
    const list = matchdayMap.get(date) || []
    list.push(pr)
    matchdayMap.set(date, list)
  }
  for (const [date, prs] of matchdayMap) {
    if (prs.length < 2) continue // need at least 2 matches to be a meaningful sweep
    const allCorrect = prs.every(pr => pr.type !== 'miss')
    if (allCorrect) {
      events.push({
        type: 'clean_sweep',
        label: 'Clean Sweep',
        emoji: '🧹',
        xp: 50,
        detail: `All ${prs.length} matches correct on ${date}`,
      })
    }
  }

  // ---- First Blood: +20 ----
  // First exact score of the tournament
  const firstExact = sorted.find(pr => pr.type === 'exact')
  if (firstExact) {
    events.push({
      type: 'first_blood',
      label: 'First Blood',
      emoji: '🩸',
      xp: 20,
      matchNumber: firstExact.matchNumber,
      detail: 'First exact score prediction',
    })
  }

  // ---- Group Guru: +35 ----
  // 80%+ accuracy across any group's matches
  const groupResults = new Map<string, { correct: number; total: number }>()
  for (const pr of sorted) {
    const match = matchLookup.get(pr.matchId)
    if (!match || match.stage !== 'group' || !match.group_letter) continue
    const group = match.group_letter
    const entry = groupResults.get(group) || { correct: 0, total: 0 }
    entry.total++
    if (pr.type !== 'miss') entry.correct++
    groupResults.set(group, entry)
  }
  for (const [group, stats] of groupResults) {
    if (stats.total >= 4 && stats.correct / stats.total >= 0.8) {
      events.push({
        type: 'group_guru',
        label: 'Group Guru',
        emoji: '🧑‍🏫',
        xp: 35,
        detail: `${Math.round((stats.correct / stats.total) * 100)}% accuracy in Group ${group}`,
      })
    }
  }

  // ---- Knockout King: +25 ----
  // Correct result in any knockout stage match
  for (const pr of sorted) {
    if (pr.type === 'miss') continue
    const match = matchLookup.get(pr.matchId)
    if (!match || match.stage === 'group') continue
    events.push({
      type: 'knockout_king',
      label: 'Knockout King',
      emoji: '👊',
      xp: 25,
      matchNumber: pr.matchNumber,
      detail: `Correct result in ${formatStageLabel(match.stage)}`,
    })
  }

  // ---- Grand Finale: +50 ----
  // Correct result on the final match
  for (const pr of sorted) {
    if (pr.type === 'miss') continue
    const match = matchLookup.get(pr.matchId)
    if (!match || match.stage !== 'final') continue
    events.push({
      type: 'grand_finale',
      label: 'Grand Finale',
      emoji: '🏆',
      xp: 50,
      matchNumber: pr.matchNumber,
      detail: 'Correctly predicted the World Cup Final',
    })
  }

  return events
}

/**
 * Evaluate badge unlock conditions against player data.
 */
export function computeEarnedBadges(
  predictionResults: PredictionResult[],
  matches: MatchData[],
  crowdData: CrowdMatch[],
  streaks: StreakData,
  entryPredictions: PredictionData[],
  entryRank: number | null,
  totalXPBeforeBadges: number,
  totalMatchCount: number
): EarnedBadge[] {
  const earned: EarnedBadge[] = []
  const sorted = [...predictionResults].sort((a, b) => a.matchNumber - b.matchNumber)
  const matchLookup = new Map<string, MatchData>()
  for (const m of matches) matchLookup.set(m.match_id, m)

  const crowdLookup = new Map<string, CrowdMatch>()
  for (const cm of crowdData) crowdLookup.set(cm.matchId, cm)

  // 🎯 Sharpshooter — 2 exact predictions
  const exactCount = sorted.filter(r => r.type === 'exact').length
  if (exactCount >= 2) {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'sharpshooter')!
    const secondExact = sorted.filter(r => r.type === 'exact')[1]
    earned.push({ ...badge, earnedAt: secondExact?.matchNumber })
  }

  // 🔮 Oracle — 3 consecutive correct results
  if (streaks.longestHotStreak >= 3) {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'oracle')!
    earned.push({ ...badge })
  }

  // 🐴 Dark Horse — correctly predict an upset (<25% crowd)
  for (const pr of sorted) {
    if (pr.type === 'miss') continue
    const cm = crowdLookup.get(pr.matchId)
    if (!cm) continue
    const match = matchLookup.get(pr.matchId)
    if (!match || match.home_score_ft === null || match.away_score_ft === null) continue
    const actualResult = getWinner(match.home_score_ft, match.away_score_ft)
    const resultPct =
      actualResult === 'home' ? cm.homeWinPct
        : actualResult === 'draw' ? cm.drawPct
          : cm.awayWinPct
    if (resultPct < 25) {
      const badge = BADGE_DEFINITIONS.find(b => b.id === 'dark_horse')!
      earned.push({ ...badge, earnedAt: pr.matchNumber })
      break // only award once
    }
  }

  // 🧊 Ice Breaker — end a cold streak of 5+ misses
  const timeline = streaks.timeline
  let coldRun = 0
  let brokeIce = false
  for (const entry of timeline) {
    if (entry.type === 'miss') {
      coldRun++
    } else {
      if (coldRun >= 5) {
        brokeIce = true
        break
      }
      coldRun = 0
    }
  }
  if (brokeIce) {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'ice_breaker')!
    earned.push({ ...badge })
  }

  // 🔥 On Fire — 5-match correct streak
  if (streaks.longestHotStreak >= 5) {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'on_fire')!
    earned.push({ ...badge })
  }

  // 👑 Top Dog — reach #1 on the leaderboard
  if (entryRank === 1) {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'top_dog')!
    earned.push({ ...badge })
  }

  // 🌍 Globe Trotter — predict all 12 groups with 50%+ accuracy
  const groupResults = new Map<string, { correct: number; total: number }>()
  for (const pr of sorted) {
    const match = matchLookup.get(pr.matchId)
    if (!match || match.stage !== 'group' || !match.group_letter) continue
    const group = match.group_letter
    const entry = groupResults.get(group) || { correct: 0, total: 0 }
    entry.total++
    if (pr.type !== 'miss') entry.correct++
    groupResults.set(group, entry)
  }
  let allGroupsQualify = groupResults.size >= 12
  if (allGroupsQualify) {
    for (const [, stats] of groupResults) {
      if (stats.total === 0 || stats.correct / stats.total < 0.5) {
        allGroupsQualify = false
        break
      }
    }
  }
  if (allGroupsQualify) {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'globe_trotter')!
    earned.push({ ...badge })
  }

  // ⚡ Lightning Rod — submit all predictions before deadline
  // Approximation: check if entry has predictions for all matches
  if (entryPredictions.length >= totalMatchCount && totalMatchCount > 0) {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'lightning_rod')!
    earned.push({ ...badge })
  }

  // 🏟️ Stadium Regular — predict all 104 matches
  if (entryPredictions.length >= 104) {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'stadium_regular')!
    earned.push({ ...badge })
  }

  // 🎪 Showtime — correct exact score in a knockout match
  for (const pr of sorted) {
    if (pr.type !== 'exact') continue
    const match = matchLookup.get(pr.matchId)
    if (!match || match.stage === 'group') continue
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'showtime')!
    earned.push({ ...badge, earnedAt: pr.matchNumber })
    break // only award once
  }

  // 🏆 Grand Finale — correctly predict the Final result
  for (const pr of sorted) {
    if (pr.type === 'miss') continue
    const match = matchLookup.get(pr.matchId)
    if (!match || match.stage !== 'final') continue
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'grand_finale')!
    earned.push({ ...badge, earnedAt: pr.matchNumber })
    break
  }

  // ⭐ Legend — reach Level 10 (7500 XP)
  // We compute this AFTER adding badge XP from above badges
  const badgeXPSoFar = earned.reduce((sum, b) => sum + b.xpBonus, 0)
  if (totalXPBeforeBadges + badgeXPSoFar >= 7500) {
    const badge = BADGE_DEFINITIONS.find(b => b.id === 'legend')!
    earned.push({ ...badge })
  }

  return earned
}

/**
 * Compute the player's current level from total XP.
 */
export function computeLevel(totalXP: number): {
  currentLevel: LevelDefinition
  nextLevel: LevelDefinition | null
  xpToNextLevel: number
  levelProgress: number
} {
  let currentLevel = LEVELS[0]
  for (const level of LEVELS) {
    if (totalXP >= level.xpRequired) {
      currentLevel = level
    } else {
      break
    }
  }

  const nextIdx = LEVELS.findIndex(l => l.level === currentLevel.level) + 1
  const nextLevel = nextIdx < LEVELS.length ? LEVELS[nextIdx] : null

  const xpToNextLevel = nextLevel ? nextLevel.xpRequired - totalXP : 0
  const levelProgress = nextLevel
    ? (totalXP - currentLevel.xpRequired) / (nextLevel.xpRequired - currentLevel.xpRequired)
    : 1 // max level

  return { currentLevel, nextLevel, xpToNextLevel, levelProgress: Math.min(Math.max(levelProgress, 0), 1) }
}

/**
 * Orchestrator: compute the full XP breakdown for an entry.
 */
export function computeFullXPBreakdown(params: {
  predictionResults: PredictionResult[]
  matches: MatchData[]
  crowdData: CrowdMatch[]
  streaks: StreakData
  entryPredictions: PredictionData[]
  entryRank: number | null
  totalMatches: number
}): XPBreakdown {
  const { predictionResults, matches, crowdData, streaks, entryPredictions, entryRank, totalMatches } = params

  // 1. Base XP from match predictions
  const matchXP = computeMatchXP(predictionResults, matches)
  const totalBaseXP = matchXP.reduce((sum, m) => sum + m.multipliedXP, 0)

  // 2. Bonus XP events
  const bonusEvents = computeBonusXP(predictionResults, matches, crowdData, streaks)
  const totalBonusXP = bonusEvents.reduce((sum, e) => sum + e.xp, 0)

  // 3. Badges (computed against base + bonus XP total)
  const xpBeforeBadges = totalBaseXP + totalBonusXP
  const earnedBadges = computeEarnedBadges(
    predictionResults,
    matches,
    crowdData,
    streaks,
    entryPredictions,
    entryRank,
    xpBeforeBadges,
    totalMatches
  )
  const totalBadgeXP = earnedBadges.reduce((sum, b) => sum + b.xpBonus, 0)

  // 4. Total XP and level
  const totalXP = totalBaseXP + totalBonusXP + totalBadgeXP
  const levelInfo = computeLevel(totalXP)

  return {
    matchXP,
    bonusEvents,
    earnedBadges,
    totalBaseXP,
    totalBonusXP,
    totalBadgeXP,
    totalXP,
    ...levelInfo,
  }
}

// =============================================
// HELPERS (internal)
// =============================================

function getWinner(home: number, away: number): 'home' | 'draw' | 'away' {
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'draw'
}

function formatStageLabel(stage: string): string {
  switch (stage) {
    case 'round_32': return 'Round of 32'
    case 'round_16': return 'Round of 16'
    case 'quarter_final': return 'Quarter-Finals'
    case 'semi_final': return 'Semi-Finals'
    case 'third_place': return 'Third Place'
    case 'final': return 'Final'
    default: return stage
  }
}
