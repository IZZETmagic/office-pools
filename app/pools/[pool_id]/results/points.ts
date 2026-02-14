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
}

// =============================================
// POINTS CALCULATION FOR MATCH RESULTS
// =============================================

export type PointsResult = {
  points: number
  basePoints: number
  multiplier: number
  label: string
  type: 'exact' | 'winner_gd' | 'winner' | 'miss'
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
 * Calculate points earned for a single prediction using pool settings.
 *
 * Group stage uses group_* settings with no multiplier.
 * Knockout stages use knockout_* settings with a stage multiplier.
 * Round of 32 uses knockout base values at 1x (no multiplier field in DB).
 */
export function calculatePoints(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number,
  stage: string,
  settings: PoolSettings
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

  // 1. Exact score
  if (predictedHome === actualHome && predictedAway === actualAway) {
    const base = exactBase
    const pts = Math.floor(base * multiplier)
    return {
      points: pts,
      basePoints: base,
      multiplier,
      label: `Exact! +${pts}`,
      type: 'exact',
    }
  }

  const predictedWinner = getWinner(predictedHome, predictedAway)
  const actualWinner = getWinner(actualHome, actualAway)

  // Must have correct winner (or both draws) for any points
  if (predictedWinner !== actualWinner) {
    return {
      points: 0,
      basePoints: 0,
      multiplier,
      label: 'Miss +0',
      type: 'miss',
    }
  }

  // 2. Correct winner + correct goal difference
  const predictedGD = predictedHome - predictedAway
  const actualGD = actualHome - actualAway
  if (predictedGD === actualGD) {
    const base = gdBase
    const pts = Math.floor(base * multiplier)
    return {
      points: pts,
      basePoints: base,
      multiplier,
      label: `Winner + GD +${pts}`,
      type: 'winner_gd',
    }
  }

  // 3. Correct winner only
  const base = winnerBase
  const pts = Math.floor(base * multiplier)
  return {
    points: pts,
    basePoints: base,
    multiplier,
    label: `Winner +${pts}`,
    type: 'winner',
  }
}
