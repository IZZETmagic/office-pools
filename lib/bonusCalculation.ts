import {
  Match,
  Team,
  PredictionMap,
  GroupStanding,
  MatchConductData,
  GROUP_LETTERS,
  getKnockoutWinner,
} from './tournament'
import { resolveFullBracket, buildActualResultsMap, type BracketResult } from './bracketResolver'
import { PoolSettings } from '@/app/pools/[pool_id]/results/points'

// Extended match type that includes actual result fields (from DB query)
export type MatchWithResult = Match & {
  is_completed: boolean
  home_score_ft: number | null
  away_score_ft: number | null
  home_score_pso: number | null
  away_score_pso: number | null
  winner_team_id: string | null
  tournament_id: string
}

export type TournamentAwards = {
  champion_team_id: string | null
  runner_up_team_id: string | null
  third_place_team_id: string | null
  best_player: string | null
  top_scorer: string | null
}

export type BonusScoreEntry = {
  member_id: string
  bonus_type: string
  bonus_category: string
  related_group_letter: string | null
  related_match_id: string | null
  points_earned: number
  description: string
}

/**
 * Calculate all bonus points for a single member.
 *
 * Compares the member's predicted bracket (derived from their match predictions)
 * against the actual bracket (derived from actual match results) to award bonus
 * points across five categories: group standings, qualification, bracket pairings,
 * match winners, and tournament podium.
 */
export function calculateAllBonusPoints(params: {
  memberId: string
  memberPredictions: PredictionMap
  matches: MatchWithResult[]
  teams: Team[]
  conductData: MatchConductData[]
  settings: PoolSettings
  tournamentAwards: TournamentAwards | null
}): BonusScoreEntry[] {
  const { memberId, memberPredictions, matches, teams, conductData, settings, tournamentAwards } = params

  const bonuses: BonusScoreEntry[] = []

  // Build actual results map from completed matches
  const actualResultsMap = buildActualResultsMap(matches)

  // Resolve the member's predicted bracket
  const predictedBracket = resolveFullBracket({
    matches,
    predictionMap: memberPredictions,
    teams,
  })

  // Resolve the actual bracket from completed match results
  const actualBracket = resolveFullBracket({
    matches,
    predictionMap: actualResultsMap,
    teams,
    conductData,
  })

  // A. Group Standings Bonus
  bonuses.push(...calculateGroupStandingsBonuses(
    memberId, matches, predictedBracket, actualBracket, settings
  ))

  // B. Overall Qualification Bonus
  bonuses.push(...calculateQualificationBonus(
    memberId, matches, predictedBracket, actualBracket, settings
  ))

  // C. Bracket Pairing Bonus (R32)
  bonuses.push(...calculateBracketPairingBonuses(
    memberId, matches, predictedBracket, actualBracket, settings
  ))

  // D. Match Winner Bonus (all knockout matches)
  bonuses.push(...calculateMatchWinnerBonuses(
    memberId, matches, memberPredictions, actualResultsMap, predictedBracket, actualBracket, settings
  ))

  // E. Tournament Podium Bonus
  bonuses.push(...calculateTournamentPodiumBonuses(
    memberId, predictedBracket, tournamentAwards, settings
  ))

  return bonuses
}

// =============================================
// A. GROUP STANDINGS BONUS
// =============================================

function calculateGroupStandingsBonuses(
  memberId: string,
  matches: MatchWithResult[],
  predictedBracket: BracketResult,
  actualBracket: BracketResult,
  settings: PoolSettings
): BonusScoreEntry[] {
  const bonuses: BonusScoreEntry[] = []

  for (const letter of GROUP_LETTERS) {
    // Check if all 6 group matches are completed
    const groupMatches = matches.filter(m => m.stage === 'group' && m.group_letter === letter)
    const allCompleted = groupMatches.length >= 6 && groupMatches.every(m => m.is_completed)
    if (!allCompleted) continue

    const predicted = predictedBracket.allGroupStandings.get(letter)
    const actual = actualBracket.allGroupStandings.get(letter)
    if (!predicted || !actual || predicted.length < 2 || actual.length < 2) continue

    const predictedWinner = predicted[0].team_id
    const predictedRunnerUp = predicted[1].team_id
    const actualWinner = actual[0].team_id
    const actualRunnerUp = actual[1].team_id

    let bonusType: string | null = null
    let points = 0
    let description = ''

    if (predictedWinner === actualWinner && predictedRunnerUp === actualRunnerUp) {
      bonusType = 'group_winner_and_runnerup'
      points = settings.bonus_group_winner_and_runnerup ?? 150
      description = `Group ${letter}: Correct winner (${actual[0].country_name}) AND runner-up (${actual[1].country_name})`
    } else if (predictedWinner === actualRunnerUp && predictedRunnerUp === actualWinner) {
      bonusType = 'both_qualify_swapped'
      points = settings.bonus_both_qualify_swapped ?? 75
      description = `Group ${letter}: Both qualify but positions swapped`
    } else if (predictedWinner === actualWinner) {
      bonusType = 'group_winner_only'
      points = settings.bonus_group_winner_only ?? 100
      description = `Group ${letter}: Correct winner (${actual[0].country_name})`
    } else if (predictedRunnerUp === actualRunnerUp) {
      bonusType = 'group_runnerup_only'
      points = settings.bonus_group_runnerup_only ?? 50
      description = `Group ${letter}: Correct runner-up (${actual[1].country_name})`
    } else if (predictedWinner === actualRunnerUp || predictedRunnerUp === actualWinner) {
      bonusType = 'one_qualifies_wrong_position'
      points = settings.bonus_one_qualifies_wrong_position ?? 25
      description = `Group ${letter}: One correct qualifier but wrong position`
    }

    if (bonusType && points > 0) {
      bonuses.push({
        member_id: memberId,
        bonus_type: bonusType,
        bonus_category: 'group_standings',
        related_group_letter: letter,
        related_match_id: null,
        points_earned: points,
        description,
      })
    }
  }

  return bonuses
}

