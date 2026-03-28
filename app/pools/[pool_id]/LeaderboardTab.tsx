'use client'

import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { PointsBreakdownModal } from './PointsBreakdownModal'
import { calculateBracketPickerPoints, type MatchWithResult as BPMatchWithResult } from '@/lib/bracketPickerScoring'
import { calculateGroupStandings, rankThirdPlaceTeams, GROUP_LETTERS } from '@/lib/tournament'
import type { MemberData, LeaderboardEntry, PlayerScoreData, BonusScoreData, MatchScoreData, MatchData, TeamData, PredictionData, BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick } from './types'
import type { PredictionMap, MatchConductData, Team, GroupStanding, ScoreEntry } from '@/lib/tournament'
import type { PoolSettings } from './results/points'
import { formatNumber } from '@/lib/format'
import { computeStreaks, computeCrowdPredictions } from './analytics/analyticsHelpers'
// Types used implicitly through function returns
import { computeFullXPBreakdown, computeLevel } from './analytics/xpSystem'

type LeaderboardTabProps = {
  members: MemberData[]
  matchScores: MatchScoreData[]
  bonusScores: BonusScoreData[]
  matches: MatchData[]
  teams: TeamData[]
  conductData: MatchConductData[]
  allPredictions: PredictionData[]
  poolSettings: PoolSettings
  maxEntriesPerUser: number
  currentUserId: string
  predictionMode?: 'full_tournament' | 'progressive' | 'bracket_picker'
  // All entries' bracket picker data for client-side scoring
  allBPGroupRankings?: BPGroupRanking[]
  allBPThirdPlaceRankings?: BPThirdPlaceRanking[]
  allBPKnockoutPicks?: BPKnockoutPick[]
}

// =============================================
// HELPERS
// =============================================

function toTournamentTeams(teams: TeamData[]): Team[] {
  return teams.map((t) => ({
    team_id: t.team_id,
    country_name: t.country_name,
    country_code: t.country_code,
    group_letter: t.group_letter,
    fifa_ranking_points: t.fifa_ranking_points,
    flag_url: t.flag_url,
  }))
}

// =============================================
// COMPONENT
// =============================================

