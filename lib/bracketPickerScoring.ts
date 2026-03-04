import type { GroupStanding, Match } from './tournament'
import type { BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick, SettingsData } from '@/app/pools/[pool_id]/types'

// Extended match type that includes actual result fields
export type MatchWithResult = Match & {
  is_completed: boolean
  home_score_ft: number | null
  away_score_ft: number | null
  home_score_pso: number | null
  away_score_pso: number | null
  winner_team_id: string | null
}

export type BPScoreBreakdown = {
  groupPoints: number
  groupDetails: { group_letter: string; team_id: string; position: number; correct: boolean; points: number }[]
  thirdPlacePoints: number
  thirdPlaceDetails: { team_id: string; group_letter: string; predicted_qualifies: boolean; actually_qualifies: boolean; correct: boolean; points: number }[]
  thirdPlaceAllCorrectBonus: number
  knockoutPoints: number
  knockoutDetails: { match_id: string; match_number: number; stage: string; predicted_winner: string; actual_winner: string | null; correct: boolean; points: number }[]
  penaltyPoints: number
  championBonus: number
  total: number
}

// Default scoring values
const DEFAULTS = {
  bp_group_correct_1st: 4,
  bp_group_correct_2nd: 3,
  bp_group_correct_3rd: 2,
  bp_group_correct_4th: 1,
  bp_third_correct_qualifier: 2,
  bp_third_correct_eliminated: 1,
  bp_third_all_correct_bonus: 10,
  bp_r32_correct: 1,
  bp_r16_correct: 2,
  bp_qf_correct: 4,
  bp_sf_correct: 8,
  bp_third_place_match_correct: 10,
  bp_final_correct: 20,
  bp_champion_bonus: 50,
  bp_penalty_correct: 1,
} as const

/** Points awarded for correctly predicting a position in a group */
function groupPositionPoints(position: number, settings: SettingsData): number {
  switch (position) {
    case 1: return settings.bp_group_correct_1st ?? DEFAULTS.bp_group_correct_1st
    case 2: return settings.bp_group_correct_2nd ?? DEFAULTS.bp_group_correct_2nd
    case 3: return settings.bp_group_correct_3rd ?? DEFAULTS.bp_group_correct_3rd
    case 4: return settings.bp_group_correct_4th ?? DEFAULTS.bp_group_correct_4th
    default: return 0
  }
}

/** Points awarded for correctly predicting a knockout stage winner */
function knockoutStagePoints(stage: string, settings: SettingsData): number {
  switch (stage) {
    case 'round_32': return settings.bp_r32_correct ?? DEFAULTS.bp_r32_correct
    case 'round_16': return settings.bp_r16_correct ?? DEFAULTS.bp_r16_correct
    case 'quarter_final': return settings.bp_qf_correct ?? DEFAULTS.bp_qf_correct
    case 'semi_final': return settings.bp_sf_correct ?? DEFAULTS.bp_sf_correct
    case 'third_place': return settings.bp_third_place_match_correct ?? DEFAULTS.bp_third_place_match_correct
    case 'final': return settings.bp_final_correct ?? DEFAULTS.bp_final_correct
    default: return 0
  }
}

/**
 * Calculate all Bracket Picker scoring for a single entry.
 *
 * Compares the user's bracket picker predictions (group rankings, third-place
 * rankings, and knockout picks) against actual tournament results to produce
 * a full score breakdown.
 */