// =============================================
// B. OVERALL QUALIFICATION BONUS
// =============================================

function calculateQualificationBonus(
  memberId: string,
  matches: MatchWithResult[],
  predictedBracket: BracketResult,
  actualBracket: BracketResult,
  settings: PoolSettings
): BonusScoreEntry[] {
  // Only calculate when ALL 48 group matches are completed
  const groupMatches = matches.filter(m => m.stage === 'group')
  const allGroupsComplete = groupMatches.length > 0 && groupMatches.every(m => m.is_completed)
  if (!allGroupsComplete) return []

  const predictedQualified = predictedBracket.qualifiedTeamIds
  const actualQualified = actualBracket.qualifiedTeamIds

  // Count how many predicted qualified teams are actually qualified
  let correctCount = 0
  for (const teamId of predictedQualified) {
    if (actualQualified.has(teamId)) correctCount++
  }

  const totalQualified = actualQualified.size // Should be 32

  // Apply tiered thresholds scaled for 32-team qualification
  // DB column names reference "16" (from 32-team format), thresholds scaled proportionally
  let bonusType: string | null = null
  let points = 0
  let description = ''

  if (correctCount === totalQualified) {
    bonusType = 'all_qualified_correct'
    points = settings.bonus_all_16_qualified ?? 75
    description = `All ${totalQualified} qualified teams predicted correctly`
  } else if (correctCount >= Math.ceil(totalQualified * 0.75)) {
    bonusType = '75pct_qualified_correct'
    points = settings.bonus_12_15_qualified ?? 50
    description = `${correctCount}/${totalQualified} qualified teams predicted correctly (75%+)`
  } else if (correctCount >= Math.ceil(totalQualified * 0.5)) {
    bonusType = '50pct_qualified_correct'
    points = settings.bonus_8_11_qualified ?? 25
    description = `${correctCount}/${totalQualified} qualified teams predicted correctly (50%+)`
  }

  if (bonusType && points > 0) {
    return [{
      member_id: memberId,
      bonus_type: bonusType,
      bonus_category: 'qualification',
      related_group_letter: null,
      related_match_id: null,
      points_earned: points,
      description,
    }]
  }

  return []
}

// =============================================
// C. BRACKET PAIRING BONUS (R32)
// =============================================

function calculateBracketPairingBonuses(
  memberId: string,
  matches: MatchWithResult[],
  predictedBracket: BracketResult,
  actualBracket: BracketResult,
  settings: PoolSettings
): BonusScoreEntry[] {
  const bonuses: BonusScoreEntry[] = []
  const pointsPerPairing = settings.bonus_correct_bracket_pairing ?? 25
  if (pointsPerPairing <= 0) return []

  // R32 matches are match numbers 73-88
  const r32Matches = matches.filter(m => m.stage === 'round_32')

  for (const match of r32Matches) {
    // Check if this R32 match has actual teams assigned (both teams known)
    if (!match.home_team_id || !match.away_team_id) continue

    const predicted = predictedBracket.knockoutTeamMap.get(match.match_number)
    if (!predicted || !predicted.home || !predicted.away) continue

    // Compare predicted pairing vs actual pairing (order-independent)
    const actualPair = new Set([match.home_team_id, match.away_team_id])
    const predictedPair = new Set([predicted.home.team_id, predicted.away.team_id])

    if (actualPair.size === 2 && predictedPair.size === 2) {
      const match1 = [...actualPair].every(id => predictedPair.has(id))
      if (match1) {
        bonuses.push({
          member_id: memberId,
          bonus_type: 'correct_bracket_pairing',
          bonus_category: 'bracket',
          related_group_letter: null,
          related_match_id: match.match_id,
          points_earned: pointsPerPairing,
          description: `R32 Match #${match.match_number}: Correct bracket pairing (${predicted.home.country_name} vs ${predicted.away.country_name})`,
        })
      }
    }
  }

  return bonuses
}

