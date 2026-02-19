// =============================================
// POOL SETTINGS TYPE
// =============================================

export type PoolSettings = {
  setting_id: string
  pool_id: string
  // Group stage scoring
  group_exact_score: number
  group_correct_difference: number
  group_correct_result: number
  // Knockout stage scoring
  knockout_exact_score: number
  knockout_correct_difference: number
  knockout_correct_result: number
  // Stage multipliers
  round_16_multiplier: number
  quarter_final_multiplier: number
  semi_final_multiplier: number
  third_place_multiplier: number
  final_multiplier: number
  // PSO
  pso_enabled: boolean
  pso_exact_score: number
  pso_correct_difference: number
  pso_correct_result: number
  // Bonus: Group Standings
  bonus_group_winner_and_runnerup: number | null
  bonus_group_winner_only: number | null
  bonus_group_runnerup_only: number | null
  bonus_both_qualify_swapped: number | null
  bonus_one_qualifies_wrong_position: number | null
  // Bonus: Overall Qualification
  bonus_all_16_qualified: number | null
  bonus_12_15_qualified: number | null
  bonus_8_11_qualified: number | null
  // Bonus: Bracket & Tournament
  bonus_correct_bracket_pairing: number | null
  bonus_match_winner_correct: number | null
  bonus_champion_correct: number | null
  bonus_second_place_correct: number | null
  bonus_third_place_correct: number | null
  bonus_best_player_correct: number | null
  bonus_top_scorer_correct: number | null
  // Bracket pairing mode
  bracket_pairing_mode: string | null
}

export const DEFAULT_POOL_SETTINGS: PoolSettings = {
  setting_id: '',
  pool_id: '',
  group_exact_score: 5,
  group_correct_difference: 3,
  group_correct_result: 1,
  knockout_exact_score: 5,
  knockout_correct_difference: 3,
  knockout_correct_result: 1,
  round_16_multiplier: 1,
  quarter_final_multiplier: 1,
  semi_final_multiplier: 1,
  third_place_multiplier: 1,
  final_multiplier: 1,
  pso_enabled: false,
  pso_exact_score: 0,
  pso_correct_difference: 0,
  pso_correct_result: 0,
  // Bonus defaults (match DB defaults)
  bonus_group_winner_and_runnerup: 150,
  bonus_group_winner_only: 100,
  bonus_group_runnerup_only: 50,
  bonus_both_qualify_swapped: 75,
  bonus_one_qualifies_wrong_position: 25,
  bonus_all_16_qualified: 75,
  bonus_12_15_qualified: 50,
  bonus_8_11_qualified: 25,
  bonus_correct_bracket_pairing: 25,
  bonus_match_winner_correct: 50,
  bonus_champion_correct: 1000,
  bonus_second_place_correct: 25,
  bonus_third_place_correct: 25,
  bonus_best_player_correct: 100,
  bonus_top_scorer_correct: 100,
  bracket_pairing_mode: 'actual',
}

// =============================================
// POINTS CALCULATION FOR MATCH RESULTS
// =============================================

export type PsoResult = {
  psoPoints: number
  psoType: 'exact' | 'winner_gd' | 'winner' | 'miss'
}

export type PointsResult = {
  points: number
  basePoints: number
  multiplier: number
  label: string
  type: 'exact' | 'winner_gd' | 'winner' | 'miss'
  pso?: PsoResult
}

/**
 * Determine the winner of a match given scores.
 */
function getWinner(homeScore: number, awayScore: number): 'home' | 'away' | 'draw' {
  if (homeScore > awayScore) return 'home'
  if (awayScore > homeScore) return 'away'
  return 'draw'
}

/**
 * Get the stage multiplier for knockout matches.
 */
function getStageMultiplier(stage: string, settings: PoolSettings): number {
  switch (stage) {
    case 'round_16':
      return settings.round_16_multiplier || 1
    case 'quarter_final':
      return settings.quarter_final_multiplier || 1
    case 'semi_final':
      return settings.semi_final_multiplier || 1
    case 'third_place':
      return settings.third_place_multiplier || 1
    case 'final':
      return settings.final_multiplier || 1
    default:
      return 1
  }
}

/**
 * Calculate PSO bonus points when a match goes to penalties.
 */
