import type { BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick, MatchData, TeamData } from '../types'
import type { BonusXPEvent, EarnedBadge, BadgeDefinition, LevelDefinition } from './xpSystem'
import { computeLevel, LEVELS } from './xpSystem'
import type { GroupStanding } from '@/lib/tournament'
import type { MatchWithResult } from '@/lib/bracketPickerScoring'

// =============================================
// TYPES
// =============================================

export type BPGroupPositionXP = {
  group_letter: string
  team_id: string
  predicted_position: number
  actual_position: number | null
  correct: boolean
  xp: number
}

export type BPGroupXPSummary = {
  group_letter: string
  positions: BPGroupPositionXP[]
  qualifiersCorrect: boolean
  qualifiersBonusXP: number
  perfectOrder: boolean
  perfectOrderBonusXP: number
  totalGroupXP: number
}

export type BPThirdPlaceXP = {
  team_id: string
  group_letter: string
  predicted_qualifies: boolean
  actually_qualifies: boolean
  isActualThirdPlace: boolean
  correct: boolean
  xp: number
}

export type BPKnockoutPickXP = {
  match_id: string
  match_number: number
  stage: string
  predicted_winner: string
  actual_winner: string | null
  correct: boolean
  xp: number
}

export type BPXPBreakdown = {
  // Group stage
  groupXP: BPGroupXPSummary[]
  thirdPlaceXP: BPThirdPlaceXP[]
  thirdPlacePerfectBonusXP: number

  // Knockout stage
  knockoutXP: BPKnockoutPickXP[]

  // Bonuses & badges
  bonusEvents: BonusXPEvent[]
  earnedBadges: EarnedBadge[]

  // Totals
  totalGroupBaseXP: number
  totalGroupBonusXP: number
  totalThirdPlaceXP: number
  totalKnockoutBaseXP: number
  totalKnockoutBonusXP: number
  totalBadgeXP: number
  totalXP: number

  // Level (shared with existing system)
  currentLevel: LevelDefinition
  nextLevel: LevelDefinition | null
  xpToNextLevel: number
  levelProgress: number
}

// =============================================
// CONSTANTS
// =============================================

// ---- GROUP STAGE XP ----
const BP_GROUP_POSITION_XP: Record<number, number> = {
  1: 40,
  2: 30,
  3: 15,
  4: 10,
}

const BP_QUALIFIERS_CORRECT_BONUS = 20
const BP_PERFECT_GROUP_ORDER_BONUS = 50
const BP_TOP_HALF_SWEEP_BONUS = 30
const BP_GROUP_STAGE_GURU_BONUS = 100

// ---- THIRD PLACE XP ----
const BP_THIRD_PLACE_CORRECT_XP = 20
const BP_PERFECT_THIRD_PLACE_BONUS = 60

// ---- KNOCKOUT STAGE XP ----
const BP_KNOCKOUT_XP: Record<string, number> = {
  round_32: 30,
  round_16: 60,
  quarter_final: 100,
  semi_final: 150,
  third_place: 80,
  final: 200,
}

// ---- KNOCKOUT BONUSES ----
const BP_BRACKET_SURVIVAL_R32_BONUS = 40
const BP_BRACKET_SURVIVAL_R16_BONUS = 80
const BP_BRACKET_SURVIVAL_QF_BONUS = 150
const BP_BRACKET_SURVIVAL_SF_BONUS = 250
const BP_PERFECT_BRACKET_BONUS = 500
const BP_CORRECT_CHAMPION_BONUS = 100
const BP_CORRECT_FINALIST_PAIR_BONUS = 75
const BP_CINDERELLA_CALLER_BONUS = 60
const BP_QF_QUARTET_BONUS = 80

// ---- GROUP HALVES (for Top Half Sweep) ----
const GROUP_HALF_A = ['A', 'B', 'C', 'D', 'E', 'F']
const GROUP_HALF_B = ['G', 'H', 'I', 'J', 'K', 'L']

// ---- BRACKET PICKER BADGE DEFINITIONS ----
export const BP_BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: 'bp_cartographer', emoji: '🗺️', name: 'Cartographer', xpBonus: 50, condition: 'Perfect Group Order in any group', rarity: 'Uncommon', tier: 'Bronze' },
  { id: 'bp_world_map', emoji: '🌍', name: 'World Map', xpBonus: 100, condition: 'Perfect Group Order in 3+ groups', rarity: 'Rare', tier: 'Silver' },
  { id: 'bp_bracket_prophet', emoji: '🔮', name: 'Bracket Prophet', xpBonus: 75, condition: 'Bracket survives through R16', rarity: 'Rare', tier: 'Silver' },
  { id: 'bp_architect', emoji: '🏗️', name: 'Architect', xpBonus: 100, condition: 'Bracket survives through QF', rarity: 'Very Rare', tier: 'Gold' },
  { id: 'bp_sniper', emoji: '🎯', name: 'Sniper', xpBonus: 60, condition: 'Correctly predict champion', rarity: 'Rare', tier: 'Silver' },
  { id: 'bp_final_four', emoji: '🏆', name: 'Final Four', xpBonus: 80, condition: 'All 4 semi-finalists correct', rarity: 'Very Rare', tier: 'Gold' },
  { id: 'bp_perfect_bracket', emoji: '⭐', name: 'Perfect Bracket', xpBonus: 500, condition: 'Every pick correct', rarity: 'Legendary', tier: 'Platinum' },
  { id: 'bp_upset_specialist', emoji: '😮', name: 'Upset Specialist', xpBonus: 60, condition: '3+ underdogs advance beyond expectations', rarity: 'Rare', tier: 'Silver' },
  { id: 'bp_group_guardian', emoji: '🛡️', name: 'Group Guardian', xpBonus: 75, condition: 'All 12 groups qualifiers correct', rarity: 'Rare', tier: 'Silver' },
  { id: 'bp_quick_draw', emoji: '⚡', name: 'Quick Draw', xpBonus: 25, condition: 'Submit within first 24 hours', rarity: 'Common', tier: 'Bronze' },
  { id: 'bp_full_bracket', emoji: '📋', name: 'Full Bracket', xpBonus: 30, condition: 'Submit complete bracket', rarity: 'Common', tier: 'Bronze' },
]