// =============================================
// D. MATCH WINNER BONUS (ALL KNOCKOUT)
// =============================================

function calculateMatchWinnerBonuses(
  memberId: string,
  matches: MatchWithResult[],
  memberPredictions: PredictionMap,
  actualResultsMap: PredictionMap,
  predictedBracket: BracketResult,
  actualBracket: BracketResult,
  settings: PoolSettings
): BonusScoreEntry[] {
  const bonuses: BonusScoreEntry[] = []
  const pointsPerWinner = settings.bonus_match_winner_correct ?? 50
  if (pointsPerWinner <= 0) return []

  const knockoutStages = ['round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']
  const knockoutMatches = matches.filter(m => knockoutStages.includes(m.stage) && m.is_completed)

  for (const match of knockoutMatches) {
    // Get actual winner
    const actualTeams = actualBracket.knockoutTeamMap.get(match.match_number)
    if (!actualTeams || !actualTeams.home || !actualTeams.away) continue
    const actualWinner = getKnockoutWinner(match.match_id, actualResultsMap, actualTeams.home, actualTeams.away)
    if (!actualWinner) continue

    // Get predicted winner
    const predictedTeams = predictedBracket.knockoutTeamMap.get(match.match_number)
    if (!predictedTeams || !predictedTeams.home || !predictedTeams.away) continue
    const predictedWinner = getKnockoutWinner(match.match_id, memberPredictions, predictedTeams.home, predictedTeams.away)
    if (!predictedWinner) continue

    if (predictedWinner.team_id === actualWinner.team_id) {
      const stageName = match.stage === 'round_32' ? 'R32' : match.stage === 'round_16' ? 'R16' :
        match.stage === 'quarter_final' ? 'QF' : match.stage === 'semi_final' ? 'SF' :
        match.stage === 'third_place' ? '3rd Place' : 'Final'

      bonuses.push({
        member_id: memberId,
        bonus_type: 'match_winner_correct',
        bonus_category: 'bracket',
        related_group_letter: null,
        related_match_id: match.match_id,
        points_earned: pointsPerWinner,
        description: `${stageName} Match #${match.match_number}: Correct winner (${actualWinner.country_name})`,
      })
    }
  }

  return bonuses
}

// =============================================
// E. TOURNAMENT PODIUM BONUS
// =============================================

function calculateTournamentPodiumBonuses(
  memberId: string,
  predictedBracket: BracketResult,
  tournamentAwards: TournamentAwards | null,
  settings: PoolSettings
): BonusScoreEntry[] {
  const bonuses: BonusScoreEntry[] = []

  // Champion
  if (tournamentAwards?.champion_team_id && predictedBracket.champion) {
    if (predictedBracket.champion.team_id === tournamentAwards.champion_team_id) {
      const points = settings.bonus_champion_correct ?? 1000
      if (points > 0) {
        bonuses.push({
          member_id: memberId,
          bonus_type: 'champion_correct',
          bonus_category: 'tournament',
          related_group_letter: null,
          related_match_id: null,
          points_earned: points,
          description: `Champion correct: ${predictedBracket.champion.country_name}`,
        })
      }
    }
  }

  // Runner-up
  if (tournamentAwards?.runner_up_team_id && predictedBracket.runnerUp) {
    if (predictedBracket.runnerUp.team_id === tournamentAwards.runner_up_team_id) {
      const points = settings.bonus_second_place_correct ?? 25
      if (points > 0) {
        bonuses.push({
          member_id: memberId,
          bonus_type: 'second_place_correct',
          bonus_category: 'tournament',
          related_group_letter: null,
          related_match_id: null,
          points_earned: points,
          description: `Runner-up correct: ${predictedBracket.runnerUp.country_name}`,
        })
      }
    }
  }

  // Third place
  if (tournamentAwards?.third_place_team_id && predictedBracket.thirdPlace) {
    if (predictedBracket.thirdPlace.team_id === tournamentAwards.third_place_team_id) {
      const points = settings.bonus_third_place_correct ?? 25
      if (points > 0) {
        bonuses.push({
          member_id: memberId,
          bonus_type: 'third_place_correct',
          bonus_category: 'tournament',
          related_group_letter: null,
          related_match_id: null,
          points_earned: points,
          description: `Third place correct: ${predictedBracket.thirdPlace.country_name}`,
        })
      }
    }
  }

  return bonuses
}
