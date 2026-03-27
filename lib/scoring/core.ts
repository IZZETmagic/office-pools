// =============================================================
// SCORING ENGINE — CORE PRIMITIVES
// =============================================================
// This is the SINGLE SOURCE OF TRUTH for match-level scoring.
// Both Full Tournament and Progressive modes use these functions.
// No other file should implement score comparison logic.
// =============================================================

import type { PoolSettings, MatchScoreRow, MatchWithResult, EntryPrediction } from './types'

// ----- Winner determination -----

type Winner = 'home' | 'away' | 'draw'

function getWinner(homeScore: number, awayScore: number): Winner {
  if (homeScore > awayScore) return 'home'
  if (awayScore > homeScore) return 'away'
  return 'draw'
}

// ----- Stage multiplier -----

export function getStageMultiplier(stage: string, settings: PoolSettings): number {
  switch (stage) {
    case 'round_32':
      return settings.round_32_multiplier || 1
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

// ----- PSO bonus calculation -----

export type PsoResult = {
  psoPoints: number
  psoType: 'exact' | 'winner_gd' | 'winner' | 'miss'
}

function calculatePsoBonus(
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

// ----- Knockout team matching -----

/**
 * Check whether the user's predicted teams for a knockout match slot
 * match the actual teams. Returns true for group stage (always eligible).
 * For knockout, compares predicted team IDs against actual team IDs
 * as a set (order-independent).
 */
export function checkKnockoutTeamsMatch(
  stage: string,
  actualHomeTeamId: string | null,
  actualAwayTeamId: string | null,
  predictedHomeTeamId: string | null,
  predictedAwayTeamId: string | null,
): boolean {
  if (stage === 'group') return true
  if (!actualHomeTeamId || !actualAwayTeamId) return true // match teams not yet set
  if (!predictedHomeTeamId || !predictedAwayTeamId) return false // user didn't resolve teams

  const actualSet = new Set([actualHomeTeamId, actualAwayTeamId])
  return actualSet.has(predictedHomeTeamId) && actualSet.has(predictedAwayTeamId)
}

// ----- Core match scoring -----

export type ScoreResult = {
  scoreType: 'exact' | 'winner_gd' | 'winner' | 'miss'
  basePoints: number
  multiplier: number
  psoPoints: number
  totalPoints: number
}

/**
 * Calculate points for a single match prediction.
 *
 * This is the ONLY function that should ever compute match points.
 * It handles:
 *   1. Base points determination (exact → GD → winner → miss)
 *   2. Stage multiplier for knockout rounds
 *   3. PSO bonus (added AFTER multiplication — not multiplied)
 *   4. Knockout team mismatch (returns 0 when teams don't match)
 */
export function scoreMatch(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number,
  stage: string,
  settings: PoolSettings,
  knockoutTeamsMatch: boolean,
  pso?: {
    predictedHomePso: number | null
    predictedAwayPso: number | null
    actualHomePso: number
    actualAwayPso: number
  },
): ScoreResult {
  const isGroupStage = stage === 'group'
  const multiplier = isGroupStage ? 1 : getStageMultiplier(stage, settings)

  // For knockout rounds, if predicted teams don't match actual teams, no points
  if (!isGroupStage && !knockoutTeamsMatch) {
    return {
      scoreType: 'miss',
      basePoints: 0,
      multiplier,
      psoPoints: 0,
      totalPoints: 0,
    }
  }

  // Determine base point values for the stage
  const exactBase = isGroupStage ? settings.group_exact_score : settings.knockout_exact_score
  const gdBase = isGroupStage ? settings.group_correct_difference : settings.knockout_correct_difference
  const winnerBase = isGroupStage ? settings.group_correct_result : settings.knockout_correct_result

  // Calculate PSO bonus (separate from base points — NOT multiplied)
  let psoPoints = 0
  if (
    settings.pso_enabled &&
    pso &&
    pso.predictedHomePso != null &&
    pso.predictedAwayPso != null
  ) {
    const psoResult = calculatePsoBonus(
      pso.predictedHomePso,
      pso.predictedAwayPso,
      pso.actualHomePso,
      pso.actualAwayPso,
      settings
    )
    psoPoints = psoResult.psoPoints
  }

  // 1. Exact score
  if (predictedHome === actualHome && predictedAway === actualAway) {
    const total = Math.floor(exactBase * multiplier) + psoPoints
    return { scoreType: 'exact', basePoints: exactBase, multiplier, psoPoints, totalPoints: total }
  }

  const predictedWinner = getWinner(predictedHome, predictedAway)
  const actualWinner = getWinner(actualHome, actualAway)

  // Must have correct winner (or both draws) for any FT points
  if (predictedWinner !== actualWinner) {
    // Miss on FT — but PSO bonus can still apply
    return { scoreType: 'miss', basePoints: 0, multiplier, psoPoints, totalPoints: psoPoints }
  }

  // 2. Correct winner + correct goal difference
  const predictedGD = predictedHome - predictedAway
  const actualGD = actualHome - actualAway
  if (predictedGD === actualGD) {
    const total = Math.floor(gdBase * multiplier) + psoPoints
    return { scoreType: 'winner_gd', basePoints: gdBase, multiplier, psoPoints, totalPoints: total }
  }

  // 3. Correct winner only
  const total = Math.floor(winnerBase * multiplier) + psoPoints
  return { scoreType: 'winner', basePoints: winnerBase, multiplier, psoPoints, totalPoints: total }
}

// ----- Build MatchScoreRow for a single entry × match -----

/**
 * Compute the MatchScoreRow for one entry's prediction on one completed match.
 * Returns null if the match isn't completed or the entry has no prediction.
 */
export function computeMatchScore(params: {
  poolId: string
  entryId: string
  match: MatchWithResult
  prediction: EntryPrediction
  settings: PoolSettings
  knockoutTeamsMatch: boolean
  predictedHomeTeamId: string | null
  predictedAwayTeamId: string | null
}): MatchScoreRow | null {
  const { poolId, entryId, match, prediction, settings, knockoutTeamsMatch, predictedHomeTeamId, predictedAwayTeamId } = params

  // Must be completed with FT scores
  if (!(match.is_completed || match.status === 'live')) return null
  if (match.home_score_ft === null || match.away_score_ft === null) return null

  const hasPso = match.home_score_pso !== null && match.away_score_pso !== null

  const result = scoreMatch(
    prediction.predicted_home_score,
    prediction.predicted_away_score,
    match.home_score_ft,
    match.away_score_ft,
    match.stage,
    settings,
    knockoutTeamsMatch,
    hasPso
      ? {
          predictedHomePso: prediction.predicted_home_pso,
          predictedAwayPso: prediction.predicted_away_pso,
          actualHomePso: match.home_score_pso!,
          actualAwayPso: match.away_score_pso!,
        }
      : undefined,
  )

  return {
    entry_id: entryId,
    match_id: match.match_id,
    pool_id: poolId,
    match_number: match.match_number,
    stage: match.stage,
    score_type: result.scoreType,
    base_points: result.basePoints,
    multiplier: result.multiplier,
    pso_points: result.psoPoints,
    total_points: result.totalPoints,
    teams_match: knockoutTeamsMatch,
    predicted_home_score: prediction.predicted_home_score,
    predicted_away_score: prediction.predicted_away_score,
    actual_home_score: match.home_score_ft,
    actual_away_score: match.away_score_ft,
    predicted_home_pso: prediction.predicted_home_pso,
    predicted_away_pso: prediction.predicted_away_pso,
    actual_home_pso: match.home_score_pso,
    actual_away_pso: match.away_score_pso,
    predicted_home_team_id: predictedHomeTeamId,
    predicted_away_team_id: predictedAwayTeamId,
    calculated_at: new Date().toISOString(),
  }
}