// =============================================
// COMPUTATION FUNCTIONS
// =============================================

/**
 * Compute group stage XP from position predictions vs actual standings.
 */
export function computeBPGroupXP(
  groupRankings: BPGroupRanking[],
  actualGroupStandings: Map<string, GroupStanding[]>,
  completedGroups: Set<string>
): { groupXPSummaries: BPGroupXPSummary[]; totalGroupBaseXP: number; totalGroupBonusXP: number } {
  const summaries: BPGroupXPSummary[] = []
  let totalBase = 0
  let totalBonus = 0

  // Build a lookup of group rankings by group letter
  const rankingsByGroup = new Map<string, BPGroupRanking[]>()
  for (const r of groupRankings) {
    const list = rankingsByGroup.get(r.group_letter) || []
    list.push(r)
    rankingsByGroup.set(r.group_letter, list)
  }

  const allGroupLetters = [...new Set(groupRankings.map(r => r.group_letter))].sort()

  for (const letter of allGroupLetters) {
    const rankings = rankingsByGroup.get(letter) || []
    const standings = actualGroupStandings.get(letter) || []
    const isComplete = completedGroups.has(letter)

    const positions: BPGroupPositionXP[] = []

    for (const ranking of rankings) {
      let actualPosition: number | null = null
      let correct = false
      let xp = 0

      if (isComplete && standings.length > 0) {
        const actualIdx = standings.findIndex(s => s.team_id === ranking.team_id)
        if (actualIdx !== -1) {
          actualPosition = actualIdx + 1
          correct = ranking.predicted_position === actualPosition
          if (correct) {
            xp = BP_GROUP_POSITION_XP[ranking.predicted_position] ?? 0
          }
        }
      }

      positions.push({
        group_letter: letter,
        team_id: ranking.team_id,
        predicted_position: ranking.predicted_position,
        actual_position: actualPosition,
        correct,
        xp,
      })
    }

    // Check qualifiers correct: both top-2 teams correct (any order)
    let qualifiersCorrect = false
    let qualifiersBonusXP = 0
    if (isComplete && standings.length >= 2) {
      const actualTop2 = new Set([standings[0].team_id, standings[1].team_id])
      const predictedTop2 = new Set(
        rankings.filter(r => r.predicted_position <= 2).map(r => r.team_id)
      )
      qualifiersCorrect =
        predictedTop2.size === 2 &&
        [...predictedTop2].every(id => actualTop2.has(id))
      if (qualifiersCorrect) {
        qualifiersBonusXP = BP_QUALIFIERS_CORRECT_BONUS
      }
    }

    // Check perfect group order: all 4 positions exactly correct
    const perfectOrder = isComplete && positions.length === 4 && positions.every(p => p.correct)
    const perfectOrderBonusXP = perfectOrder ? BP_PERFECT_GROUP_ORDER_BONUS : 0

    const posXP = positions.reduce((sum, p) => sum + p.xp, 0)
    const groupTotal = posXP + qualifiersBonusXP + perfectOrderBonusXP
    totalBase += posXP
    totalBonus += qualifiersBonusXP + perfectOrderBonusXP

    summaries.push({
      group_letter: letter,
      positions,
      qualifiersCorrect,
      qualifiersBonusXP,
      perfectOrder,
      perfectOrderBonusXP,
      totalGroupXP: groupTotal,
    })
  }

  return { groupXPSummaries: summaries, totalGroupBaseXP: totalBase, totalGroupBonusXP: totalBonus }
}

/**
 * Compute third-place table XP.
 */
export function computeBPThirdPlaceXP(
  thirdPlaceRankings: BPThirdPlaceRanking[],
  actualThirdPlaceQualifierTeamIds: Set<string>,
  actualGroupStandings: Map<string, GroupStanding[]>,
  allGroupsComplete: boolean
): { thirdPlaceItems: BPThirdPlaceXP[]; perfectBonus: number; totalThirdPlaceXP: number } {
  if (!allGroupsComplete) {
    return { thirdPlaceItems: [], perfectBonus: 0, totalThirdPlaceXP: 0 }
  }

  // Build set of actual 3rd-place team IDs
  const actualThirdPlaceTeamIds = new Set<string>()
  for (const [, standings] of actualGroupStandings) {
    if (standings.length >= 3) {
      actualThirdPlaceTeamIds.add(standings[2].team_id)
    }
  }

  // Sort user's third-place rankings by rank (ascending)
  const sorted = [...thirdPlaceRankings].sort((a, b) => a.rank - b.rank)
  const predictedQualifierIds = new Set(sorted.slice(0, 8).map(r => r.team_id))

  const items: BPThirdPlaceXP[] = []
  let totalXP = 0

  for (const ranking of sorted) {
    const isActualThirdPlace = actualThirdPlaceTeamIds.has(ranking.team_id)
    const predicted_qualifies = predictedQualifierIds.has(ranking.team_id)
    const actually_qualifies = actualThirdPlaceQualifierTeamIds.has(ranking.team_id)

    let correct = false
    let xp = 0

    if (isActualThirdPlace && predicted_qualifies && actually_qualifies) {
      correct = true
      xp = BP_THIRD_PLACE_CORRECT_XP
    }

    items.push({
      team_id: ranking.team_id,
      group_letter: ranking.group_letter,
      predicted_qualifies,
      actually_qualifies,
      isActualThirdPlace,
      correct,
      xp,
    })
    totalXP += xp
  }

  // Perfect third place table: all 6 advancing 3rd place teams correct
  let perfectBonus = 0
  if (actualThirdPlaceQualifierTeamIds.size >= 6) {
    const correctAdvancingCount = items.filter(i => i.correct).length
    // Need all actual qualifiers to be predicted correctly
    const allCorrect =
      predictedQualifierIds.size >= 8 &&
      [...actualThirdPlaceQualifierTeamIds].every(id => predictedQualifierIds.has(id))
    if (allCorrect && correctAdvancingCount >= 6) {
      perfectBonus = BP_PERFECT_THIRD_PLACE_BONUS
    }
  }

  return { thirdPlaceItems: items, perfectBonus, totalThirdPlaceXP: totalXP + perfectBonus }
}