export function LeaderboardTab({
  members,
  matchScores,
  bonusScores,
  matches,
  teams,
  conductData,
  allPredictions,
  poolSettings,
  maxEntriesPerUser,
  currentUserId,
  predictionMode = 'full_tournament',
  allBPGroupRankings = [],
  allBPThirdPlaceRankings = [],
  allBPKnockoutPicks = [],
}: LeaderboardTabProps) {
  const isMultiEntry = maxEntriesPerUser > 1

  // Flatten members into leaderboard entries (each entry is a row)
  const leaderboardEntries: LeaderboardEntry[] = useMemo(() => {
    const entries: LeaderboardEntry[] = []
    for (const member of members) {
      for (const entry of member.entries || []) {
        entries.push({
          ...entry,
          users: member.users,
          role: member.role,
        })
      }
    }
    return entries
  }, [members])

  // Build match_scores lookup: entry_id → MatchScoreData[]
  const matchScoresByEntry = useMemo(() => {
    const map = new Map<string, MatchScoreData[]>()
    for (const ms of matchScores) {
      const existing = map.get(ms.entry_id) || []
      existing.push(ms)
      map.set(ms.entry_id, existing)
    }
    return map
  }, [matchScores])

  // Build match_scores lookup: entry_id → match_id → MatchScoreData
  const matchScoresLookup = useMemo(() => {
    const map = new Map<string, Map<string, MatchScoreData>>()
    for (const ms of matchScores) {
      if (!map.has(ms.entry_id)) map.set(ms.entry_id, new Map())
      map.get(ms.entry_id)!.set(ms.match_id, ms)
    }
    return map
  }, [matchScores])

  const tournamentTeams = useMemo(() => toTournamentTeams(teams), [teams])

  // Read bonus scores from DB (grouped by entry_id)
  const dbBonusByEntry = useMemo(() => {
    const map = new Map<string, BonusScoreData[]>()
    for (const bs of bonusScores) {
      const existing = map.get(bs.entry_id) || []
      existing.push(bs)
      map.set(bs.entry_id, existing)
    }
    return map
  }, [bonusScores])

  // Read stored match points per entry from match_scores
  const storedMatchPointsMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const [entryId, scores] of matchScoresByEntry) {
      map.set(entryId, scores.reduce((sum, s) => sum + s.total_points, 0))
    }
    return map
  }, [matchScoresByEntry])

  // Compute bracket picker scores client-side (bracket picker has different scoring model)
  const computedBPBonusMap = useMemo(() => {
    const map = new Map<string, BonusScoreData[]>()
    if (predictionMode !== 'bracket_picker' || allBPGroupRankings.length === 0) return map

    // Build actual group standings from real match results
    const conduct = conductData
    const actualResultsMap: PredictionMap = new Map()
    for (const m of matches) {
      if ((m.is_completed || m.status === 'completed') && m.home_score_ft != null && m.away_score_ft != null) {
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

    const actualGroupStandings = new Map<string, GroupStanding[]>()
    for (const letter of GROUP_LETTERS) {
      const groupMatches = matches.filter(m => m.stage === 'group' && m.group_letter === letter)
      if (groupMatches.length === 0) continue
      const standings = calculateGroupStandings(
        letter,
        groupMatches as any,
        actualResultsMap,
        tournamentTeams,
        conduct,
      )
      actualGroupStandings.set(letter, standings)
    }

    // Determine actual third-place qualifiers
    const actualThirdPlaceQualifierTeamIds = new Set<string>()
    const completedGroupLetters = new Set<string>()
    for (const [letter] of actualGroupStandings) {
      const completedGroupMatches = matches.filter(
        m => m.stage === 'group' && m.group_letter === letter && m.is_completed
      )
      if (completedGroupMatches.length >= 6) completedGroupLetters.add(letter)
    }

    if (completedGroupLetters.size === 12) {
      const completedStandingsMap = new Map<string, GroupStanding[]>()
      for (const letter of completedGroupLetters) {
        const standings = actualGroupStandings.get(letter)
        if (standings) completedStandingsMap.set(letter, standings)
      }
      const rankedThird = rankThirdPlaceTeams(completedStandingsMap)
      for (const t of rankedThird.slice(0, 8)) {
        actualThirdPlaceQualifierTeamIds.add(t.team_id)
      }
    }

    // Build BP match data
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
      home_team: m.home_team ? { country_name: m.home_team.country_name, flag_url: null } : null,
      away_team: m.away_team ? { country_name: m.away_team.country_name, flag_url: null } : null,
      is_completed: m.is_completed ?? false,
      home_score_ft: m.home_score_ft,
      away_score_ft: m.away_score_ft,
      home_score_pso: m.home_score_pso,
      away_score_pso: m.away_score_pso,
      winner_team_id: m.winner_team_id,
    }))

    // Group BP data by entry_id
    const grByEntry = new Map<string, BPGroupRanking[]>()
    const tpByEntry = new Map<string, BPThirdPlaceRanking[]>()
    const kpByEntry = new Map<string, BPKnockoutPick[]>()

    for (const r of allBPGroupRankings) {
      const list = grByEntry.get(r.entry_id) || []
      list.push(r)
      grByEntry.set(r.entry_id, list)
    }
    for (const r of allBPThirdPlaceRankings) {
      const list = tpByEntry.get(r.entry_id) || []
      list.push(r)
      tpByEntry.set(r.entry_id, list)
    }
    for (const p of allBPKnockoutPicks) {
      const list = kpByEntry.get(p.entry_id) || []
      list.push(p)
      kpByEntry.set(p.entry_id, list)
    }

    // Compute scores for each entry that has BP data
    const allEntryIds = new Set([...grByEntry.keys(), ...tpByEntry.keys(), ...kpByEntry.keys()])

    const formatStage = (stage: string): string => {
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

    for (const entryId of allEntryIds) {
      const groupRankings = grByEntry.get(entryId) || []
      const thirdPlaceRankings = tpByEntry.get(entryId) || []
      const knockoutPicks = kpByEntry.get(entryId) || []

      if (groupRankings.length === 0 && thirdPlaceRankings.length === 0 && knockoutPicks.length === 0) continue

      const breakdown = calculateBracketPickerPoints({
        groupRankings,
        thirdPlaceRankings,
        knockoutPicks,
        actualGroupStandings,
        actualThirdPlaceQualifierTeamIds,
        completedMatches: bpMatches,
        settings: poolSettings as any,
      })

      // Convert breakdown to BonusScoreData[] (same format the API stores)
      const bonusData: BonusScoreData[] = []
      let idx = 0

      for (const d of breakdown.groupDetails) {
        const team = tournamentTeams.find(t => t.team_id === d.team_id)
        const teamName = team?.country_name || d.team_id
        let description: string
        if (d.correct) {
          description = `Correctly predicted ${teamName} at position ${d.position} in Group ${d.group_letter}`
        } else {
          const standings = actualGroupStandings.get(d.group_letter)
          const actualIdx = standings?.findIndex(s => s.team_id === d.team_id) ?? -1
          const actualPos = actualIdx >= 0 ? actualIdx + 1 : null
          description = actualPos
            ? `Predicted ${teamName} at position ${d.position} in Group ${d.group_letter} (actual: ${actualPos})`
            : `Predicted ${teamName} at position ${d.position} in Group ${d.group_letter}`
        }
        bonusData.push({
          bonus_id: `bp-computed-${entryId}-${idx++}`,
          entry_id: entryId,
          bonus_type: `bp_group_position_${d.position}${d.correct ? '' : '_miss'}`,
          bonus_category: 'bp_group',
          related_group_letter: d.group_letter,
          related_match_id: null,
          points_earned: d.points,
          description,
        })
      }

      for (const d of breakdown.thirdPlaceDetails) {
        const team = tournamentTeams.find(t => t.team_id === d.team_id)
        const teamName = team?.country_name || d.team_id
        const predictedLabel = d.predicted_qualifies ? 'qualifies' : 'eliminated'
        let description: string
        if (d.correct) {
          description = `Correctly predicted ${teamName} (Group ${d.group_letter}) ${predictedLabel}`
        } else {
          const actualLabel = d.actually_qualifies ? 'qualified' : 'was eliminated'
          description = `Predicted ${teamName} (Group ${d.group_letter}) ${predictedLabel} (actually ${actualLabel})`
        }
        bonusData.push({
          bonus_id: `bp-computed-${entryId}-${idx++}`,
          entry_id: entryId,
          bonus_type: `bp_third_${predictedLabel}${d.correct ? '' : '_miss'}`,
          bonus_category: 'bp_third_place',
          related_group_letter: d.group_letter,
          related_match_id: null,
          points_earned: d.points,
          description,
        })
      }

      if (breakdown.thirdPlaceAllCorrectBonus > 0) {
        bonusData.push({
          bonus_id: `bp-computed-${entryId}-${idx++}`,
          entry_id: entryId,
          bonus_type: 'bp_third_all_correct',
          bonus_category: 'bp_third_place',
          related_group_letter: null,
          related_match_id: null,
          points_earned: breakdown.thirdPlaceAllCorrectBonus,
          description: 'Correctly predicted all 8 qualifying third-place teams',
        })
      }

      for (const d of breakdown.knockoutDetails) {
        const stageLabel = formatStage(d.stage)
        const predictedTeam = tournamentTeams.find(t => t.team_id === d.predicted_winner)
        const predictedName = predictedTeam?.country_name || d.predicted_winner
        let description: string
        let typeSuffix = ''
        if (d.correct) {
          description = `Correctly predicted ${predictedName} to win Match ${d.match_number} (${stageLabel})`
        } else if (d.actual_winner === null) {
          description = `Predicted ${predictedName} to win Match ${d.match_number} (${stageLabel})`
          typeSuffix = '_pending'
        } else {
          const actualTeam = tournamentTeams.find(t => t.team_id === d.actual_winner)
          const actualName = actualTeam?.country_name || d.actual_winner
          description = `Predicted ${predictedName} to win Match ${d.match_number} (${stageLabel}) (actual: ${actualName})`
          typeSuffix = '_miss'
        }
        bonusData.push({
          bonus_id: `bp-computed-${entryId}-${idx++}`,
          entry_id: entryId,
          bonus_type: `bp_knockout_${d.stage}${typeSuffix}`,
          bonus_category: 'bp_knockout',
          related_group_letter: null,
          related_match_id: d.match_id,
          points_earned: d.points,
          description,
        })
      }

      if (breakdown.penaltyPoints > 0) {
        bonusData.push({
          bonus_id: `bp-computed-${entryId}-${idx++}`,
          entry_id: entryId,
          bonus_type: 'bp_penalty_predictions',
          bonus_category: 'bp_bonus',
          related_group_letter: null,
          related_match_id: null,
          points_earned: breakdown.penaltyPoints,
          description: `Penalty prediction points (${breakdown.penaltyPoints} pts)`,
        })
      }

      if (breakdown.championBonus > 0) {
        bonusData.push({
          bonus_id: `bp-computed-${entryId}-${idx++}`,
          entry_id: entryId,
          bonus_type: 'bp_champion',
          bonus_category: 'bp_bonus',
          related_group_letter: null,
          related_match_id: null,
          points_earned: breakdown.championBonus,
          description: 'Correctly predicted the tournament champion',
        })
      }

      map.set(entryId, bonusData)
    }

    return map
  }, [predictionMode, allBPGroupRankings, allBPThirdPlaceRankings, allBPKnockoutPicks, matches, tournamentTeams, conductData, poolSettings])

  // Compute bracket picker accuracy stats per entry
  const bpStatsMap = useMemo(() => {
    const map = new Map<string, { correct: number; total: number; accuracy: number }>()
    if (predictionMode !== 'bracket_picker') return map

    for (const [entryId, bonusData] of computedBPBonusMap) {
      // Only count individual pick entries (bp_group, bp_third_place, bp_knockout), not bonus entries
      const pickCategories = new Set(['bp_group', 'bp_third_place', 'bp_knockout'])
      const picks = bonusData.filter(e => pickCategories.has(e.bonus_category))
      // Exclude pending picks and bonus-type entries like bp_third_all_correct
      const bonusTypes = new Set(['bp_third_all_correct'])
      const resolved = picks.filter(e => !e.bonus_type.endsWith('_pending') && !bonusTypes.has(e.bonus_type))
      const correct = resolved.filter(e => !e.bonus_type.endsWith('_miss')).length
      const total = resolved.length
      const accuracy = total > 0 ? (correct / total) * 100 : 0
      map.set(entryId, { correct, total, accuracy })
    }

    return map
  }, [predictionMode, computedBPBonusMap])

  // Get bonus data for an entry from DB
  const getBonusForEntry = (entryId: string): BonusScoreData[] => {
    // For bracket picker, prefer computed BP scores (bracket picker breakdown not stored in bonus_scores the same way)
    if (predictionMode === 'bracket_picker') {
      return computedBPBonusMap.get(entryId) || dbBonusByEntry.get(entryId) || []
    }
    return dbBonusByEntry.get(entryId) || []
  }

  // Check if any entry has bonus points
  const hasAnyBonusPoints = useMemo(() => {
    if (bonusScores.length > 0) return true
    for (const entries of computedBPBonusMap.values()) {
      if (entries.length > 0) return true
    }
    return leaderboardEntries.some(e => (e.bonus_points ?? 0) > 0)
  }, [computedBPBonusMap, bonusScores, leaderboardEntries])

  // Build player score for modal — reads from stored entry values (single source of truth)
  const getPlayerScore = (entryId: string): PlayerScoreData => {
    const entry = leaderboardEntries.find(e => e.entry_id === entryId)
    const adjustment = entry?.point_adjustment ?? 0

    // For bracket picker pools, use client-side computed BP scores for breakdown display
    if (predictionMode === 'bracket_picker') {
      const computedBP = computedBPBonusMap.get(entryId)
      if (computedBP) {
        const baseCats = new Set(['bp_group', 'bp_third_place', 'bp_knockout'])
        const picksPts = computedBP.filter(e => baseCats.has(e.bonus_category)).reduce((sum, e) => sum + e.points_earned, 0)
        const bonusPts = computedBP.filter(e => !baseCats.has(e.bonus_category)).reduce((sum, e) => sum + e.points_earned, 0)
        return {
          entry_id: entryId,
          match_points: picksPts,
          bonus_points: bonusPts,
          total_points: picksPts + bonusPts + adjustment,
        }
      }
    }

    // Read from stored pool_entries values
    const matchPts = entry?.match_points ?? storedMatchPointsMap.get(entryId) ?? 0
    const bonusPts = entry?.bonus_points ?? 0

    return {
      entry_id: entryId,
      match_points: matchPts,
      bonus_points: bonusPts,
      total_points: entry?.scored_total_points ?? (matchPts + bonusPts + adjustment),
    }
  }

  // Sort entries by server-computed current_rank (which includes all tiebreakers:
  // total points → exact scores → correct results → bonus points → submission time)
  // Falls back to total points if rank is not yet computed
  const sorted = useMemo(() => {
    return [...leaderboardEntries].sort((a, b) => {
      const aRank = a.current_rank
      const bRank = b.current_rank
      // If both have ranks, use them (server already applied tiebreakers)
      if (aRank != null && bRank != null) {
        if (aRank !== bRank) return aRank - bRank
      }
      // Fallback: sort by total points
      const aScore = getPlayerScore(a.entry_id).total_points
      const bScore = getPlayerScore(b.entry_id).total_points
      return bScore - aScore
    })
  }, [leaderboardEntries, storedMatchPointsMap, computedBPBonusMap, bonusScores, predictionMode])

  // =============================================
  // PER-ENTRY STATS (XP, streaks, form, hit rate)
  // =============================================

  type EntryStats = {
    hitRate: number
    exactCount: number
    currentStreak: { type: 'hot' | 'cold' | 'none'; length: number }
    last5: ('exact' | 'winner_gd' | 'winner' | 'miss')[]
    level: number
    levelName: string
    totalXP: number
    totalCompleted: number
    contrarianWins: number
    crowdAgreementPct: number
    matchPoints: number
    bonusPoints: number
  }

  const isBracketPicker = predictionMode === 'bracket_picker'

  const entryStatsMap = useMemo(() => {
    const map = new Map<string, EntryStats>()
    if (isBracketPicker) return map

    const completedMatches = matches.filter(m => m.is_completed && m.home_score_ft !== null && m.away_score_ft !== null)
    if (completedMatches.length === 0) return map

    // Group predictions by entry (still needed for crowd/XP computation)
    const predsByEntry = new Map<string, PredictionData[]>()
    for (const p of allPredictions) {
      const arr = predsByEntry.get(p.entry_id) || []
      arr.push(p)
      predsByEntry.set(p.entry_id, arr)
    }

    for (const entry of sorted) {
      const entryPreds = predsByEntry.get(entry.entry_id) || []
      const mPts = entry.match_points ?? storedMatchPointsMap.get(entry.entry_id) ?? 0
      const bPts = entry.bonus_points ?? 0

      // Get this entry's match scores from DB (sorted by match_number for form display)
      const entryMatchScores = (matchScoresByEntry.get(entry.entry_id) || [])
        .slice()
        .sort((a, b) => a.match_number - b.match_number)

      if (entryMatchScores.length === 0 && entryPreds.length === 0) {
        map.set(entry.entry_id, {
          hitRate: 0, exactCount: 0,
          currentStreak: { type: 'none', length: 0 },
          last5: [], level: 1, levelName: 'Rookie', totalXP: 0, totalCompleted: 0,
          contrarianWins: 0, crowdAgreementPct: 0, matchPoints: mPts, bonusPoints: bPts,
        })
        continue
      }

      // Derive prediction results from stored match_scores (single source of truth)
      const predResults = entryMatchScores.map(ms => ({
        matchId: ms.match_id,
        matchNumber: ms.match_number,
        type: ms.score_type as 'exact' | 'winner_gd' | 'winner' | 'miss',
        points: ms.total_points,
        stage: ms.stage,
      }))

      const streakData = computeStreaks(predResults)
      const hits = predResults.filter(r => r.type !== 'miss').length
      const exactCount = predResults.filter(r => r.type === 'exact').length
      const hitRate = predResults.length > 0 ? (hits / predResults.length) * 100 : 0

      // Last 5 form (oldest left → most recent right)
      const last5 = predResults
        .slice(-5)
        .map(r => r.type)

      // Compute crowd data per entry for XP + contrarian stats
      const crowdForEntry = computeCrowdPredictions(matches, allPredictions, entryPreds, members)
      const contrarianWins = crowdForEntry.filter(c => c.userIsContrarian && c.userWasCorrect).length
      const crowdAgreementPct = crowdForEntry.length > 0
        ? (crowdForEntry.filter(c => !c.userIsContrarian).length / crowdForEntry.length) * 100
        : 0

      // Compute XP
      const entryRank = entry.current_rank ?? null
      let level = 1
      let levelName = 'Rookie'
      let totalXP = 0

      try {
        const xpBreakdown = computeFullXPBreakdown({
          predictionResults: predResults,
          matches,
          crowdData: crowdForEntry,
          streaks: streakData,
          entryPredictions: entryPreds,
          entryRank,
          totalMatches: matches.length,
        })
        totalXP = xpBreakdown.totalXP
        const levelInfo = computeLevel(totalXP)
        level = levelInfo.currentLevel.level
        levelName = levelInfo.currentLevel.name
      } catch {
        // Fallback if XP computation fails
      }

      map.set(entry.entry_id, {
        hitRate,
        exactCount,
        currentStreak: streakData.currentStreak,
        last5,
        level,
        levelName,
        totalXP,
        totalCompleted: predResults.length,
        contrarianWins,
        crowdAgreementPct,
        matchPoints: mPts,
        bonusPoints: bPts,
      })
    }

    return map
  }, [sorted, allPredictions, matches, teams, conductData, members, isBracketPicker, storedMatchPointsMap, matchScoresByEntry])

  // =============================================
  // MATCHDAY MVP
  // =============================================

  type MatchdayMVPData = {
    entryId: string
    entryName: string
    username: string
    matchPoints: number
    matchNumber: number
  } | null

  const matchdayMVP: MatchdayMVPData = useMemo(() => {
    if (isBracketPicker) return null
    const completed = matches
      .filter(m => m.is_completed && m.home_score_ft !== null && m.away_score_ft !== null)
      .sort((a, b) => b.match_number - a.match_number)
    if (completed.length === 0) return null

    const lastMatch = completed[0]

    let bestEntry: LeaderboardEntry | null = null
    let bestPoints = 0

    for (const entry of sorted) {
      // Look up this entry's score for the last match from stored match_scores
      const entryScores = matchScoresLookup.get(entry.entry_id)
      const matchScore = entryScores?.get(lastMatch.match_id)
      if (!matchScore) continue

      if (matchScore.total_points > bestPoints) {
        bestPoints = matchScore.total_points
        bestEntry = entry
      }
    }

    if (!bestEntry || bestPoints === 0) return null
    return {
      entryId: bestEntry.entry_id,
      entryName: isMultiEntry
        ? (bestEntry.entry_name || `Entry ${bestEntry.entry_number}`)
        : (bestEntry.users?.full_name || bestEntry.users?.username || 'Unknown'),
      username: bestEntry.users?.username || '',
      matchPoints: bestPoints,
      matchNumber: lastMatch.match_number,
    }
  }, [matches, allPredictions, sorted, poolSettings, teams, conductData, isBracketPicker, isMultiEntry])

  // =============================================
  // POOL AWARDS
  // =============================================

  type PoolAward = { type: string; emoji: string; label: string; entryId: string }

  const poolAwards = useMemo(() => {
    const awards: PoolAward[] = []
    if (isBracketPicker || sorted.length === 0) return awards

    // MVP — 1st place
    awards.push({ type: 'mvp', emoji: '🏆', label: 'MVP', entryId: sorted[0].entry_id })

    // Contrarian King — most contrarian wins
    let bestContrarian: { entryId: string; count: number } | null = null
    let bestCrowdFollower: { entryId: string; pct: number } | null = null
    let bestHotStreak: { entryId: string; length: number } | null = null
    let bestColdStreak: { entryId: string; length: number } | null = null

    for (const [entryId, stats] of entryStatsMap) {
      if (stats.contrarianWins > 0 && (!bestContrarian || stats.contrarianWins > bestContrarian.count)) {
        bestContrarian = { entryId, count: stats.contrarianWins }
      }
      if (stats.crowdAgreementPct > 0 && (!bestCrowdFollower || stats.crowdAgreementPct > bestCrowdFollower.pct)) {
        bestCrowdFollower = { entryId, pct: stats.crowdAgreementPct }
      }
      if (stats.currentStreak.type === 'hot' && stats.currentStreak.length >= 3) {
        if (!bestHotStreak || stats.currentStreak.length > bestHotStreak.length) {
          bestHotStreak = { entryId, length: stats.currentStreak.length }
        }
      }
      if (stats.currentStreak.type === 'cold' && stats.currentStreak.length >= 3) {
        if (!bestColdStreak || stats.currentStreak.length > bestColdStreak.length) {
          bestColdStreak = { entryId, length: stats.currentStreak.length }
        }
      }
    }

    if (bestContrarian) awards.push({ type: 'contrarian', emoji: '🎲', label: 'Contrarian King', entryId: bestContrarian.entryId })
    if (bestCrowdFollower) awards.push({ type: 'crowd', emoji: '👥', label: 'Crowd Follower', entryId: bestCrowdFollower.entryId })
    if (bestHotStreak) awards.push({ type: 'hot', emoji: '🔥', label: `On Fire (${bestHotStreak.length})`, entryId: bestHotStreak.entryId })
    if (bestColdStreak) awards.push({ type: 'cold', emoji: '❄️', label: `Ice Cold (${bestColdStreak.length})`, entryId: bestColdStreak.entryId })

    return awards
  }, [sorted, entryStatsMap, isBracketPicker])

  // Build a quick lookup: entryId → awards for that entry
  const awardsByEntry = useMemo(() => {
    const map = new Map<string, PoolAward[]>()
    for (const award of poolAwards) {
      const arr = map.get(award.entryId) || []
      arr.push(award)
      map.set(award.entryId, arr)
    }
    return map
  }, [poolAwards])

  // =============================================
  // USER INSIGHT
  // =============================================

  type UserInsightData = {
    ptsBehind: number | null
    personAboveName: string | null
    ptsAhead: number | null
    personBelowName: string | null
  } | null

  const userInsight: UserInsightData = useMemo(() => {
    const idx = sorted.findIndex(e => e.users?.user_id === currentUserId)
    if (idx < 0) return null

    const userPts = getPlayerScore(sorted[idx].entry_id).total_points
    let ptsBehind: number | null = null
    let personAboveName: string | null = null
    let ptsAhead: number | null = null
    let personBelowName: string | null = null

    if (idx > 0) {
      const above = sorted[idx - 1]
      ptsBehind = getPlayerScore(above.entry_id).total_points - userPts
      personAboveName = isMultiEntry
        ? (above.entry_name || `Entry ${above.entry_number}`)
        : (above.users?.full_name || above.users?.username || 'Unknown')
    }
    if (idx < sorted.length - 1) {
      const below = sorted[idx + 1]
      ptsAhead = userPts - getPlayerScore(below.entry_id).total_points
      personBelowName = isMultiEntry
        ? (below.entry_name || `Entry ${below.entry_number}`)
        : (below.users?.full_name || below.users?.username || 'Unknown')
    }

    return { ptsBehind, personAboveName, ptsAhead, personBelowName }
  }, [sorted, currentUserId, storedMatchPointsMap, bonusScores])

  // =============================================
  // POOL SUPERLATIVES
  // =============================================

  type Superlative = {
    type: string
    emoji: string
    title: string
    name: string
    detail: string
    bgClass: string
    titleColorClass: string
  }

  const poolSuperlatives = useMemo(() => {
    const superlatives: Superlative[] = []
    if (isBracketPicker || sorted.length === 0 || entryStatsMap.size === 0) return superlatives

    const getName = (entry: LeaderboardEntry) =>
      isMultiEntry ? (entry.entry_name || `Entry ${entry.entry_number}`) : (entry.users?.full_name || entry.users?.username || 'Unknown')

    // Hottest Right Now — longest current hot streak
    let hottestEntry: LeaderboardEntry | null = null
    let hottestLength = 0
    for (const entry of sorted) {
      const stats = entryStatsMap.get(entry.entry_id)
      if (stats && stats.currentStreak.type === 'hot' && stats.currentStreak.length > hottestLength) {
        hottestLength = stats.currentStreak.length
        hottestEntry = entry
      }
    }
    if (hottestEntry && hottestLength >= 2) {
      superlatives.push({
        type: 'hot', emoji: '🔥', title: 'Hottest Right Now',
        name: getName(hottestEntry),
        detail: `${hottestLength}-match win streak`,
        bgClass: 'bg-warning-50 dark:bg-warning-500/10',
        titleColorClass: 'text-warning-600 dark:text-warning-400',
      })
    }

    // Ice Cold — longest current cold streak
    let coldestEntry: LeaderboardEntry | null = null
    let coldestLength = 0
    for (const entry of sorted) {
      const stats = entryStatsMap.get(entry.entry_id)
      if (stats && stats.currentStreak.type === 'cold' && stats.currentStreak.length > coldestLength) {
        coldestLength = stats.currentStreak.length
        coldestEntry = entry
      }
    }
    if (coldestEntry && coldestLength >= 2) {
      superlatives.push({
        type: 'cold', emoji: '🧊', title: 'Ice Cold',
        name: getName(coldestEntry),
        detail: `${coldestLength} misses in last ${Math.min(5, coldestLength + 2)}`,
        bgClass: 'bg-primary-50 dark:bg-primary-500/10',
        titleColorClass: 'text-primary-600 dark:text-primary-400',
      })
    }

    // Contrarian King — most contrarian wins
    let bestContrarianEntry: LeaderboardEntry | null = null
    let bestContrarianCount = 0
    let bestContrarianTotal = 0
    for (const entry of sorted) {
      const stats = entryStatsMap.get(entry.entry_id)
      if (stats && stats.contrarianWins > bestContrarianCount) {
        bestContrarianCount = stats.contrarianWins
        bestContrarianEntry = entry
        bestContrarianTotal = stats.totalCompleted
      }
    }
    if (bestContrarianEntry && bestContrarianCount > 0) {
      const pct = bestContrarianTotal > 0 ? Math.round((bestContrarianCount / bestContrarianTotal) * 100) : 0
      superlatives.push({
        type: 'contrarian', emoji: '🎲', title: 'Contrarian King',
        name: getName(bestContrarianEntry),
        detail: `${pct}% picks against consensus`,
        bgClass: 'bg-[#f3e8ff] dark:bg-[#7c3aed]/10',
        titleColorClass: 'text-[#7c3aed] dark:text-[#a78bfa]',
      })
    }

    // Crowd Follower — highest crowd agreement %
    let bestCrowdEntry: LeaderboardEntry | null = null
    let bestCrowdPct = 0
    for (const entry of sorted) {
      const stats = entryStatsMap.get(entry.entry_id)
      if (stats && stats.crowdAgreementPct > bestCrowdPct && stats.totalCompleted >= 3) {
        bestCrowdPct = stats.crowdAgreementPct
        bestCrowdEntry = entry
      }
    }
    if (bestCrowdEntry && bestCrowdPct > 0) {
      superlatives.push({
        type: 'crowd', emoji: '👥', title: 'Crowd Follower',
        name: getName(bestCrowdEntry),
        detail: `${Math.round(bestCrowdPct)}% consensus picks`,
        bgClass: 'bg-primary-50 dark:bg-primary-500/10',
        titleColorClass: 'text-primary-600 dark:text-primary-400',
      })
    }

    // Sharpshooter — most exact scores
    let bestExactEntry: LeaderboardEntry | null = null
    let bestExactCount = 0
    for (const entry of sorted) {
      const stats = entryStatsMap.get(entry.entry_id)
      if (stats && stats.exactCount > bestExactCount) {
        bestExactCount = stats.exactCount
        bestExactEntry = entry
      }
    }
    if (bestExactEntry && bestExactCount > 0) {
      superlatives.push({
        type: 'sharpshooter', emoji: '🎯', title: 'Sharpshooter',
        name: getName(bestExactEntry),
        detail: `${bestExactCount} exact scores (pool best)`,
        bgClass: 'bg-danger-50 dark:bg-danger-500/10',
        titleColorClass: 'text-danger-600 dark:text-danger-400',
      })
    }

    // Biggest Climber — largest positive rank delta (using server-computed ranks for ties)
    let climberEntry: LeaderboardEntry | null = null
    let climberDelta = 0
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i]
      const curr = entry.current_rank
      const prev = entry.previous_rank
      if (prev !== null && prev !== undefined && curr !== null && curr !== undefined) {
        const delta = prev - curr
        if (delta > climberDelta) {
          climberDelta = delta
          climberEntry = entry
        }
      }
    }
    if (climberEntry && climberDelta > 0) {
      superlatives.push({
        type: 'climber', emoji: '📈', title: 'Biggest Climber',
        name: getName(climberEntry),
        detail: `Up ${climberDelta} places this matchday`,
        bgClass: 'bg-success-50 dark:bg-success-500/10',
        titleColorClass: 'text-success-600 dark:text-success-400',
      })
    }

    // Biggest Faller — largest negative rank delta (using server-computed ranks for ties)
    let fallerEntry: LeaderboardEntry | null = null
    let fallerDelta = 0
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i]
      const curr = entry.current_rank
      const prev = entry.previous_rank
      if (prev !== null && prev !== undefined && curr !== null && curr !== undefined) {
        const delta = prev - curr // negative means fell
        if (delta < fallerDelta) {
          fallerDelta = delta
          fallerEntry = entry
        }
      }
    }
    if (fallerEntry && fallerDelta < 0) {
      superlatives.push({
        type: 'faller', emoji: '📉', title: 'Biggest Faller',
        name: getName(fallerEntry),
        detail: `Down ${Math.abs(fallerDelta)} places this matchday`,
        bgClass: 'bg-danger-50 dark:bg-danger-500/10',
        titleColorClass: 'text-danger-600 dark:text-danger-400',
      })
    }

    return superlatives
  }, [sorted, entryStatsMap, isBracketPicker, isMultiEntry])

  // =============================================
  // STATE
  // =============================================

  const [selectedEntry, setSelectedEntry] = useState<LeaderboardEntry | null>(null)
  const [visibleCount, setVisibleCount] = useState(20)

  // === ANIMATION: Rank Shuffle (FLIP) ===
  const prevSortOrderRef = useRef<Map<string, number>>(new Map())
  const [shuffleOffsets, setShuffleOffsets] = useState<Map<string, number>>(new Map())
  const [isShuffling, setIsShuffling] = useState(false)
  const ROW_HEIGHT = 52

  useEffect(() => {
    const prevOrder = prevSortOrderRef.current
    // Update stored order
    const newOrder = new Map<string, number>()
    sorted.forEach((e, i) => newOrder.set(e.entry_id, i))

    if (prevOrder.size > 0) {
      const offsets = new Map<string, number>()
      let hasChanges = false
      sorted.forEach((entry, newIndex) => {
        const oldIndex = prevOrder.get(entry.entry_id)
        if (oldIndex !== undefined && oldIndex !== newIndex) {
          offsets.set(entry.entry_id, (oldIndex - newIndex) * ROW_HEIGHT)
          hasChanges = true
        }
      })

      if (hasChanges) {
        setIsShuffling(false)
        setShuffleOffsets(offsets)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setIsShuffling(true)
            setShuffleOffsets(new Map())
            // Clear shuffling state after animation completes
            setTimeout(() => setIsShuffling(false), 1200)
          })
        })
      }
    }

    prevSortOrderRef.current = newOrder
  }, [sorted])

  // === ANIMATION: Points Counter Roll-Up ===
  const prevPointsRef = useRef<Map<string, number>>(new Map())
  const [animatingPoints, setAnimatingPoints] = useState<Map<string, { from: number; to: number; current: number }>>(new Map())
  const animFrameRef = useRef<number>(0)

  useEffect(() => {
    const prev = prevPointsRef.current
    const newAnimations = new Map<string, { from: number; to: number; current: number }>()
    let hasNew = false

    for (const entry of sorted) {
      const newPts = getPlayerScore(entry.entry_id).total_points
      const oldPts = prev.get(entry.entry_id)
      if (oldPts !== undefined && oldPts !== newPts) {
        newAnimations.set(entry.entry_id, { from: oldPts, to: newPts, current: oldPts })
        hasNew = true
      }
      prev.set(entry.entry_id, newPts)
    }

    if (hasNew) {
      const startTime = performance.now()
      const duration = 1800 // ms

      const animate = (now: number) => {
        const elapsed = now - startTime
        const progress = Math.min(elapsed / duration, 1)
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3)

        const updated = new Map<string, { from: number; to: number; current: number }>()
        for (const [id, anim] of newAnimations) {
          const current = Math.round(anim.from + (anim.to - anim.from) * eased)
          updated.set(id, { ...anim, current })
        }
        setAnimatingPoints(updated)

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animate)
        } else {
          setAnimatingPoints(new Map())
        }
      }

      animFrameRef.current = requestAnimationFrame(animate)
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [sorted])

  // Find current user rank
  const currentUserRank = useMemo(() => {
    const idx = sorted.findIndex(e => e.users?.user_id === currentUserId)
    return idx >= 0 ? idx + 1 : null
  }, [sorted, currentUserId])

  // Matchday info
  const matchdayInfo = useMemo(() => {
    const completed = matches.filter(m => m.is_completed).sort((a, b) => b.match_number - a.match_number)
    const upcoming = matches.filter(m => !m.is_completed && m.status !== 'completed').sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())
    const lastMatchday = completed[0]?.match_number ?? null
    const nextDate = upcoming[0]?.match_date ?? null
    return { lastMatchday, nextDate, completedCount: completed.length, totalCount: matches.length }
  }, [matches])

  // =============================================
  // TAILWIND CLASS HELPERS
  // =============================================

  function getLevelPillClasses(level: number): string {
    if (level >= 10) return 'bg-gradient-to-r from-accent-500 to-warning-500 text-white'
    if (level >= 8) return 'bg-accent-100 text-accent-700 dark:bg-accent-500/15 dark:text-accent-500'
    if (level >= 6) return 'bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-500'
    if (level >= 4) return 'bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-400'
    return 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'
  }

  function getFormDotClass(type: string): string {
    switch (type) {
      case 'exact': return 'bg-accent-500'
      case 'winner_gd': return 'bg-success-500'
      case 'winner': return 'bg-primary-500'
      case 'miss': return 'bg-danger-400'
      default: return 'bg-neutral-300 dark:bg-neutral-600'
    }
  }

  function getAwardBadgeClasses(type: string): string {
    switch (type) {
      case 'mvp': return 'bg-accent-100 text-accent-700 dark:bg-accent-500/15 dark:text-accent-500'
      case 'contrarian': return 'bg-[#f3e8ff] text-[#7c3aed] dark:bg-[#7c3aed]/15 dark:text-[#a78bfa]'
      case 'crowd': return 'bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-400'
      case 'hot': return 'bg-danger-100 text-danger-600 dark:bg-danger-500/15 dark:text-danger-400'
      case 'cold': return 'bg-primary-100 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400'
      default: return 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'
    }
  }

  function getRankClasses(rank: number): string {
    if (rank === 1) return 'text-accent-500'
    if (rank === 2) return 'text-neutral-400'
    if (rank === 3) return 'text-[#CD7F32]'
    if (rank <= 10) return 'text-neutral-900 dark:text-white'
    return 'text-neutral-400 dark:text-neutral-500'
  }

  function getMedalRingClasses(rank: number): string {
    if (rank === 1) return 'border-accent-500'
    if (rank === 2) return 'border-neutral-400'
    if (rank === 3) return 'border-[#CD7F32]'
    return 'border-neutral-300 dark:border-neutral-600'
  }

  // Display name helper
  const getDisplayName = (entry: LeaderboardEntry) => {
    if (isMultiEntry) return entry.entry_name || `Entry ${entry.entry_number}`
    return entry.users?.full_name || entry.users?.username || 'Unknown'
  }

  const getUsername = (entry: LeaderboardEntry) => {
    return entry.users?.username || ''
  }

  const getInitials = (entry: LeaderboardEntry) => {
    const name = getDisplayName(entry)
    return name.charAt(0).toUpperCase()
  }

  // Rank delta helper — uses server-computed current_rank (which handles ties)
  // rather than display position (which is sequential)
  const getRankDelta = (entry: LeaderboardEntry, _displayRank: number) => {
    const prev = entry.previous_rank
    const curr = entry.current_rank
    if (prev === null || prev === undefined || curr === null || curr === undefined) return null
    return prev - curr // positive = moved up, negative = moved down
  }

  // =============================================
  // SUB-COMPONENTS
  // =============================================

  function getMedalEmoji(rank: number): string {
    if (rank === 1) return '🏆'
    if (rank === 2) return '🥈'
    return '🥉'
  }

  // =============================================
  // RENDER
  // =============================================

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl p-8 text-center bg-surface border border-border-default">
        <p className="text-neutral-500 dark:text-neutral-400">No members in this pool yet.</p>
      </div>
    )
  }

  // Entries after podium (rank 4+)
  const podiumCount = Math.min(3, sorted.length)
  const afterPodium = sorted.slice(podiumCount)
  const visibleEntries = afterPodium.slice(0, visibleCount)
  const hasMore = visibleCount < afterPodium.length

  return (
    <div className="max-w-[480px] sm:max-w-none mx-auto px-1 sm:px-0 space-y-3 sm:space-y-4">
      <style>{`
        @keyframes dotReveal {
          0% { transform: scale(0); opacity: 0; }
          40% { transform: scale(1.6); opacity: 1; }
          60% { transform: scale(0.85); }
          80% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pointsPulse {
          0% { transform: scale(1); }
          25% { transform: scale(1.15); filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.6)); }
          50% { transform: scale(1.05); }
          75% { transform: scale(1.1); filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.3)); }
          100% { transform: scale(1); filter: none; }
        }
        @keyframes shuffleHighlight {
          0% { background-color: rgba(59, 130, 246, 0.15); }
          100% { background-color: transparent; }
        }
      `}</style>
      {/* Matchday MVP Banner */}
      {matchdayMVP && (
        <div
          className="bg-accent-50 dark:bg-accent-500/10 border border-accent-500/20 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2"
          style={{ animation: 'fadeUp 0.3s ease 0.05s both' }}
        >
          <span className="text-base">⭐</span>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-semibold text-accent-700 dark:text-accent-500">Matchday MVP</span>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400"> — </span>
            <span className="text-[11px] font-bold text-neutral-900 dark:text-white">{matchdayMVP.entryName}</span>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {' '}scored {matchdayMVP.matchPoints} pts on Match {matchdayMVP.matchNumber}
            </span>
          </div>
        </div>
      )}

      {/* Podium */}
      {sorted.length >= 1 && (() => {
        const top3 = sorted.slice(0, Math.min(3, sorted.length))
        const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3.length === 2 ? [top3[1], top3[0]] : [top3[0]]
        return (
          <div
            className="py-2 sm:py-4"
            style={{ animation: 'fadeUp 0.3s ease 0.1s both' }}
          >
            <div className="flex items-end justify-center gap-1 sm:gap-4">
              {podiumOrder.map((entry) => {
                const actualRank = sorted.indexOf(entry) + 1
                const stats = entryStatsMap.get(entry.entry_id)
                const isFirst = actualRank === 1
                const delta = getRankDelta(entry, actualRank)
                const ps = getPlayerScore(entry.entry_id)
                const gradientClass = actualRank === 1
                  ? 'from-accent-100 via-accent-50/60 to-accent-50/20 dark:from-accent-500/20 dark:via-accent-500/8 dark:to-accent-500/[0.03] border-t-2 border-t-accent-500/40'
                  : actualRank === 2
                  ? 'from-neutral-200 via-neutral-100/60 to-neutral-100/20 dark:from-neutral-500/20 dark:via-neutral-500/8 dark:to-neutral-500/[0.03] border-t-2 border-t-neutral-400/40'
                  : 'from-[#F4D0A0]/60 via-[#CD7F32]/15 to-[#CD7F32]/[0.06] dark:from-[#CD7F32]/20 dark:via-[#CD7F32]/8 dark:to-[#CD7F32]/[0.03] border-t-2 border-t-[#CD7F32]/40'
                const pedestalClass = actualRank === 1
                  ? 'h-[130px] sm:h-[180px]'
                  : actualRank === 2
                  ? 'h-[105px] sm:h-[145px]'
                  : 'h-[85px] sm:h-[120px]'

                return (
                  <div
                    key={entry.entry_id}
                    className="flex flex-col items-center cursor-pointer flex-1 max-w-[130px] sm:max-w-[180px]"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <div className="flex flex-col items-center mb-1 sm:mb-2">
                      <div className="relative mb-1 sm:mb-2">
                        <div
                          className={`${isFirst ? 'w-14 h-14 sm:w-20 sm:h-20' : 'w-11 h-11 sm:w-16 sm:h-16'} rounded-full flex items-center justify-center border-2 ${getMedalRingClasses(actualRank)} bg-surface`}
                          style={isFirst ? { animation: 'crownFloat 2s ease-in-out infinite' } : undefined}
                        >
                          <span className={`${isFirst ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-2xl'}`}>{getMedalEmoji(actualRank)}</span>
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-black text-white ${
                          actualRank === 1 ? 'bg-accent-500' : actualRank === 2 ? 'bg-neutral-400' : 'bg-[#CD7F32]'
                        }`}>
                          {actualRank}
                        </div>
                        {delta !== null && delta !== 0 && (
                          <div className={`absolute -bottom-1 -left-1 px-1 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold ${
                            delta > 0 ? 'bg-success-500 text-white' : 'bg-danger-500 text-white'
                          }`}>
                            {delta > 0 ? '▲' : '▼'}{Math.abs(delta)}
                          </div>
                        )}
                      </div>

                      <div className="text-[11px] sm:text-sm font-bold text-center truncate w-full text-neutral-900 dark:text-white">
                        {getDisplayName(entry)}
                      </div>
                      <div className="text-[10px] sm:text-xs text-neutral-400 dark:text-neutral-500 text-center truncate w-full">
                        @{getUsername(entry)}
                      </div>
                      <div className={`mt-1 text-[8px] sm:text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${getLevelPillClasses(stats?.level ?? 1)}`}>
                        {stats?.levelName ?? 'Rookie'}
                      </div>

                      {!isBracketPicker && stats && stats.last5.length > 0 && (
                        <div className="flex items-center gap-[3px] sm:gap-1 mt-1.5">
                          {stats.last5.map((type, di) => (
                            <div
                              key={di}
                              className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${getFormDotClass(type)}`}
                              style={{ animation: 'dotReveal 0.5s ease both', animationDelay: `${0.15 + di * 0.12}s` }}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div
                      className={`w-full rounded-t-xl bg-gradient-to-b ${gradientClass} flex flex-col items-center justify-start pt-3 sm:pt-4 ${pedestalClass}`}
                    >
                      <div
                        className="text-xl sm:text-2xl font-black text-primary-500"
                        style={animatingPoints.has(entry.entry_id) ? { animation: 'pointsPulse 1.8s ease-in-out' } : undefined}
                      >
                        {formatNumber(animatingPoints.get(entry.entry_id)?.current ?? ps.total_points)}
                      </div>
                      <div className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        {formatNumber(ps.match_points)} + {formatNumber(ps.bonus_points)} bonus
                      </div>
                      <div className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400">
                        {isBracketPicker ? (() => {
                          const bpStats = bpStatsMap.get(entry.entry_id)
                          return bpStats && bpStats.total > 0
                            ? `${bpStats.correct}/${bpStats.total} correct · ${bpStats.accuracy.toFixed(0)}%`
                            : 'No picks resolved'
                        })() : `${stats?.exactCount ?? 0} exact · ${stats ? `${stats.hitRate.toFixed(0)}%` : '0%'} rate`}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Legend */}
      {!isBracketPicker && (
        <div
          className="space-y-1.5"
          style={{ animation: 'fadeUp 0.3s ease 0.15s both' }}
        >
          <div className="flex flex-wrap items-center justify-center gap-x-2.5 sm:gap-x-4 gap-y-1">
            <span className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400">🔥 <span className="text-danger-500 font-medium">Hot Streak</span></span>
            <span className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400">❄️ <span className="text-primary-500 font-medium">Cold Streak</span></span>
            <span className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400">🎲 <span className="text-[#7c3aed] dark:text-[#a78bfa] font-medium">Contrarian King</span></span>
            <span className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400">👥 <span className="text-primary-500 font-medium">Crowd Follower</span></span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-1">
            <div className="flex items-center gap-1">
              <div className="w-[7px] h-[7px] sm:w-2 sm:h-2 rounded-full bg-success-500" />
              <span className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400">Correct</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-[7px] h-[7px] sm:w-2 sm:h-2 rounded-full bg-accent-500" />
              <span className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400">Exact</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-[7px] h-[7px] sm:w-2 sm:h-2 rounded-full bg-danger-400" />
              <span className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400">Miss</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-[7px] h-[7px] sm:w-2 sm:h-2 rounded-full bg-neutral-300 dark:bg-neutral-600" />
              <span className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400">No Pick</span>
            </div>
          </div>
        </div>
      )}

      {/* Tap hint */}
      <p
        className="text-center text-[11px] sm:text-xs text-neutral-400 dark:text-neutral-500"
        style={{ animation: 'fadeUp 0.3s ease 0.18s both' }}
      >
        <span className="sm:hidden">Tap</span><span className="hidden sm:inline">Click</span> a player to see their full breakdown
      </p>

      {/* Desktop table header */}
      <div className={`hidden sm:grid ${isBracketPicker ? 'grid-cols-[3.5rem_1fr_10rem_8rem]' : 'grid-cols-[3.5rem_1fr_8rem_10rem_8rem]'} gap-2 px-4 py-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border-b border-border-default`}>
        <div>Rank</div>
        <div>Player</div>
        {!isBracketPicker && <div className="text-center">Form</div>}
        <div className="text-center">Awards</div>
        <div className="text-right">Stats</div>
      </div>

      {/* Desktop leaderboard rows */}
      <div className="hidden sm:block rounded-xl border border-border-default overflow-hidden bg-surface">
        {visibleEntries.map((entry, i) => {
          const rank = sorted.indexOf(entry) + 1
          const ps = getPlayerScore(entry.entry_id)
          const stats = entryStatsMap.get(entry.entry_id)
          const isCurrentUser = entry.users?.user_id === currentUserId
          const delta = getRankDelta(entry, rank)
          const entryAwards = awardsByEntry.get(entry.entry_id) || []
          return (
            <div
              key={entry.entry_id}
              onClick={() => setSelectedEntry(entry)}
              className={`grid ${isBracketPicker ? 'grid-cols-[3.5rem_1fr_10rem_8rem]' : 'grid-cols-[3.5rem_1fr_8rem_10rem_8rem]'} gap-2 items-center px-4 py-3 cursor-pointer border-b border-border-default last:border-b-0 transition-colors ${
                isCurrentUser
                  ? 'bg-primary-50 dark:bg-primary-500/[0.08] border-l-2 border-l-primary-500'
                  : 'hover:bg-surface-secondary'
              }`}
              style={{
                transform: shuffleOffsets.has(entry.entry_id)
                  ? `translateY(${shuffleOffsets.get(entry.entry_id)}px)`
                  : undefined,
                transition: isShuffling ? 'transform 1s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
                animation: isShuffling && !shuffleOffsets.has(entry.entry_id) && prevSortOrderRef.current.get(entry.entry_id) !== sorted.indexOf(entry)
                  ? 'shuffleHighlight 1.2s ease-out' : undefined,
              }}
            >
              {/* Rank */}
              <div className="flex flex-col items-center">
                <span className="text-sm font-black text-neutral-700 dark:text-neutral-300">#{rank}</span>
                {delta !== null && delta !== 0 && (
                  <span className={`text-[10px] font-bold ${delta > 0 ? 'text-success-500' : 'text-danger-500'}`}>
                    {delta > 0 ? '▲' : '▼'}{Math.abs(delta)}
                  </span>
                )}
              </div>

              {/* Player */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-neutral-900 dark:text-white truncate">
                    {getDisplayName(entry)}
                  </span>
                  {isCurrentUser && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400">
                      YOU
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">@{getUsername(entry)}</span>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${getLevelPillClasses(stats?.level ?? 1)}`}>
                    Lv.{stats?.level ?? 1} {stats?.levelName ?? 'Rookie'}
                  </span>
                </div>
              </div>

              {/* Form dots */}
              {!isBracketPicker && (
                <div className="flex items-center gap-1 justify-center">
                  {stats && stats.last5.length > 0 ? (
                    <>
                      {stats.last5.map((type, di) => (
                        <div
                          key={di}
                          className={`w-2.5 h-2.5 rounded-full ${getFormDotClass(type)}`}
                          style={{ animation: 'dotReveal 0.5s ease both', animationDelay: `${0.15 + di * 0.12}s` }}
                        />
                      ))}
                      {stats.currentStreak.type !== 'none' && stats.currentStreak.length >= 3 && (
                        <span className="ml-1 text-xs">
                          {stats.currentStreak.type === 'hot' ? '🔥' : '❄️'}
                          <span className={`font-bold ${stats.currentStreak.type === 'hot' ? 'text-danger-500' : 'text-primary-400'}`}>
                            {stats.currentStreak.length}
                          </span>
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-neutral-300 dark:text-neutral-600">—</span>
                  )}
                </div>
              )}

              {/* Awards */}
              <div className="flex items-center gap-1 flex-wrap justify-center">
                {entryAwards.length > 0 ? entryAwards.map((award, ai) => (
                  <span
                    key={ai}
                    className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${getAwardBadgeClasses(award.type)}`}
                  >
                    {award.emoji} {award.label}
                  </span>
                )) : (
                  <span className="text-neutral-300 dark:text-neutral-600">—</span>
                )}
              </div>

              {/* Stats */}
              <div className="text-right">
                <div
                  className="text-base font-black text-primary-500"
                  style={animatingPoints.has(entry.entry_id) ? { animation: 'pointsPulse 1.8s ease-in-out' } : undefined}
                >
                  {formatNumber(animatingPoints.get(entry.entry_id)?.current ?? ps.total_points)}
                </div>
                <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                  {formatNumber(ps.match_points)} + {formatNumber(ps.bonus_points)} bonus
                </div>
                {!isBracketPicker && stats && (
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                    {stats.exactCount} exact · {stats.hitRate.toFixed(0)}%
                  </div>
                )}
                {isBracketPicker && (() => {
                  const bpStats = bpStatsMap.get(entry.entry_id)
                  return bpStats && bpStats.total > 0 ? (
                    <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                      {bpStats.correct}/{bpStats.total} correct · {bpStats.accuracy.toFixed(0)}%
                    </div>
                  ) : null
                })()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Mobile leaderboard rows (rank 4+) */}
      <div className="sm:hidden space-y-2">
        {visibleEntries.map((entry, i) => {
          const rank = sorted.indexOf(entry) + 1
          const ps = getPlayerScore(entry.entry_id)
          const stats = entryStatsMap.get(entry.entry_id)
          const isCurrentUser = entry.users?.user_id === currentUserId
          const delta = getRankDelta(entry, rank)
          const entryAwards = awardsByEntry.get(entry.entry_id) || []
          const delay = Math.min(0.2 + i * 0.03, 0.8)
          return (
            <div
              key={entry.entry_id}
              onClick={() => setSelectedEntry(entry)}
              className={`rounded-xl border p-3 cursor-pointer transition-colors ${
                isCurrentUser
                  ? 'bg-primary-50 dark:bg-primary-500/[0.08] border-l-2 border-l-primary-500 border-border-default'
                  : 'bg-surface border-border-default hover:bg-surface-secondary'
              }`}
              style={{
                animation: `fadeUp 0.3s ease ${delay}s both`,
                transform: shuffleOffsets.has(entry.entry_id)
                  ? `translateY(${shuffleOffsets.get(entry.entry_id)}px)`
                  : undefined,
                transition: isShuffling ? 'transform 1s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
              }}
            >
              <div className="flex items-start gap-2.5">
                {/* Rank column */}
                <div className="flex-shrink-0 pt-0.5 flex flex-col items-center">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-sm font-black text-neutral-700 dark:text-neutral-300">
                    #{rank}
                  </span>
                  <div className="mt-0.5">
                    {delta !== null && delta !== 0 && (
                      <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${delta > 0 ? 'text-success-500' : 'text-danger-500'}`}>
                        {delta > 0 ? '▲' : '▼'}{Math.abs(delta)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Center info */}
                <div className="flex-1 min-w-0">
                  {/* Name row */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-neutral-900 dark:text-white truncate">
                      {getDisplayName(entry)}
                    </span>
                    {isCurrentUser && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400">
                        YOU
                      </span>
                    )}
                  </div>

                  {/* Username + Level pill */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate">@{getUsername(entry)}</span>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${getLevelPillClasses(stats?.level ?? 1)}`}>
                      Lv.{stats?.level ?? 1} {stats?.levelName ?? 'Rookie'}
                    </span>
                  </div>

                  {/* Awards */}
                  {entryAwards.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {entryAwards.map((award, ai) => (
                        <span
                          key={ai}
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${getAwardBadgeClasses(award.type)}`}
                        >
                          {award.emoji} {award.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Form dots */}
                  {!isBracketPicker && stats && stats.last5.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="text-[9px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">Form</span>
                      <div className="flex items-center gap-[3px]">
                        {stats.last5.map((type, di) => (
                          <div
                            key={di}
                            className={`w-2 h-2 rounded-full ${getFormDotClass(type)}`}
                            style={{ animation: 'dotReveal 0.5s ease both', animationDelay: `${0.15 + di * 0.12}s` }}
                          />
                        ))}
                      </div>
                      {stats.currentStreak.type !== 'none' && stats.currentStreak.length >= 3 && (
                        <span className="ml-0.5 text-[10px]">
                          {stats.currentStreak.type === 'hot' ? '🔥' : '❄️'}
                          <span className={`font-bold ${stats.currentStreak.type === 'hot' ? 'text-danger-500' : 'text-primary-400'}`}>
                            {stats.currentStreak.length}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Right stats */}
                <div className="flex-shrink-0 text-right pt-0.5">
                  <div
                    className="text-base font-black text-primary-500"
                    style={animatingPoints.has(entry.entry_id) ? { animation: 'pointsPulse 1.8s ease-in-out' } : undefined}
                  >
                    {formatNumber(animatingPoints.get(entry.entry_id)?.current ?? ps.total_points)}
                  </div>
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                    {formatNumber(ps.match_points)} + {formatNumber(ps.bonus_points)} bonus
                  </div>
                  {!isBracketPicker && stats && (
                    <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                      {stats.exactCount} exact · {stats.hitRate.toFixed(0)}%
                    </div>
                  )}
                  {isBracketPicker && (() => {
                    const bpStats = bpStatsMap.get(entry.entry_id)
                    return bpStats && bpStats.total > 0 ? (
                      <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                        {bpStats.correct}/{bpStats.total} correct · {bpStats.accuracy.toFixed(0)}%
                      </div>
                    ) : null
                  })()}
                </div>
              </div>

              {/* Current user insight line */}
              {isCurrentUser && userInsight && (
                <div className="mt-2 pt-2 border-t border-border-default text-[10px] text-neutral-500 dark:text-neutral-400">
                  {userInsight.ptsBehind !== null && userInsight.personAboveName && (
                    <span>{userInsight.ptsBehind} pts behind {userInsight.personAboveName}</span>
                  )}
                  {userInsight.ptsBehind !== null && userInsight.ptsAhead !== null && (
                    <span className="mx-1.5 text-neutral-300 dark:text-neutral-600">·</span>
                  )}
                  {userInsight.ptsAhead !== null && userInsight.personBelowName && (
                    <span>{userInsight.personBelowName} is {userInsight.ptsAhead} pts behind you</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Load more */}
      {hasMore && (
        <button
          onClick={() => setVisibleCount(v => v + 20)}
          className="w-full sm:max-w-xs sm:mx-auto py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold transition-colors bg-surface-secondary text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
        >
          Show More
        </button>
      )}

      {/* Pool Superlatives */}
      {poolSuperlatives.length > 0 && (
        <div
          className="bg-surface rounded-xl border border-border-default p-4"
          style={{ animation: 'fadeUp 0.3s ease 0.3s both' }}
        >
          <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white mb-3">Pool Superlatives</h3>
          <div className="space-y-2 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-3 sm:space-y-0">
            {poolSuperlatives.map((s) => (
              <div
                key={s.type}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${s.bgClass}`}
              >
                <span className="text-lg flex-shrink-0">{s.emoji}</span>
                <div className="min-w-0">
                  <div className={`text-[11px] sm:text-xs font-bold ${s.titleColorClass}`}>{s.title}</div>
                  <div className="text-[11px] sm:text-xs text-neutral-700 dark:text-neutral-300">
                    {s.name}
                    <span className="text-neutral-400 dark:text-neutral-500"> · {s.detail}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matchday indicator */}
      <div
        className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-[11px] sm:text-xs bg-surface-secondary border border-border-default"
        style={{ animation: 'fadeUp 0.3s ease 0.35s both' }}
      >
        <div className="text-neutral-400 dark:text-neutral-500">
          {matchdayInfo.lastMatchday ? `Last: Match ${matchdayInfo.lastMatchday}` : 'No matches played'}
          <span className="mx-2 text-neutral-300 dark:text-neutral-600">·</span>
          {matchdayInfo.completedCount}/{matchdayInfo.totalCount} played
        </div>
        {matchdayInfo.nextDate && (
          <div className="text-neutral-500 dark:text-neutral-400">
            Next: {new Date(matchdayInfo.nextDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>

      {/* Points Breakdown Modal */}
      {selectedEntry && (
        <PointsBreakdownModal
          entry={selectedEntry}
          playerScore={getPlayerScore(selectedEntry.entry_id)}
          bonusScores={getBonusForEntry(selectedEntry.entry_id)}
          onClose={() => setSelectedEntry(null)}
          isMultiEntry={isMultiEntry}
          poolSettings={poolSettings}
          matches={matches}
          entryMatchScores={matchScoresByEntry.get(selectedEntry.entry_id) || []}
          predictionMode={predictionMode}
        />
      )}
    </div>
  )
}
