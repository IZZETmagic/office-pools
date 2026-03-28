// =============================================================
// SCORING ENGINE — BRACKET PICKER MODE
// =============================================================
// Calculates scores for pools using the "bracket_picker"
// prediction mode. Users predict group positions, third-place
// qualifiers, and knockout match winners — NOT individual
// match scores. There are no match-level scores; everything
// is stored as bonus-style entries.
// =============================================================

import type {
  ScoringResult,
  BonusScoreRow,
  EntryTotals,
  MatchWithResult,
  TeamData,
  ConductData,
  BPEntryWithPicks,
} from './types'
import type { PoolSettings } from './types'
import {
  calculateBracketPickerPoints,
  type MatchWithResult as BPMatchWithResult,
} from '@/lib/bracketPickerScoring'
import { calculateGroupStandings, rankThirdPlaceTeams, GROUP_LETTERS } from '@/lib/tournament'
import type { GroupStanding, MatchConductData, PredictionMap, ScoreEntry } from '@/lib/tournament'
import type { SettingsData } from '@/app/pools/[pool_id]/types'

// ----- Input type specific to bracket picker -----

export type BracketPickerInput = {
  poolId: string
  tournamentId: string
  settings: PoolSettings
  matches: MatchWithResult[]
  teams: TeamData[]
  conductData: ConductData[]
  entries: BPEntryWithPicks[]
}

// ----- Helpers -----

function formatStage(stage: string): string {
  switch (stage) {
    case 'round_32': return 'Round of 32'
    case 'round_16': return 'Round of 16'
    case 'quarter_final': return 'Quarter-Final'
    case 'semi_final': return 'Semi-Final'
    case 'third_place': return 'Third-Place Match'
    case 'final': return 'Final'
    default: return stage
  }
}

// ----- Main calculator -----

/**
 * Calculate all scores for a Bracket Picker mode pool.
 *
 * Bracket picker has NO match-level scores. All points come from:
 *   - Group position predictions (1st through 4th)
 *   - Third-place qualifier/eliminated predictions
 *   - Knockout match winner predictions
 *   - Penalty prediction accuracy
 *   - Champion bonus
 *
 * Results are stored entirely in bonusScores.
 */