/**
 * Compute knockout stage XP per pick.
 */
export function computeBPKnockoutXP(
  knockoutPicks: BPKnockoutPick[],
  completedMatches: MatchWithResult[]
): { knockoutItems: BPKnockoutPickXP[]; totalKnockoutBaseXP: number } {
  const matchById = new Map<string, MatchWithResult>()
  for (const m of completedMatches) {
    matchById.set(m.match_id, m)
  }

  const items: BPKnockoutPickXP[] = []
  let total = 0

  for (const pick of knockoutPicks) {
    const actualMatch = matchById.get(pick.match_id)
    const matchCompleted = actualMatch?.is_completed ?? false
    const stage = actualMatch?.stage ?? ''

    let actual_winner: string | null = null
    if (matchCompleted && actualMatch) {
      if (actualMatch.winner_team_id) {
        actual_winner = actualMatch.winner_team_id
      } else if (actualMatch.home_score_ft != null && actualMatch.away_score_ft != null) {
        if (actualMatch.home_score_ft > actualMatch.away_score_ft) {
          actual_winner = actualMatch.home_team_id ?? null
        } else if (actualMatch.away_score_ft > actualMatch.home_score_ft) {
          actual_winner = actualMatch.away_team_id ?? null
        } else if (actualMatch.home_score_pso != null && actualMatch.away_score_pso != null) {
          actual_winner = actualMatch.home_score_pso > actualMatch.away_score_pso
            ? (actualMatch.home_team_id ?? null)
            : (actualMatch.away_team_id ?? null)
        }
      }
    }

    const correct = matchCompleted && actual_winner != null && pick.winner_team_id === actual_winner
    const xp = correct ? (BP_KNOCKOUT_XP[stage] ?? 0) : 0

    items.push({
      match_id: pick.match_id,
      match_number: pick.match_number,
      stage,
      predicted_winner: pick.winner_team_id,
      actual_winner,
      correct,
      xp,
    })
    total += xp
  }

  return { knockoutItems: items, totalKnockoutBaseXP: total }
}

/**
 * Compute bonus XP events for bracket picker.
 */
