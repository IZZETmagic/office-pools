/**
 * Knockout match team advancement utilities.
 *
 * Pure logic functions for determining match winners, parsing placeholders,
 * and computing which teams should advance to knockout matches.
 * No database calls — these are used by the advance-teams API route.
 */

// =============================================
// TYPES
// =============================================

export type AdvancementResult = {
  match_number: number
  side: 'home' | 'away'
  team_id: string
  country_name: string
}

export type ClearResult = {
  match_number: number
  side: 'home' | 'away'
  previous_team_id: string
}

// =============================================
// PLACEHOLDER PARSING
// =============================================

/**
 * Parse a placeholder string to see if it references a specific source match.
 * Handles formats like "Winner Match 73" and "Loser Match 101".
 * Returns null if the placeholder does not reference the given match number.
 */
export function parsePlaceholder(
  placeholder: string,
  sourceMatchNum: number
): { type: 'winner' | 'loser' } | null {
  const winnerRegex = /Winner\s+Match\s+(\d+)/i
  const loserRegex = /Loser\s+Match\s+(\d+)/i

  const wm = placeholder.match(winnerRegex)
  if (wm && parseInt(wm[1]) === sourceMatchNum) return { type: 'winner' }

  const lm = placeholder.match(loserRegex)
  if (lm && parseInt(lm[1]) === sourceMatchNum) return { type: 'loser' }

  return null
}

// =============================================
// WINNER / LOSER DETERMINATION
// =============================================

/**
 * Determine the winner team_id of a completed match from its stored scores.
 * Resolution order: FT score → PSO score → winner_team_id field.
 */
export function determineWinnerId(match: {
  is_completed: boolean
  home_team_id: string | null
  away_team_id: string | null
  home_score_ft: number | null
  away_score_ft: number | null
  home_score_pso?: number | null
  away_score_pso?: number | null
  winner_team_id?: string | null
}): string | null {
  if (!match.is_completed) return null
  if (match.home_score_ft == null || match.away_score_ft == null) return null
  if (!match.home_team_id || !match.away_team_id) return null

  // Clear FT winner
  if (match.home_score_ft > match.away_score_ft) return match.home_team_id
  if (match.away_score_ft > match.home_score_ft) return match.away_team_id

  // Draw after FT: check PSO
  if (match.home_score_pso != null && match.away_score_pso != null) {
    if (match.home_score_pso > match.away_score_pso) return match.home_team_id
    if (match.away_score_pso > match.home_score_pso) return match.away_team_id
  }

  // Fallback: explicit winner_team_id (set by enter_match_result RPC)
  return match.winner_team_id ?? null
}

/**
 * Determine the loser team_id of a completed match.
 * Returns the team that is NOT the winner.
 */
export function determineLoserId(match: {
  is_completed: boolean
  home_team_id: string | null
  away_team_id: string | null
  home_score_ft: number | null
  away_score_ft: number | null
  home_score_pso?: number | null
  away_score_pso?: number | null
  winner_team_id?: string | null
}): string | null {
  const winnerId = determineWinnerId(match)
  if (!winnerId || !match.home_team_id || !match.away_team_id) return null
  return winnerId === match.home_team_id ? match.away_team_id : match.home_team_id
}
