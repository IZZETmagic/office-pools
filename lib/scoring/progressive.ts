// =============================================================
// SCORING ENGINE — PROGRESSIVE MODE
// =============================================================
// Calculates match scores + bonus scores for pools using the
// "progressive" prediction mode. Users predict round-by-round
// as actual results come in. For knockout rounds, they see the
// real teams — so bonus calculation uses the actual bracket for
// knockout team mapping (not their predicted bracket).
//
// Match-level scoring is identical to Full Tournament mode.
// The only difference is in bonus calculation where the
// knockoutTeamMap comes from the actual bracket, since users
// are predicting scores for known real-world matchups.
// =============================================================

import type {
  ScoringInput,
  ScoringResult,
  MatchScoreRow,
  BonusScoreRow,
  EntryTotals,
  EntryWithPredictions,
  MatchWithResult,
} from './types'
import { computeMatchScore, checkKnockoutTeamsMatch } from './core'
import { resolveFullBracket, buildActualResultsMap } from '@/lib/bracketResolver'
import { calculateAllBonusPoints } from '@/lib/bonusCalculation'
import type { PredictionMap, Team, MatchConductData } from '@/lib/tournament'

// ----- Helpers (same as full.ts — shared via function, not inheritance) -----

function buildPredictionMap(predictions: EntryWithPredictions['predictions']): PredictionMap {
  const map: PredictionMap = new Map()
  for (const p of predictions) {
    map.set(p.match_id, {
      home: p.predicted_home_score,
      away: p.predicted_away_score,
      homePso: p.predicted_home_pso ?? null,
      awayPso: p.predicted_away_pso ?? null,
      winnerTeamId: p.predicted_winner_team_id ?? null,
    })
  }
  return map
}

function toTeams(teams: ScoringInput['teams']): Team[] {
  return teams.map(t => ({
    team_id: t.team_id,
    country_name: t.country_name,
    country_code: t.country_code,
    group_letter: t.group_letter,
    fifa_ranking_points: t.fifa_ranking_points,
    flag_url: t.flag_url,
  }))
}

function buildPredictionLookup(predictions: EntryWithPredictions['predictions']): Map<string, EntryWithPredictions['predictions'][0]> {
  const map = new Map<string, EntryWithPredictions['predictions'][0]>()
  for (const p of predictions) {
    map.set(p.match_id, p)
  }
  return map
}

// ----- Main calculator -----

/**
 * Calculate all scores for a Progressive mode pool.
 *
 * Key difference from Full Tournament:
 *   - For knockout matches, users predict scores for the ACTUAL teams
 *     (not their bracket-predicted teams), so knockout team matching
 *     always passes (teams_match = true for all knockout matches with
 *     a submitted prediction).
 *   - Bonus calculation uses the actual bracket's knockoutTeamMap
 *     for match winner bonuses, since users saw real teams.
 */
export function calculateProgressive(input: ScoringInput): ScoringResult {
  const { poolId, matches, teams, conductData, settings, entries, tournamentAwards } = input

  const teamsArr = toTeams(teams)
  const conduct: MatchConductData[] = conductData as any

  // Build actual results bracket (used for bonus calculation)
  const actualResultsMap = buildActualResultsMap(matches as any)
  const actualBracket = resolveFullBracket({
    matches: matches as any,
    predictionMap: actualResultsMap,
    teams: teamsArr,
    conductData: conduct,
  })

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
      })
      continue
    }

    const predictionMap = buildPredictionMap(entry.predictions)
    const predLookup = buildPredictionLookup(entry.predictions)

    // Resolve the user's predicted bracket (for group standings bonuses)
    const predictedBracket = resolveFullBracket({
      matches: matches as any,
      predictionMap,
      teams: teamsArr,
    })

    // Score each completed match
    let matchPoints = 0

    for (const match of matches) {
      const pred = predLookup.get(match.match_id)
      if (!pred) continue

      // In progressive mode, users predict scores for actual teams.
      // If they submitted a prediction, the teams match by definition.
      // We still check group stage normally, and for knockout we use
      // actual bracket's team assignments.
      const isGroup = match.stage === 'group'
      let teamsMatch = true
      let predictedHomeTeamId: string | null = null
      let predictedAwayTeamId: string | null = null

      if (!isGroup) {
        // Use actual bracket's team assignments (since user saw real teams)
        const actualResolved = actualBracket.knockoutTeamMap.get(match.match_number)
        predictedHomeTeamId = actualResolved?.home?.team_id ?? null
        predictedAwayTeamId = actualResolved?.away?.team_id ?? null

        // Teams match because user predicted against actual teams
        teamsMatch = checkKnockoutTeamsMatch(
          match.stage,
          match.home_team_id,
          match.away_team_id,
          predictedHomeTeamId,
          predictedAwayTeamId,
        )
      }

      const row = computeMatchScore({
        poolId,
        entryId: entry.entry_id,
        match,
        prediction: pred,
        settings,
        knockoutTeamsMatch: teamsMatch,
        predictedHomeTeamId,
        predictedAwayTeamId,
      })

      if (row) {
        allMatchScores.push(row)
        matchPoints += row.total_points
      }
    }

    // Calculate bonus points
    // Progressive mode uses actual knockout team map for match winner bonuses
    const bonusEntries = calculateAllBonusPoints({
      memberId: entry.entry_id,
      memberPredictions: predictionMap,
      matches: matches as any,
      teams: teamsArr,
      conductData: conduct,
      settings,
      tournamentAwards,
      predictionMode: 'progressive',
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

    allEntryTotals.push({
      entry_id: entry.entry_id,
      match_points: matchPoints,
      bonus_points: bonusPoints,
      point_adjustment: entry.point_adjustment,
      total_points: matchPoints + bonusPoints + entry.point_adjustment,
    })
  }

  return {
    matchScores: allMatchScores,
    bonusScores: allBonusScores,
    entryTotals: allEntryTotals,
  }
}