export function computeBPBonusXP(params: {
  groupXPSummaries: BPGroupXPSummary[]
  knockoutItems: BPKnockoutPickXP[]
  teams: TeamData[]
  completedMatches: MatchWithResult[]
}): BonusXPEvent[] {
  const { groupXPSummaries, knockoutItems, teams, completedMatches } = params
  const events: BonusXPEvent[] = []

  // ---- Top Half Sweep: all 6 groups in half A-F or G-L with both qualifiers correct ----
  const qualCorrectGroups = new Set(
    groupXPSummaries.filter(g => g.qualifiersCorrect).map(g => g.group_letter)
  )

  const halfACorrect = GROUP_HALF_A.every(l => qualCorrectGroups.has(l))
  const halfBCorrect = GROUP_HALF_B.every(l => qualCorrectGroups.has(l))

  if (halfACorrect) {
    events.push({
      type: 'bp_top_half_sweep',
      label: 'Top Half Sweep',
      emoji: '🌟',
      xp: BP_TOP_HALF_SWEEP_BONUS,
      detail: 'All 6 groups in half A-F have both qualifiers correct',
    })
  }
  if (halfBCorrect) {
    events.push({
      type: 'bp_top_half_sweep',
      label: 'Top Half Sweep',
      emoji: '🌟',
      xp: BP_TOP_HALF_SWEEP_BONUS,
      detail: 'All 6 groups in half G-L have both qualifiers correct',
    })
  }

  // ---- Group Stage Guru: all 12 groups both qualifiers correct ----
  if (qualCorrectGroups.size >= 12) {
    events.push({
      type: 'bp_group_stage_guru',
      label: 'Group Stage Guru',
      emoji: '🧠',
      xp: BP_GROUP_STAGE_GURU_BONUS,
      detail: 'All 12 groups have both qualifiers correct',
    })
  }

  // ---- Knockout bonuses (only check completed rounds) ----
  const completedKnockout = knockoutItems.filter(k => k.actual_winner !== null)
  if (completedKnockout.length === 0) return events

  const r32Items = completedKnockout.filter(k => k.stage === 'round_32')
  const r16Items = completedKnockout.filter(k => k.stage === 'round_16')
  const qfItems = completedKnockout.filter(k => k.stage === 'quarter_final')
  const sfItems = completedKnockout.filter(k => k.stage === 'semi_final')
  const thirdPlaceItems = completedKnockout.filter(k => k.stage === 'third_place')
  const finalItems = completedKnockout.filter(k => k.stage === 'final')

  const allR32Correct = r32Items.length === 16 && r32Items.every(k => k.correct)
  const allR16Correct = r16Items.length === 8 && r16Items.every(k => k.correct)
  const allQFCorrect = qfItems.length === 4 && qfItems.every(k => k.correct)
  const allSFCorrect = sfItems.length === 2 && sfItems.every(k => k.correct)
  const allThirdCorrect = thirdPlaceItems.length === 1 && thirdPlaceItems.every(k => k.correct)
  const allFinalCorrect = finalItems.length === 1 && finalItems.every(k => k.correct)

  // Bracket Survival chain (cumulative)
  if (allR32Correct) {
    events.push({
      type: 'bp_bracket_survival_r32',
      label: 'Bracket Survival (R32)',
      emoji: '🏰',
      xp: BP_BRACKET_SURVIVAL_R32_BONUS,
      detail: 'All 16 Round of 32 picks correct',
    })
  }
  if (allR32Correct && allR16Correct) {
    events.push({
      type: 'bp_bracket_survival_r16',
      label: 'Bracket Survival (R16)',
      emoji: '🏰',
      xp: BP_BRACKET_SURVIVAL_R16_BONUS,
      detail: 'Bracket intact through Round of 16',
    })
  }
  if (allR32Correct && allR16Correct && allQFCorrect) {
    events.push({
      type: 'bp_bracket_survival_qf',
      label: 'Bracket Survival (QF)',
      emoji: '🏰',
      xp: BP_BRACKET_SURVIVAL_QF_BONUS,
      detail: 'Bracket intact through Quarter-Finals',
    })
  }
  if (allR32Correct && allR16Correct && allQFCorrect && allSFCorrect) {
    events.push({
      type: 'bp_bracket_survival_sf',
      label: 'Bracket Survival (SF)',
      emoji: '🏰',
      xp: BP_BRACKET_SURVIVAL_SF_BONUS,
      detail: 'Bracket intact through Semi-Finals',
    })
  }

  // Perfect Bracket: every knockout pick correct
  if (allR32Correct && allR16Correct && allQFCorrect && allSFCorrect && allThirdCorrect && allFinalCorrect) {
    events.push({
      type: 'bp_perfect_bracket',
      label: 'Perfect Bracket',
      emoji: '💎',
      xp: BP_PERFECT_BRACKET_BONUS,
      detail: 'Every single knockout pick correct',
    })
  }

  // Quarter-Final Quartet: all 4 QF winners correct
  if (allQFCorrect) {
    events.push({
      type: 'bp_qf_quartet',
      label: 'Quarter-Final Quartet',
      emoji: '4️⃣',
      xp: BP_QF_QUARTET_BONUS,
      detail: 'All 4 Quarter-Final winners correct',
    })
  }

  // Correct Finalist Pair: both teams in the final are correct
  if (sfItems.length === 2) {
    const sfWinners = sfItems.filter(k => k.correct).map(k => k.predicted_winner)
    if (sfWinners.length === 2) {
      // Both SF winners correct means both finalists correct
      events.push({
        type: 'bp_correct_finalist_pair',
        label: 'Correct Finalist Pair',
        emoji: '🤝',
        xp: BP_CORRECT_FINALIST_PAIR_BONUS,
        detail: 'Both teams in the Final correctly predicted',
      })
    }
  }

  // Correct Champion: final winner correct
  if (finalItems.length === 1 && finalItems[0].correct) {
    events.push({
      type: 'bp_correct_champion',
      label: 'Correct Champion',
      emoji: '👑',
      xp: BP_CORRECT_CHAMPION_BONUS,
      detail: 'Correctly predicted the World Cup winner',
    })
  }

  // Cinderella Caller: correctly predict underdog advancing 2+ rounds
  const cinderellaCount = countCinderellaPicks(knockoutItems, teams, completedMatches)
  if (cinderellaCount >= 3) {
    events.push({
      type: 'bp_cinderella_caller',
      label: 'Cinderella Caller',
      emoji: '✨',
      xp: BP_CINDERELLA_CALLER_BONUS,
      detail: `${cinderellaCount} underdogs correctly predicted to advance deep`,
    })
  }

  return events
}

/**
 * Evaluate bracket-picker-specific badge conditions.
 */