function calculatePsoPoints(
  predictedHomePso: number,
  predictedAwayPso: number,
  actualHomePso: number,
  actualAwayPso: number,
  settings: PoolSettings
): PsoResult {
  // Exact PSO score
  if (predictedHomePso === actualHomePso && predictedAwayPso === actualAwayPso) {
    return { psoPoints: settings.pso_exact_score, psoType: 'exact' }
  }

  const predictedWinner = getWinner(predictedHomePso, predictedAwayPso)
  const actualWinner = getWinner(actualHomePso, actualAwayPso)

  // Must have correct PSO winner for any PSO points
  if (predictedWinner !== actualWinner) {
    return { psoPoints: 0, psoType: 'miss' }
  }

  // Correct winner + correct goal difference
  const predictedGD = predictedHomePso - predictedAwayPso
  const actualGD = actualHomePso - actualAwayPso
  if (predictedGD === actualGD) {
    return { psoPoints: settings.pso_correct_difference, psoType: 'winner_gd' }
  }

  // Correct winner only
  return { psoPoints: settings.pso_correct_result, psoType: 'winner' }
}

/**
 * Calculate points earned for a single prediction using pool settings.
 *
 * Group stage uses group_* settings with no multiplier.
 * Knockout stages use knockout_* settings with a stage multiplier.
 * Round of 32 uses knockout base values at 1x (no multiplier field in DB).
 *
 * When PSO is enabled and the match went to penalties, bonus PSO points
 * are added on top of the FT points.
 */
export function calculatePoints(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number,
  stage: string,
  settings: PoolSettings,
  pso?: {
    actualHomePso: number
    actualAwayPso: number
    predictedHomePso: number | null
    predictedAwayPso: number | null
  }
): PointsResult {
  const isGroupStage = stage === 'group'

  // Determine base points for each tier
  const exactBase = isGroupStage
    ? settings.group_exact_score
    : settings.knockout_exact_score
  const gdBase = isGroupStage
    ? settings.group_correct_difference
    : settings.knockout_correct_difference
  const winnerBase = isGroupStage
    ? settings.group_correct_result
    : settings.knockout_correct_result

  // Multiplier (only for knockout, and round_32 defaults to 1x)
  const multiplier = isGroupStage ? 1 : getStageMultiplier(stage, settings)

  // Calculate PSO bonus if applicable
  let psoResult: PsoResult | undefined
  if (
    settings.pso_enabled &&
    pso &&
    pso.predictedHomePso != null &&
    pso.predictedAwayPso != null
  ) {
    psoResult = calculatePsoPoints(
      pso.predictedHomePso,
      pso.predictedAwayPso,
      pso.actualHomePso,
      pso.actualAwayPso,
      settings
    )
  }

  const psoBonus = psoResult?.psoPoints ?? 0

  // 1. Exact score
  if (predictedHome === actualHome && predictedAway === actualAway) {
    const base = exactBase
    const pts = Math.floor(base * multiplier) + psoBonus
    return {
      points: pts,
      basePoints: base,
      multiplier,
      label: `Exact! +${pts}`,
      type: 'exact',
      pso: psoResult,
    }
  }

  const predictedWinner = getWinner(predictedHome, predictedAway)
  const actualWinner = getWinner(actualHome, actualAway)

  // Must have correct winner (or both draws) for any points
  if (predictedWinner !== actualWinner) {
    return {
      points: 0 + psoBonus,
      basePoints: 0,
      multiplier,
      label: psoBonus > 0 ? `Miss FT, +${psoBonus} PSO` : 'Miss +0',
      type: 'miss',
      pso: psoResult,
    }
  }

  // 2. Correct winner + correct goal difference
  const predictedGD = predictedHome - predictedAway
  const actualGD = actualHome - actualAway
  if (predictedGD === actualGD) {
    const base = gdBase
    const pts = Math.floor(base * multiplier) + psoBonus
    return {
      points: pts,
      basePoints: base,
      multiplier,
      label: `Winner + GD +${pts}`,
      type: 'winner_gd',
      pso: psoResult,
    }
  }

  // 3. Correct winner only
  const base = winnerBase
  const pts = Math.floor(base * multiplier) + psoBonus
  return {
    points: pts,
    basePoints: base,
    multiplier,
    label: `Winner +${pts}`,
    type: 'winner',
    pso: psoResult,
  }
}
