// =============================================================
// SCORING ENGINE — FULL TOURNAMENT MODE
// =============================================================
// Calculates match scores + bonus scores for pools using the
// "full_tournament" prediction mode. Users predict all matches
// upfront; their bracket is resolved from their predictions.
// =============================================================

import type {
  ScoringInput,
  ScoringResult,
  MatchScoreRow,
  BonusScoreRow,
  EntryTotals,
  EntryWithPredictions,
  MatchWithResult,
  PoolSettings,
  TournamentAwards,
} from './types'
import { computeMatchScore, checkKnockoutTeamsMatch } from './core'
import { buildPredictionMap, toTeams, buildPredictionLookup } from './helpers'
import { resolveFullBracket, buildActualResultsMap } from '@/lib/bracketResolver'
import { calculateAllBonusPoints } from '@/lib/bonusCalculation'
import type { MatchConductData } from '@/lib/tournament'

/** Convert our MatchWithResult[] to the shape bonusCalculation expects */
function toBonusMatches(matches: MatchWithResult[]): import('@/lib/bonusCalculation').MatchWithResult[] {
  return matches as any
}

// ----- Main calculator -----

/**
 * Calculate all scores for a Full Tournament mode pool.
 *
 * For each entry:
 *   1. Resolve their predicted bracket from their match predictions
 *   2. Score each completed match (with knockout team matching)
 *   3. Calculate all bonus points
 *   4. Aggregate totals
 */
export function calculateFullTournament(input: ScoringInput): ScoringResult {
  const { poolId, matches, teams, conductData, settings, entries, tournamentAwards } = input

  const teamsArr = toTeams(teams)
  const bonusMatches = toBonusMatches(matches)
  const conduct: MatchConductData[] = conductData as any

  const allMatchScores: MatchScoreRow[] = []
  const allBonusScores: BonusScoreRow[] = []
  const allEntryTotals: EntryTotals[] = []

  for (const entry of entries) {
    if (entry.predictions.length === 0) {
      allEntryTotals.push({
        entry_id: entry.entry_id,
        match_points: 0,
        bonus_points: 0,
        point_adjustment: entry.point_adjustment,
        total_points: entry.point_adjustment,
        exact_count: 0,
        correct_count: 0,
      })
      continue
    }

    const predictionMap = buildPredictionMap(entry.predictions)
    const predLookup = buildPredictionLookup(entry.predictions)

    // Resolve this entry's predicted bracket
    const bracket = resolveFullBracket({
      matches: bonusMatches as any,
      predictionMap,
      teams: teamsArr,
      conductData: conduct,
    })

    // Score each completed match
    let matchPoints = 0

    for (const match of matches) {
      const pred = predLookup.get(match.match_id)
      if (!pred) continue

      // Knockout team matching: compare predicted bracket teams vs actual teams
      const resolved = bracket.knockoutTeamMap.get(match.match_number)
      const teamsMatch = checkKnockoutTeamsMatch(
        match.stage,
        match.home_team_id,
        match.away_team_id,
        resolved?.home?.team_id ?? null,
        resolved?.away?.team_id ?? null,
      )

      const row = computeMatchScore({
        poolId,
        entryId: entry.entry_id,
        match,
        prediction: pred,
        settings,
        knockoutTeamsMatch: teamsMatch,
        predictedHomeTeamId: resolved?.home?.team_id ?? null,
        predictedAwayTeamId: resolved?.away?.team_id ?? null,
      })

      if (row) {
        allMatchScores.push(row)
        matchPoints += row.total_points
      }
    }

    // Calculate bonus points using existing bonusCalculation module
    const bonusEntries = calculateAllBonusPoints({
      memberId: entry.entry_id,
      memberPredictions: predictionMap,
      matches: bonusMatches,
      teams: teamsArr,
      conductData: conduct,
      settings,
      tournamentAwards,
      predictionMode: 'full_tournament',
    })

    let bonusPoints = 0
    for (const b of bonusEntries) {
      allBonusScores.push({
        entry_id: b.entry_id,
        bonus_type: b.bonus_type,
        bonus_category: b.bonus_category,
        related_group_letter: b.related_group_letter,
        related_match_id: b.related_match_id,
        points_earned: b.points_earned,
        description: b.description,
      })
      bonusPoints += b.points_earned
    }

    // Count tiebreaker stats from this entry's match scores
    const entryScores = allMatchScores.filter(ms => ms.entry_id === entry.entry_id)
    const exactCount = entryScores.filter(ms => ms.score_type === 'exact').length
    const correctCount = entryScores.filter(ms => ms.score_type !== 'miss').length

    allEntryTotals.push({
      entry_id: entry.entry_id,
      match_points: matchPoints,
      bonus_points: bonusPoints,
      point_adjustment: entry.point_adjustment,
      total_points: matchPoints + bonusPoints + entry.point_adjustment,
      exact_count: exactCount,
      correct_count: correctCount,
    })
  }

  return {
    matchScores: allMatchScores,
    bonusScores: allBonusScores,
    entryTotals: allEntryTotals,
  }
}