export function computeBPEarnedBadges(params: {
  groupXPSummaries: BPGroupXPSummary[]
  knockoutItems: BPKnockoutPickXP[]
  bonusEvents: BonusXPEvent[]
  totalXPBeforeBadges: number
  submittedAt: string | null
  poolCreatedAt: string
  groupRankings: BPGroupRanking[]
  thirdPlaceRankings: BPThirdPlaceRanking[]
  knockoutPicks: BPKnockoutPick[]
}): EarnedBadge[] {
  const {
    groupXPSummaries,
    knockoutItems,
    bonusEvents,
    totalXPBeforeBadges,
    submittedAt,
    poolCreatedAt,
    groupRankings,
    thirdPlaceRankings,
    knockoutPicks,
  } = params

  const earned: EarnedBadge[] = []
  const completedKnockout = knockoutItems.filter(k => k.actual_winner !== null)

  // Helpers
  const hasBonusType = (type: string) => bonusEvents.some(e => e.type === type)
  const perfectGroupCount = groupXPSummaries.filter(g => g.perfectOrder).length

  // 📋 Full Bracket: all picks submitted
  if (groupRankings.length >= 48 && thirdPlaceRankings.length >= 12 && knockoutPicks.length >= 32) {
    const badge = BP_BADGE_DEFINITIONS.find(b => b.id === 'bp_full_bracket')!
    earned.push({ ...badge })
  }

  // ⚡ Quick Draw: submitted within 24 hours of pool creation
  if (submittedAt && poolCreatedAt) {
    const submitted = new Date(submittedAt).getTime()
    const created = new Date(poolCreatedAt).getTime()
    if (submitted - created <= 24 * 60 * 60 * 1000) {
      const badge = BP_BADGE_DEFINITIONS.find(b => b.id === 'bp_quick_draw')!
      earned.push({ ...badge })
    }
  }

  // 🗺️ Cartographer: Perfect Group Order in any group
  if (perfectGroupCount >= 1) {
    const badge = BP_BADGE_DEFINITIONS.find(b => b.id === 'bp_cartographer')!
    earned.push({ ...badge })
  }

  // 🌍 World Map: Perfect Group Order in 3+ groups
  if (perfectGroupCount >= 3) {
    const badge = BP_BADGE_DEFINITIONS.find(b => b.id === 'bp_world_map')!
    earned.push({ ...badge })
  }

  // 🛡️ Group Guardian: all 12 groups qualifiers correct
  if (hasBonusType('bp_group_stage_guru')) {
    const badge = BP_BADGE_DEFINITIONS.find(b => b.id === 'bp_group_guardian')!
    earned.push({ ...badge })
  }

  // 🔮 Bracket Prophet: bracket survives through R16
  if (hasBonusType('bp_bracket_survival_r16')) {
    const badge = BP_BADGE_DEFINITIONS.find(b => b.id === 'bp_bracket_prophet')!
    earned.push({ ...badge })
  }

  // 🏗️ Architect: bracket survives through QF
  if (hasBonusType('bp_bracket_survival_qf')) {
    const badge = BP_BADGE_DEFINITIONS.find(b => b.id === 'bp_architect')!
    earned.push({ ...badge })
  }

  // 🎯 Sniper: correctly predict champion
  if (hasBonusType('bp_correct_champion')) {
    const badge = BP_BADGE_DEFINITIONS.find(b => b.id === 'bp_sniper')!
    earned.push({ ...badge })
  }

  // 🏆 Final Four: all 4 semi-finalists correct
  // All 4 SF picks correct means the 4 teams that reached the SF were predicted correctly
  const sfItems = completedKnockout.filter(k => k.stage === 'semi_final')
  const qfItems = completedKnockout.filter(k => k.stage === 'quarter_final')
  if (qfItems.length === 4 && qfItems.every(k => k.correct) && sfItems.length === 2) {
    // All QF winners = all 4 SF teams
    const badge = BP_BADGE_DEFINITIONS.find(b => b.id === 'bp_final_four')!
    earned.push({ ...badge })
  }

  // 😮 Upset Specialist: 3+ underdogs advance
  if (hasBonusType('bp_cinderella_caller')) {
    const badge = BP_BADGE_DEFINITIONS.find(b => b.id === 'bp_upset_specialist')!
    earned.push({ ...badge })
  }

  // ⭐ Perfect Bracket: every pick correct
  if (hasBonusType('bp_perfect_bracket')) {
    const allGroupsCorrect = groupXPSummaries.every(g => g.perfectOrder)
    if (allGroupsCorrect) {
      const badge = BP_BADGE_DEFINITIONS.find(b => b.id === 'bp_perfect_bracket')!
      earned.push({ ...badge })
    }
  }

  return earned
}

/**
 * Orchestrator: compute the full bracket picker XP breakdown.
 */