export function calculateBracketPickerPoints(params: {
  groupRankings: BPGroupRanking[]
  thirdPlaceRankings: BPThirdPlaceRanking[]
  knockoutPicks: BPKnockoutPick[]
  actualGroupStandings: Map<string, GroupStanding[]>
  actualThirdPlaceQualifierTeamIds: Set<string>
  completedMatches: MatchWithResult[]
  settings: SettingsData
}): BPScoreBreakdown {
  const {
    groupRankings,
    thirdPlaceRankings,
    knockoutPicks,
    actualGroupStandings,
    actualThirdPlaceQualifierTeamIds,
    completedMatches,
    settings,
  } = params

  // Build a quick lookup: match_id -> completed match
  const matchById = new Map<string, MatchWithResult>()
  for (const m of completedMatches) {
    matchById.set(m.match_id, m)
  }

  // =========================================================================
  // GROUP STAGE SCORING
  // =========================================================================

  // Determine which groups are fully completed (all 6 group matches done)
  const completedGroups = new Set<string>()
  const groupMatchCounts = new Map<string, { total: number; completed: number }>()

  for (const m of completedMatches) {
    if (m.stage === 'group' && m.group_letter) {
      const counts = groupMatchCounts.get(m.group_letter) ?? { total: 0, completed: 0 }
      counts.total += 1
      if (m.is_completed) counts.completed += 1
      groupMatchCounts.set(m.group_letter, counts)
    }
  }
  for (const [letter, counts] of groupMatchCounts) {
    if (counts.total >= 6 && counts.completed >= 6) {
      completedGroups.add(letter)
    }
  }

  const groupDetails: BPScoreBreakdown['groupDetails'] = []

  for (const ranking of groupRankings) {
    const { group_letter, team_id, predicted_position } = ranking

    // Only score groups that are fully completed
    if (!completedGroups.has(group_letter)) continue

    const standings = actualGroupStandings.get(group_letter)
    if (!standings) continue

    // Find the team's actual position (standings are sorted: index 0 = 1st place)
    const actualIndex = standings.findIndex(s => s.team_id === team_id)
    if (actualIndex === -1) continue

    const actualPosition = actualIndex + 1 // 1-based
    const correct = predicted_position === actualPosition
    const points = correct ? groupPositionPoints(predicted_position, settings) : 0

    groupDetails.push({
      group_letter,
      team_id,
      position: predicted_position,
      correct,
      points,
    })
  }

  const groupPoints = groupDetails.reduce((sum, d) => sum + d.points, 0)

  // =========================================================================
  // THIRD PLACE SCORING
  // =========================================================================

  // Build set of ALL actual 3rd-place team IDs (one per completed group).
  // A player only gets third-place credit if the team they predicted as 3rd
  // actually finished 3rd in that group.
  const actualThirdPlaceTeamIds = new Set<string>()
  for (const letter of completedGroups) {
    const standings = actualGroupStandings.get(letter)
    if (standings && standings.length >= 3) {
      actualThirdPlaceTeamIds.add(standings[2].team_id)
    }
  }

  // Sort user's third-place rankings by rank (ascending) to determine their
  // predicted top 8 qualifiers vs bottom 4 eliminated
  const sortedThirdPlace = [...thirdPlaceRankings].sort((a, b) => a.rank - b.rank)
  const predictedQualifierIds = new Set(sortedThirdPlace.slice(0, 8).map(r => r.team_id))

  const thirdPlaceDetails: BPScoreBreakdown['thirdPlaceDetails'] = []

  for (const ranking of sortedThirdPlace) {
    const { team_id, group_letter } = ranking
    const predicted_qualifies = predictedQualifierIds.has(team_id)
    const actually_qualifies = actualThirdPlaceQualifierTeamIds.has(team_id)

    // Check if this team actually finished 3rd in their group.
    // If the player predicted Team A as 3rd but Team B actually finished 3rd,
    // no third-place points are awarded (the group prediction was wrong).
    const isActualThirdPlace = actualThirdPlaceTeamIds.has(team_id)

    let correct = false
    let points = 0

    if (isActualThirdPlace) {
      if (predicted_qualifies && actually_qualifies) {
        // Correctly predicted as qualifier
        correct = true
        points = settings.bp_third_correct_qualifier ?? DEFAULTS.bp_third_correct_qualifier
      } else if (!predicted_qualifies && !actually_qualifies) {
        // Correctly predicted as eliminated
        correct = true
        points = settings.bp_third_correct_eliminated ?? DEFAULTS.bp_third_correct_eliminated
      }
    }

    thirdPlaceDetails.push({
      team_id,
      group_letter,
      predicted_qualifies,
      actually_qualifies,
      correct,
      points,
    })
  }

  const thirdPlacePoints = thirdPlaceDetails.reduce((sum, d) => sum + d.points, 0)

  // Check if ALL 8 qualifiers match exactly (set equality, order doesn't matter)
  let thirdPlaceAllCorrectBonus = 0
  if (actualThirdPlaceQualifierTeamIds.size === 8) {
    const allCorrect =
      predictedQualifierIds.size === 8 &&
      [...predictedQualifierIds].every(id => actualThirdPlaceQualifierTeamIds.has(id))

    if (allCorrect) {
      thirdPlaceAllCorrectBonus = settings.bp_third_all_correct_bonus ?? DEFAULTS.bp_third_all_correct_bonus
    }
  }

  // =========================================================================
  // KNOCKOUT SCORING
  // =========================================================================

  const knockoutDetails: BPScoreBreakdown['knockoutDetails'] = []

  for (const pick of knockoutPicks) {
    const { match_id, match_number, winner_team_id: predicted_winner } = pick

    const actualMatch = matchById.get(match_id)
    const matchCompleted = actualMatch?.is_completed ?? false

    // Derive winner from scores if winner_team_id is not set
    let actual_winner: string | null = null
    if (matchCompleted && actualMatch) {
      if (actualMatch.winner_team_id) {
        actual_winner = actualMatch.winner_team_id
      } else if (actualMatch.home_score_ft != null && actualMatch.away_score_ft != null) {
        // Derive from scores
        if (actualMatch.home_score_ft > actualMatch.away_score_ft) {
          actual_winner = actualMatch.home_team_id ?? null
        } else if (actualMatch.away_score_ft > actualMatch.home_score_ft) {
          actual_winner = actualMatch.away_team_id ?? null
        } else if (actualMatch.home_score_pso != null && actualMatch.away_score_pso != null) {
          // PSO tiebreak
          actual_winner = actualMatch.home_score_pso > actualMatch.away_score_pso
            ? (actualMatch.home_team_id ?? null)
            : (actualMatch.away_team_id ?? null)
        }
      }
    }

    // Determine the stage from the actual match data
    const stage = actualMatch?.stage ?? ''

    const correct = matchCompleted && actual_winner != null && predicted_winner === actual_winner
    const points = correct ? knockoutStagePoints(stage, settings) : 0

    knockoutDetails.push({
      match_id,
      match_number,
      stage,
      predicted_winner,
      actual_winner,
      correct,
      points,
    })
  }

  const knockoutPoints = knockoutDetails.reduce((sum, d) => sum + d.points, 0)

  // =========================================================================
  // PENALTY PREDICTION SCORING
  // =========================================================================

  let penaltyPoints = 0
  const penaltyPointValue = settings.bp_penalty_correct ?? DEFAULTS.bp_penalty_correct

  for (const pick of knockoutPicks) {
    const actualMatch = matchById.get(pick.match_id)
    if (!actualMatch?.is_completed) continue

    const actualWentToPenalties = actualMatch.home_score_pso != null
    const predictedPenalty = pick.predicted_penalty

    if (predictedPenalty === actualWentToPenalties) {
      penaltyPoints += penaltyPointValue
    }
  }

  // =========================================================================
  // CHAMPION BONUS
  // =========================================================================

  let championBonus = 0

  // Find the user's final match pick
  const finalPick = knockoutPicks.find(p => {
    const m = matchById.get(p.match_id)
    return m?.stage === 'final'
  })

  if (finalPick) {
    const finalMatch = matchById.get(finalPick.match_id)
    if (finalMatch?.is_completed && finalMatch.winner_team_id != null) {
      if (finalPick.winner_team_id === finalMatch.winner_team_id) {
        championBonus = settings.bp_champion_bonus ?? DEFAULTS.bp_champion_bonus
      }
    }
  }

  // =========================================================================
  // TOTAL
  // =========================================================================

  const total =
    groupPoints +
    thirdPlacePoints +
    thirdPlaceAllCorrectBonus +
    knockoutPoints +
    penaltyPoints +
    championBonus

  return {
    groupPoints,
    groupDetails,
    thirdPlacePoints,
    thirdPlaceDetails,
    thirdPlaceAllCorrectBonus,
    knockoutPoints,
    knockoutDetails,
    penaltyPoints,
    championBonus,
    total,
  }
}