export function calculateBracketPicker(input: BracketPickerInput): ScoringResult {
  const { matches, teams, conductData, settings, entries } = input

  const conduct: MatchConductData[] = conductData as any

  // Build actual results map from completed matches
  const actualResultsMap: PredictionMap = new Map()
  for (const m of matches) {
    if (m.is_completed && m.home_score_ft != null && m.away_score_ft != null) {
      const entry: ScoreEntry = {
        home: m.home_score_ft,
        away: m.away_score_ft,
        homePso: m.home_score_pso ?? null,
        awayPso: m.away_score_pso ?? null,
        winnerTeamId: m.winner_team_id ?? null,
      }
      actualResultsMap.set(m.match_id, entry)
    }
  }

  // Compute actual group standings
  const actualGroupStandings = new Map<string, GroupStanding[]>()
  for (const letter of GROUP_LETTERS) {
    const groupMatches = matches.filter(m => m.stage === 'group' && m.group_letter === letter)
    if (groupMatches.length === 0) continue

    const standings = calculateGroupStandings(
      letter,
      groupMatches as any,
      actualResultsMap,
      teams as any,
      conduct,
    )
    actualGroupStandings.set(letter, standings)
  }

  // Compute actual third-place qualifiers
  const actualThirdPlaceQualifierTeamIds = new Set<string>()
  const completedGroupLetters = new Set<string>()

  for (const [letter] of actualGroupStandings) {
    const groupMatches = matches.filter(
      m => m.stage === 'group' && m.group_letter === letter && m.is_completed
    )
    if (groupMatches.length >= 6) {
      completedGroupLetters.add(letter)
    }
  }

  if (completedGroupLetters.size === 12) {
    const completedStandingsMap = new Map<string, GroupStanding[]>()
    for (const letter of completedGroupLetters) {
      const standings = actualGroupStandings.get(letter)
      if (standings) completedStandingsMap.set(letter, standings)
    }
    const rankedThird = rankThirdPlaceTeams(completedStandingsMap)
    const best8 = rankedThird.slice(0, 8)
    for (const t of best8) {
      actualThirdPlaceQualifierTeamIds.add(t.team_id)
    }
  }

  // Cast matches to the shape bracketPickerScoring expects
  const bpMatches: BPMatchWithResult[] = matches.map(m => ({
    match_id: m.match_id,
    match_number: m.match_number,
    stage: m.stage,
    group_letter: m.group_letter,
    match_date: m.match_date,
    venue: m.venue,
    status: m.status,
    home_team_id: m.home_team_id,
    away_team_id: m.away_team_id,
    home_team_placeholder: m.home_team_placeholder,
    away_team_placeholder: m.away_team_placeholder,
    home_team: m.home_team,
    away_team: m.away_team,
    is_completed: m.is_completed,
    home_score_ft: m.home_score_ft,
    away_score_ft: m.away_score_ft,
    home_score_pso: m.home_score_pso,
    away_score_pso: m.away_score_pso,
    winner_team_id: m.winner_team_id,
  }))

  const allBonusScores: BonusScoreRow[] = []
  const allEntryTotals: EntryTotals[] = []
  const positionLabels = ['1st', '2nd', '3rd', '4th'] as const

  for (const entry of entries) {
    const { groupRankings, thirdPlaceRankings, knockoutPicks } = entry

    if (groupRankings.length === 0 && thirdPlaceRankings.length === 0 && knockoutPicks.length === 0) {
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

    // Calculate bracket picker points using existing scoring module
    const breakdown = calculateBracketPickerPoints({
      groupRankings,
      thirdPlaceRankings,
      knockoutPicks,
      actualGroupStandings,
      actualThirdPlaceQualifierTeamIds,
      completedMatches: bpMatches,
      settings: settings as SettingsData,
    })

    // Convert breakdown to BonusScoreRows

    // Group ranking details
    for (const d of breakdown.groupDetails) {
      const team = teams.find(t => t.team_id === d.team_id)
      const teamName = team?.country_name || d.team_id
      const posLabel = positionLabels[d.position - 1] ?? `${d.position}th`
      const correctness = d.correct ? 'Correctly' : 'Incorrectly'
      allBonusScores.push({
        entry_id: entry.entry_id,
        bonus_type: `bp_group_position_${d.position}`,
        bonus_category: 'bp_group',
        related_group_letter: d.group_letter,
        related_match_id: null,
        points_earned: d.points,
        description: `Group ${d.group_letter} ${posLabel} position: ${correctness} predicted ${teamName}`,
      })
    }

    // Third-place ranking details
    for (const d of breakdown.thirdPlaceDetails) {
      if (d.points > 0) {
        const team = teams.find(t => t.team_id === d.team_id)
        const label = d.predicted_qualifies ? 'qualifies' : 'eliminated'
        allBonusScores.push({
          entry_id: entry.entry_id,
          bonus_type: `bp_third_${label}`,
          bonus_category: 'bp_third_place',
          related_group_letter: d.group_letter,
          related_match_id: null,
          points_earned: d.points,
          description: `Correctly predicted ${team?.country_name || d.team_id} (Group ${d.group_letter}) ${label}`,
        })
      }
    }

    // Third-place all correct bonus
    if (breakdown.thirdPlaceAllCorrectBonus > 0) {
      allBonusScores.push({
        entry_id: entry.entry_id,
        bonus_type: 'bp_third_all_correct',
        bonus_category: 'bp_third_place',
        related_group_letter: null,
        related_match_id: null,
        points_earned: breakdown.thirdPlaceAllCorrectBonus,
        description: 'Correctly predicted all 8 qualifying third-place teams',
      })
    }

    // Knockout details
    for (const d of breakdown.knockoutDetails) {
      if (d.points > 0) {
        const stageLabel = formatStage(d.stage)
        const team = teams.find(t => t.team_id === d.predicted_winner)
        allBonusScores.push({
          entry_id: entry.entry_id,
          bonus_type: `bp_knockout_${d.stage}`,
          bonus_category: 'bp_knockout',
          related_group_letter: null,
          related_match_id: d.match_id,
          points_earned: d.points,
          description: `Correctly predicted ${team?.country_name || d.predicted_winner} to win Match ${d.match_number} (${stageLabel})`,
        })
      }
    }

    // Penalty prediction points
    if (breakdown.penaltyPoints > 0) {
      allBonusScores.push({
        entry_id: entry.entry_id,
        bonus_type: 'bp_penalty_predictions',
        bonus_category: 'bp_bonus',
        related_group_letter: null,
        related_match_id: null,
        points_earned: breakdown.penaltyPoints,
        description: `Penalty prediction points (${breakdown.penaltyPoints} pts)`,
      })
    }

    // Champion bonus
    if (breakdown.championBonus > 0) {
      allBonusScores.push({
        entry_id: entry.entry_id,
        bonus_type: 'bp_champion',
        bonus_category: 'bp_bonus',
        related_group_letter: null,
        related_match_id: null,
        points_earned: breakdown.championBonus,
        description: 'Correctly predicted the tournament champion',
      })
    }

    // Bracket picker has no match_points — everything is bonus
    // correct_count = number of correct picks across all categories
    const bpCorrectCount = breakdown.groupDetails.filter(d => d.correct).length
      + breakdown.thirdPlaceDetails.filter(d => d.correct).length
      + breakdown.knockoutDetails.filter(d => d.correct).length

    allEntryTotals.push({
      entry_id: entry.entry_id,
      match_points: 0,
      bonus_points: breakdown.total,
      point_adjustment: entry.point_adjustment,
      total_points: breakdown.total + entry.point_adjustment,
      exact_count: 0, // Not applicable for bracket picker
      correct_count: bpCorrectCount,
    })
  }

  return {
    matchScores: [], // Bracket picker has no match-level scores
    bonusScores: allBonusScores,
    entryTotals: allEntryTotals,
  }
}