export function computeFullBPXPBreakdown(params: {
  groupRankings: BPGroupRanking[]
  thirdPlaceRankings: BPThirdPlaceRanking[]
  knockoutPicks: BPKnockoutPick[]
  actualGroupStandings: Map<string, GroupStanding[]>
  actualThirdPlaceQualifierTeamIds: Set<string>
  completedMatches: MatchWithResult[]
  matches: MatchData[]
  teams: TeamData[]
  submittedAt: string | null
  poolCreatedAt: string
}): BPXPBreakdown {
  const {
    groupRankings,
    thirdPlaceRankings,
    knockoutPicks,
    actualGroupStandings,
    actualThirdPlaceQualifierTeamIds,
    completedMatches,
    matches,
    teams,
    submittedAt,
    poolCreatedAt,
  } = params

  // Determine completed groups
  const groupMatchCounts = new Map<string, { total: number; completed: number }>()
  for (const m of matches) {
    if (m.stage === 'group' && m.group_letter) {
      const counts = groupMatchCounts.get(m.group_letter) ?? { total: 0, completed: 0 }
      counts.total += 1
      if (m.is_completed) counts.completed += 1
      groupMatchCounts.set(m.group_letter, counts)
    }
  }
  const completedGroups = new Set<string>()
  for (const [letter, counts] of groupMatchCounts) {
    if (counts.total >= 6 && counts.completed >= 6) {
      completedGroups.add(letter)
    }
  }
  const allGroupsComplete = completedGroups.size >= 12

  // 1. Group XP
  const { groupXPSummaries, totalGroupBaseXP, totalGroupBonusXP } = computeBPGroupXP(
    groupRankings, actualGroupStandings, completedGroups
  )

  // 2. Third Place XP
  const { thirdPlaceItems, perfectBonus: thirdPlacePerfectBonusXP, totalThirdPlaceXP } = computeBPThirdPlaceXP(
    thirdPlaceRankings, actualThirdPlaceQualifierTeamIds, actualGroupStandings, allGroupsComplete
  )

  // 3. Knockout XP
  const { knockoutItems, totalKnockoutBaseXP } = computeBPKnockoutXP(knockoutPicks, completedMatches)

  // 4. Bonus events
  const bonusEvents = computeBPBonusXP({
    groupXPSummaries,
    knockoutItems,
    teams,
    completedMatches,
  })
  const totalKnockoutBonusXP = bonusEvents.reduce((sum, e) => sum + e.xp, 0)

  // 5. XP before badges
  const xpBeforeBadges = totalGroupBaseXP + totalGroupBonusXP + totalThirdPlaceXP + totalKnockoutBaseXP + totalKnockoutBonusXP

  // 6. Badges
  const earnedBadges = computeBPEarnedBadges({
    groupXPSummaries,
    knockoutItems,
    bonusEvents,
    totalXPBeforeBadges: xpBeforeBadges,
    submittedAt,
    poolCreatedAt,
    groupRankings,
    thirdPlaceRankings,
    knockoutPicks,
  })
  const totalBadgeXP = earnedBadges.reduce((sum, b) => sum + b.xpBonus, 0)

  // 7. Total XP and level
  const totalXP = xpBeforeBadges + totalBadgeXP
  const levelInfo = computeLevel(totalXP)

  return {
    groupXP: groupXPSummaries,
    thirdPlaceXP: thirdPlaceItems,
    thirdPlacePerfectBonusXP,
    knockoutXP: knockoutItems,
    bonusEvents,
    earnedBadges,
    totalGroupBaseXP,
    totalGroupBonusXP,
    totalThirdPlaceXP,
    totalKnockoutBaseXP,
    totalKnockoutBonusXP,
    totalBadgeXP,
    totalXP,
    ...levelInfo,
  }
}

// =============================================
// POOL COMPARISON
// =============================================

export type BPPoolComparison = {
  // Overall accuracy (0-100)
  userOverallAccuracy: number
  poolAvgOverallAccuracy: number

  // Category breakdown
  userGroupCorrect: number
  userGroupTotal: number
  poolAvgGroupCorrect: number

  userKnockoutCorrect: number
  userKnockoutTotal: number
  poolAvgKnockoutCorrect: number

  userThirdCorrect: number
  userThirdTotal: number
  poolAvgThirdCorrect: number

  // Knockout consensus/contrarian
  consensusCount: number
  contrarianCount: number
  contrarianWins: number
  poolAvgConsensus: number
  poolAvgContrarian: number
  poolAvgContrarianWins: number

  // Pool stats
  totalEntries: number
  totalScoredPicks: number
  mostPopularChampion: { team_id: string; count: number; pct: number } | null
}

/**
 * Compare the user's bracket picks against the pool average.
 *
 * For each submitted entry, computes group position accuracy, knockout pick
 * accuracy, and third-place qualifier accuracy, then averages across the pool.
 * Also computes consensus/contrarian metrics for knockout picks.
 */
export function computeBPPoolComparison(params: {
  userGroupRankings: BPGroupRanking[]
  userThirdPlaceRankings: BPThirdPlaceRanking[]
  userKnockoutPicks: BPKnockoutPick[]
  allGroupRankings: BPGroupRanking[]
  allThirdPlaceRankings: BPThirdPlaceRanking[]
  allKnockoutPicks: BPKnockoutPick[]
  actualGroupStandings: Map<string, GroupStanding[]>
  actualThirdPlaceQualifierTeamIds: Set<string>
  completedKnockoutMatches: MatchWithResult[]
  matches: MatchData[]
  submittedEntryIds: Set<string>
}): BPPoolComparison {
  const {
    userGroupRankings, userThirdPlaceRankings, userKnockoutPicks,
    allGroupRankings, allThirdPlaceRankings, allKnockoutPicks,
    actualGroupStandings, actualThirdPlaceQualifierTeamIds,
    completedKnockoutMatches, matches, submittedEntryIds,
  } = params

  // --- Determine completed groups ---
  const groupMatchCounts = new Map<string, number>()
  for (const m of matches) {
    if (m.stage === 'group' && m.group_letter && m.is_completed) {
      groupMatchCounts.set(m.group_letter, (groupMatchCounts.get(m.group_letter) ?? 0) + 1)
    }
  }
  const completedGroups = new Set<string>()
  for (const [letter, count] of groupMatchCounts) {
    if (count >= 6) completedGroups.add(letter)
  }

  // --- Actual third-place team IDs (finished 3rd in completed groups) ---
  const actualThirdPlaceTeamIds = new Set<string>()
  for (const letter of completedGroups) {
    const standings = actualGroupStandings.get(letter)
    if (standings && standings.length >= 3) {
      actualThirdPlaceTeamIds.add(standings[2].team_id)
    }
  }

  // --- Knockout winners map ---
  const knockoutWinners = new Map<string, string>()
  for (const m of completedKnockoutMatches) {
    if (!m.is_completed) continue
    let winner: string | null = m.winner_team_id ?? null
    if (!winner && m.home_score_ft != null && m.away_score_ft != null) {
      if (m.home_score_ft > m.away_score_ft) winner = m.home_team_id ?? null
      else if (m.away_score_ft > m.home_score_ft) winner = m.away_team_id ?? null
      else if (m.home_score_pso != null && m.away_score_pso != null) {
        winner = m.home_score_pso > m.away_score_pso
          ? (m.home_team_id ?? null) : (m.away_team_id ?? null)
      }
    }
    if (winner) knockoutWinners.set(m.match_id, winner)
  }

  // --- Group all picks by entry_id ---
  const entriesGroupData = new Map<string, BPGroupRanking[]>()
  for (const r of allGroupRankings) {
    if (!submittedEntryIds.has(r.entry_id)) continue
    const list = entriesGroupData.get(r.entry_id) ?? []
    list.push(r)
    entriesGroupData.set(r.entry_id, list)
  }
  const entriesThirdData = new Map<string, BPThirdPlaceRanking[]>()
  for (const r of allThirdPlaceRankings) {
    if (!submittedEntryIds.has(r.entry_id)) continue
    const list = entriesThirdData.get(r.entry_id) ?? []
    list.push(r)
    entriesThirdData.set(r.entry_id, list)
  }
  const entriesKnockoutData = new Map<string, BPKnockoutPick[]>()
  for (const r of allKnockoutPicks) {
    if (!submittedEntryIds.has(r.entry_id)) continue
    const list = entriesKnockoutData.get(r.entry_id) ?? []
    list.push(r)
    entriesKnockoutData.set(r.entry_id, list)
  }

  // --- Compute per-entry accuracy & accumulate pool totals ---
  let totalGroupCorrect = 0, totalKnockoutCorrect = 0, totalThirdCorrect = 0
  let sampleGroupTotal = 0, sampleKnockoutTotal = 0, sampleThirdTotal = 0
  const entryCount = submittedEntryIds.size

  for (const entryId of submittedEntryIds) {
    // Group accuracy
    const gRankings = entriesGroupData.get(entryId) ?? []
    let gCorrect = 0, gTotal = 0
    for (const r of gRankings) {
      if (!completedGroups.has(r.group_letter)) continue
      const standings = actualGroupStandings.get(r.group_letter)
      if (!standings) continue
      gTotal++
      const actualIdx = standings.findIndex(s => s.team_id === r.team_id)
      if (actualIdx !== -1 && r.predicted_position === actualIdx + 1) gCorrect++
    }
    totalGroupCorrect += gCorrect
    if (gTotal > sampleGroupTotal) sampleGroupTotal = gTotal

    // Third place accuracy
    const tRankings = entriesThirdData.get(entryId) ?? []
    const sortedThird = [...tRankings].sort((a, b) => a.rank - b.rank)
    const predictedQuals = new Set(sortedThird.slice(0, 8).map(r => r.team_id))
    let tCorrect = 0, tTotal = 0
    for (const r of sortedThird) {
      if (!actualThirdPlaceTeamIds.has(r.team_id)) continue
      tTotal++
      if (predictedQuals.has(r.team_id) === actualThirdPlaceQualifierTeamIds.has(r.team_id)) tCorrect++
    }
    totalThirdCorrect += tCorrect
    if (tTotal > sampleThirdTotal) sampleThirdTotal = tTotal

    // Knockout accuracy
    const kPicks = entriesKnockoutData.get(entryId) ?? []
    let kCorrect = 0, kTotal = 0
    for (const pick of kPicks) {
      const actualWinner = knockoutWinners.get(pick.match_id)
      if (!actualWinner) continue
      kTotal++
      if (pick.winner_team_id === actualWinner) kCorrect++
    }
    totalKnockoutCorrect += kCorrect
    if (kTotal > sampleKnockoutTotal) sampleKnockoutTotal = kTotal
  }

  const poolAvgGroupCorrect = entryCount > 0 ? totalGroupCorrect / entryCount : 0
  const poolAvgKnockoutCorrect = entryCount > 0 ? totalKnockoutCorrect / entryCount : 0
  const poolAvgThirdCorrect = entryCount > 0 ? totalThirdCorrect / entryCount : 0

  // --- User's own accuracy ---
  let userGroupCorrect = 0, userGroupTotal = 0
  for (const r of userGroupRankings) {
    if (!completedGroups.has(r.group_letter)) continue
    const standings = actualGroupStandings.get(r.group_letter)
    if (!standings) continue
    userGroupTotal++
    const actualIdx = standings.findIndex(s => s.team_id === r.team_id)
    if (actualIdx !== -1 && r.predicted_position === actualIdx + 1) userGroupCorrect++
  }

  let userThirdCorrect = 0, userThirdTotal = 0
  const userSortedThird = [...userThirdPlaceRankings].sort((a, b) => a.rank - b.rank)
  const userPredictedQuals = new Set(userSortedThird.slice(0, 8).map(r => r.team_id))
  for (const r of userSortedThird) {
    if (!actualThirdPlaceTeamIds.has(r.team_id)) continue
    userThirdTotal++
    if (userPredictedQuals.has(r.team_id) === actualThirdPlaceQualifierTeamIds.has(r.team_id)) userThirdCorrect++
  }

  let userKnockoutCorrect = 0, userKnockoutTotal = 0
  for (const pick of userKnockoutPicks) {
    const actualWinner = knockoutWinners.get(pick.match_id)
    if (!actualWinner) continue
    userKnockoutTotal++
    if (pick.winner_team_id === actualWinner) userKnockoutCorrect++
  }

  // Overall accuracy
  const userTotalCorrect = userGroupCorrect + userKnockoutCorrect + userThirdCorrect
  const userTotalScorable = userGroupTotal + userKnockoutTotal + userThirdTotal
  const userOverallAccuracy = userTotalScorable > 0 ? Math.round((userTotalCorrect / userTotalScorable) * 100) : 0

  const poolAvgTotalCorrect = poolAvgGroupCorrect + poolAvgKnockoutCorrect + poolAvgThirdCorrect
  const poolAvgTotalScorable = sampleGroupTotal + sampleKnockoutTotal + sampleThirdTotal
  const poolAvgOverallAccuracy = poolAvgTotalScorable > 0 ? Math.round((poolAvgTotalCorrect / poolAvgTotalScorable) * 100) : 0

  // --- Knockout consensus/contrarian ---
  const allKnockoutByMatch = new Map<string, BPKnockoutPick[]>()
  for (const pick of allKnockoutPicks) {
    if (!submittedEntryIds.has(pick.entry_id)) continue
    const list = allKnockoutByMatch.get(pick.match_id) ?? []
    list.push(pick)
    allKnockoutByMatch.set(pick.match_id, list)
  }

  const matchMajority = new Map<string, string>()
  let expectedConsensus = 0
  for (const matchId of knockoutWinners.keys()) {
    const allPicks = allKnockoutByMatch.get(matchId) ?? []
    if (allPicks.length === 0) continue
    const teamCounts = new Map<string, number>()
    for (const pick of allPicks) {
      teamCounts.set(pick.winner_team_id, (teamCounts.get(pick.winner_team_id) ?? 0) + 1)
    }
    let maxTeam = '', maxCount = 0
    for (const [team, count] of teamCounts) {
      if (count > maxCount) { maxTeam = team; maxCount = count }
    }
    if (maxTeam) {
      matchMajority.set(matchId, maxTeam)
      expectedConsensus += maxCount / allPicks.length
    }
  }

  let consensusCount = 0, contrarianCount = 0, contrarianWins = 0
  for (const pick of userKnockoutPicks) {
    const majority = matchMajority.get(pick.match_id)
    const actualWinner = knockoutWinners.get(pick.match_id)
    if (!majority || !actualWinner) continue
    if (pick.winner_team_id === majority) {
      consensusCount++
    } else {
      contrarianCount++
      if (pick.winner_team_id === actualWinner) contrarianWins++
    }
  }

  const poolAvgConsensus = Math.round(expectedConsensus)
  const poolAvgContrarian = Math.max(0, userKnockoutTotal - poolAvgConsensus)
  const crowdAccRate = sampleKnockoutTotal > 0 ? poolAvgKnockoutCorrect / sampleKnockoutTotal : 0
  const poolAvgContrarianWins = Math.round(poolAvgContrarian * crowdAccRate)

  // --- Most Popular Champion ---
  const finalMatch = matches.find(m => m.stage === 'final')
  let mostPopularChampion: BPPoolComparison['mostPopularChampion'] = null
  if (finalMatch) {
    const finalPicks = allKnockoutPicks.filter(
      p => p.match_id === finalMatch.match_id && submittedEntryIds.has(p.entry_id)
    )
    if (finalPicks.length > 0) {
      const champCounts = new Map<string, number>()
      for (const pick of finalPicks) {
        champCounts.set(pick.winner_team_id, (champCounts.get(pick.winner_team_id) ?? 0) + 1)
      }
      let maxTeam = '', maxCount = 0
      for (const [team, count] of champCounts) {
        if (count > maxCount) { maxTeam = team; maxCount = count }
      }
      if (maxTeam) {
        mostPopularChampion = { team_id: maxTeam, count: maxCount, pct: maxCount / finalPicks.length }
      }
    }
  }

  return {
    userOverallAccuracy,
    poolAvgOverallAccuracy,
    userGroupCorrect,
    userGroupTotal,
    poolAvgGroupCorrect,
    userKnockoutCorrect,
    userKnockoutTotal,
    poolAvgKnockoutCorrect,
    userThirdCorrect,
    userThirdTotal,
    poolAvgThirdCorrect,
    consensusCount,
    contrarianCount,
    contrarianWins,
    poolAvgConsensus,
    poolAvgContrarian,
    poolAvgContrarianWins,
    totalEntries: entryCount,
    totalScoredPicks: userTotalScorable,
    mostPopularChampion,
  }
}

// =============================================
// HELPERS (internal)
// =============================================

/**
 * Count how many "Cinderella" (underdog) picks the user got correct.
 * Underdogs = bottom-half of teams by FIFA ranking points.
 * A correct Cinderella pick = user predicted an underdog to win through 2+ knockout rounds,
 * and the underdog actually did.
 */
function countCinderellaPicks(
  knockoutItems: BPKnockoutPickXP[],
  teams: TeamData[],
  completedMatches: MatchWithResult[]
): number {
  // Sort teams by FIFA ranking (desc) - bottom half are underdogs
  const sortedTeams = [...teams].sort((a, b) => b.fifa_ranking_points - a.fifa_ranking_points)
  const midpoint = Math.ceil(sortedTeams.length / 2)
  const underdogIds = new Set(sortedTeams.slice(midpoint).map(t => t.team_id))

  // For each underdog, count how many knockout rounds the user correctly predicted them winning
  const underdogCorrectRounds = new Map<string, number>()

  for (const item of knockoutItems) {
    if (!item.correct) continue
    if (!underdogIds.has(item.predicted_winner)) continue

    const count = (underdogCorrectRounds.get(item.predicted_winner) || 0) + 1
    underdogCorrectRounds.set(item.predicted_winner, count)
  }

  // Count underdogs with 2+ correct knockout round picks
  let cinderellaCount = 0
  for (const [, rounds] of underdogCorrectRounds) {
    if (rounds >= 2) cinderellaCount++
  }

  return cinderellaCount
}
