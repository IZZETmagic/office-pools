'use client'

import { useState, useMemo } from 'react'
import { PointsBreakdownModal } from './PointsBreakdownModal'
import { calculateAllBonusPoints, type MatchWithResult } from '@/lib/bonusCalculation'
import { calculatePoints, checkKnockoutTeamsMatch, type PoolSettings } from './results/points'
import { resolveFullBracket } from '@/lib/bracketResolver'
import { calculateBracketPickerPoints, type MatchWithResult as BPMatchWithResult } from '@/lib/bracketPickerScoring'
import { calculateGroupStandings, rankThirdPlaceTeams, GROUP_LETTERS } from '@/lib/tournament'
import type { MemberData, LeaderboardEntry, PlayerScoreData, BonusScoreData, MatchData, TeamData, PredictionData, BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick } from './types'
import type { PredictionMap, MatchConductData, Team, GroupStanding, ScoreEntry } from '@/lib/tournament'
import { formatNumber } from '@/lib/format'
import { computePredictionResults, computeStreaks, computeCrowdPredictions } from './analytics/analyticsHelpers'
// Types used implicitly through function returns
import { computeFullXPBreakdown, computeLevel } from './analytics/xpSystem'

type LeaderboardTabProps = {
  members: MemberData[]
  playerScores: PlayerScoreData[]
  bonusScores: BonusScoreData[]
  // Data for client-side bonus computation
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
// HELPERS — convert between MatchData and lib types
// =============================================

function toMatchWithResult(m: MatchData): MatchWithResult {
  return {
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
    is_completed: m.is_completed,
    home_score_ft: m.home_score_ft,
    away_score_ft: m.away_score_ft,
    home_score_pso: m.home_score_pso,
    away_score_pso: m.away_score_pso,
    winner_team_id: m.winner_team_id,
    tournament_id: m.tournament_id,
  }
}

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

function buildPredictionMap(predictions: PredictionData[]): PredictionMap {
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

// =============================================
// COMPONENT
// =============================================

export function LeaderboardTab({
  members,
  playerScores,
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

  // Build lookup map for player scores (by entry_id)
  const scoreMap = new Map<string, PlayerScoreData>()
  for (const ps of playerScores) {
    scoreMap.set(ps.entry_id, ps)
  }

  // Pre-compute shared data for bonus calculation
  const matchesWithResult = useMemo(() => matches.map(toMatchWithResult), [matches])
  const tournamentTeams = useMemo(() => toTournamentTeams(teams), [teams])

  // Compute bonus scores for ALL entries client-side
  const computedBonusMap = useMemo(() => {
    const map = new Map<string, BonusScoreData[]>()

    // Group predictions by entry_id
    const predsByEntry = new Map<string, PredictionData[]>()
    for (const p of allPredictions) {
      const existing = predsByEntry.get(p.entry_id) || []
      existing.push(p)
      predsByEntry.set(p.entry_id, existing)
    }

    // Calculate bonus for each entry with predictions
    for (const [entryId, preds] of predsByEntry) {
      const predictionMap = buildPredictionMap(preds)
      const bonusEntries = calculateAllBonusPoints({
        memberId: entryId,
        memberPredictions: predictionMap,
        matches: matchesWithResult,
        teams: tournamentTeams,
        conductData,
        settings: poolSettings,
        tournamentAwards: null,
        predictionMode,
      })

      // Convert BonusScoreEntry[] to BonusScoreData[]
      const bonusData: BonusScoreData[] = bonusEntries.map((e, i) => ({
        bonus_score_id: `computed-${entryId}-${i}`,
        entry_id: e.entry_id,
        bonus_type: e.bonus_type,
        bonus_category: e.bonus_category,
        related_group_letter: e.related_group_letter,
        related_match_id: e.related_match_id,
        points_earned: e.points_earned,
        description: e.description,
      }))

      map.set(entryId, bonusData)
    }

    return map
  }, [allPredictions, matchesWithResult, tournamentTeams, conductData, poolSettings])

  // Compute match points for each entry client-side too
  const computedMatchPointsMap = useMemo(() => {
    const map = new Map<string, number>()

    // Group predictions by entry_id
    const predsByEntry = new Map<string, PredictionData[]>()
    for (const p of allPredictions) {
      const existing = predsByEntry.get(p.entry_id) || []
      existing.push(p)
      predsByEntry.set(p.entry_id, existing)
    }

    for (const [entryId, preds] of predsByEntry) {
      const predMap = new Map(preds.map(p => [p.match_id, p]))
      let totalMatchPts = 0

      // Resolve bracket for this entry to check knockout team matches
      const predictionMap = buildPredictionMap(preds)
      const bracket = resolveFullBracket({
        matches: matchesWithResult,
        predictionMap,
        teams: tournamentTeams,
        conductData,
      })

      for (const m of matches) {
        if ((m.is_completed || m.status === 'live') && m.home_score_ft !== null && m.away_score_ft !== null) {
          const pred = predMap.get(m.match_id)
          if (!pred) continue

          // For knockout: check if predicted teams match actual teams
          const resolved = bracket.knockoutTeamMap.get(m.match_number)
          const teamsMatch = checkKnockoutTeamsMatch(
            m.stage,
            m.home_team_id,
            m.away_team_id,
            resolved?.home?.team_id ?? null,
            resolved?.away?.team_id ?? null,
          )

          const hasPso = m.home_score_pso !== null && m.away_score_pso !== null
          const result = calculatePoints(
            pred.predicted_home_score,
            pred.predicted_away_score,
            m.home_score_ft,
            m.away_score_ft,
            m.stage,
            poolSettings,
            hasPso
              ? {
                  actualHomePso: m.home_score_pso!,
                  actualAwayPso: m.away_score_pso!,
                  predictedHomePso: pred.predicted_home_pso,
                  predictedAwayPso: pred.predicted_away_pso,
                }
              : undefined,
            teamsMatch,
          )
          totalMatchPts += result.points
        }
      }

      map.set(entryId, totalMatchPts)
    }

    return map
  }, [allPredictions, matches, poolSettings])

  // Compute bracket picker scores client-side (mirrors computedBonusMap for full_tournament)
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
          bonus_score_id: `bp-computed-${entryId}-${idx++}`,
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
          bonus_score_id: `bp-computed-${entryId}-${idx++}`,
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
          bonus_score_id: `bp-computed-${entryId}-${idx++}`,
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
          bonus_score_id: `bp-computed-${entryId}-${idx++}`,
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
          bonus_score_id: `bp-computed-${entryId}-${idx++}`,
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
          bonus_score_id: `bp-computed-${entryId}-${idx++}`,
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

  // Get bonus data for an entry — prefer computed, fall back to DB
  const getBonusForEntry = (entryId: string): BonusScoreData[] => {
    // For bracket picker, prefer computed BP scores
    if (predictionMode === 'bracket_picker') {
      return computedBPBonusMap.get(entryId) || bonusScores.filter(bs => bs.entry_id === entryId)
    }
    return computedBonusMap.get(entryId) || bonusScores.filter(bs => bs.entry_id === entryId)
  }

  // Check if any entry has computed bonus points
  const hasAnyBonusPoints = useMemo(() => {
    for (const entries of computedBonusMap.values()) {
      if (entries.length > 0) return true
    }
    // For bracket picker, check computed BP scores
    for (const entries of computedBPBonusMap.values()) {
      if (entries.length > 0) return true
    }
    if (bonusScores.length > 0) return true
    return playerScores.some(ps => ps.bonus_points > 0)
  }, [computedBonusMap, computedBPBonusMap, playerScores, bonusScores])

  // Build computed player score for modal
  const getPlayerScore = (entryId: string): PlayerScoreData => {
    const entry = leaderboardEntries.find(e => e.entry_id === entryId)
    const adjustment = entry?.point_adjustment ?? 0

    // For bracket picker pools, use client-side computed BP scores
    // Base "picks" = bp_group, bp_third_place, bp_knockout
    // True bonus = bp_bonus (champion, penalty, all-correct)
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

      // Fall back to DB data if no BP data available
      const dbBonusEntries = bonusScores.filter(bs => bs.entry_id === entryId)
      const baseCats = new Set(['bp_group', 'bp_third_place', 'bp_knockout'])
      const dbPicksPts = dbBonusEntries.filter(e => baseCats.has(e.bonus_category)).reduce((sum, e) => sum + e.points_earned, 0)
      const dbBonusPts = dbBonusEntries.filter(e => !baseCats.has(e.bonus_category)).reduce((sum, e) => sum + e.points_earned, 0)

      return {
        entry_id: entryId,
        match_points: dbPicksPts,
        bonus_points: dbBonusPts,
        total_points: dbPicksPts + dbBonusPts + adjustment,
      }
    }

    const computedMatchPts = computedMatchPointsMap.get(entryId)
    const computedBonus = computedBonusMap.get(entryId)
    const computedBonusPts = computedBonus ? computedBonus.reduce((sum, e) => sum + e.points_earned, 0) : 0

    if (computedMatchPts !== undefined) {
      return {
        entry_id: entryId,
        match_points: computedMatchPts,
        bonus_points: computedBonusPts,
        total_points: computedMatchPts + computedBonusPts + adjustment,
      }
    }

    // Fall back to DB
    const dbScore = scoreMap.get(entryId)
    if (dbScore) {
      return {
        ...dbScore,
        total_points: dbScore.total_points + adjustment,
      }
    }

    // Last resort: entry's total_points
    return {
      entry_id: entryId,
      match_points: entry?.total_points ?? 0,
      bonus_points: 0,
      total_points: (entry?.total_points ?? 0) + adjustment,
    }
  }

  // Sort entries by computed total points (descending), then by rank as tiebreaker
  const sorted = useMemo(() => {
    return [...leaderboardEntries].sort((a, b) => {
      const aScore = getPlayerScore(a.entry_id).total_points
      const bScore = getPlayerScore(b.entry_id).total_points
      if (bScore !== aScore) return bScore - aScore
      return (a.current_rank ?? 999) - (b.current_rank ?? 999)
    })
  }, [leaderboardEntries, computedMatchPointsMap, computedBonusMap, computedBPBonusMap, bonusScores, predictionMode])

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

    // Group predictions by entry
    const predsByEntry = new Map<string, PredictionData[]>()
    for (const p of allPredictions) {
      const arr = predsByEntry.get(p.entry_id) || []
      arr.push(p)
      predsByEntry.set(p.entry_id, arr)
    }

    for (const entry of sorted) {
      const entryPreds = predsByEntry.get(entry.entry_id) || []
      const mPts = computedMatchPointsMap.get(entry.entry_id) ?? 0
      const bPts = (computedBonusMap.get(entry.entry_id) ?? []).reduce((s, e) => s + e.points_earned, 0)

      if (entryPreds.length === 0) {
        map.set(entry.entry_id, {
          hitRate: 0, exactCount: 0,
          currentStreak: { type: 'none', length: 0 },
          last5: [], level: 1, levelName: 'Rookie', totalXP: 0, totalCompleted: 0,
          contrarianWins: 0, crowdAgreementPct: 0, matchPoints: mPts, bonusPoints: bPts,
        })
        continue
      }

      const predResults = computePredictionResults(matches, entryPreds, poolSettings, teams, conductData)
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
  }, [sorted, allPredictions, matches, poolSettings, teams, conductData, members, isBracketPicker, computedMatchPointsMap, computedBonusMap])

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
    const predsByEntry = new Map<string, PredictionData[]>()
    for (const p of allPredictions) {
      const arr = predsByEntry.get(p.entry_id) || []
      arr.push(p)
      predsByEntry.set(p.entry_id, arr)
    }

    let bestEntry: LeaderboardEntry | null = null
    let bestPoints = 0

    for (const entry of sorted) {
      const preds = predsByEntry.get(entry.entry_id) || []
      const pred = preds.find(p => p.match_id === lastMatch.match_id)
      if (!pred) continue

      const predResults = computePredictionResults(
        [lastMatch], [pred], poolSettings, teams, conductData
      )
      const pts = predResults.reduce((s, r) => s + r.points, 0)
      if (pts > bestPoints) {
        bestPoints = pts
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
  }, [sorted, currentUserId, computedMatchPointsMap, computedBonusMap])

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

    // Biggest Climber — largest positive rank delta
    let climberEntry: LeaderboardEntry | null = null
    let climberDelta = 0
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i]
      const currentRank = i + 1
      const prev = entry.previous_rank
      if (prev !== null && prev !== undefined) {
        const delta = prev - currentRank
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

    // Biggest Faller — largest negative rank delta
    let fallerEntry: LeaderboardEntry | null = null
    let fallerDelta = 0
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i]
      const currentRank = i + 1
      const prev = entry.previous_rank
      if (prev !== null && prev !== undefined) {
        const delta = prev - currentRank // negative means fell
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

  // Rank delta helper
  const getRankDelta = (entry: LeaderboardEntry, currentRank: number) => {
    const prev = entry.previous_rank
    if (prev === null || prev === undefined) return null
    return prev - currentRank // positive = moved up, negative = moved down
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
    <div className="max-w-[480px] mx-auto px-1 space-y-3">
      {/* Matchday MVP Banner */}
      {matchdayMVP && (
        <div
          className="bg-accent-50 dark:bg-accent-500/10 border border-accent-500/20 rounded-xl px-3 py-2.5 flex items-center gap-2"
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
      {sorted.length >= 2 && (() => {
        const top3 = sorted.slice(0, Math.min(3, sorted.length))
        const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3.length === 2 ? [top3[1], top3[0]] : [top3[0]]
        return (
          <div
            className="py-2"
            style={{ animation: 'fadeUp 0.3s ease 0.1s both' }}
          >
            <div className="flex items-end justify-center gap-1">
              {podiumOrder.map((entry) => {
                const actualRank = sorted.indexOf(entry) + 1
                const stats = entryStatsMap.get(entry.entry_id)
                const isFirst = actualRank === 1
                const delta = getRankDelta(entry, actualRank)
                const ps = getPlayerScore(entry.entry_id)
                const heightPx = actualRank === 1 ? 130 : actualRank === 2 ? 105 : 85
                const gradientClass = actualRank === 1
                  ? 'from-accent-100 via-accent-50/60 to-accent-50/20 dark:from-accent-500/20 dark:via-accent-500/8 dark:to-accent-500/[0.03] border-t-2 border-t-accent-500/40'
                  : actualRank === 2
                  ? 'from-neutral-200 via-neutral-100/60 to-neutral-100/20 dark:from-neutral-500/20 dark:via-neutral-500/8 dark:to-neutral-500/[0.03] border-t-2 border-t-neutral-400/40'
                  : 'from-[#F4D0A0]/60 via-[#CD7F32]/15 to-[#CD7F32]/[0.06] dark:from-[#CD7F32]/20 dark:via-[#CD7F32]/8 dark:to-[#CD7F32]/[0.03] border-t-2 border-t-[#CD7F32]/40'

                return (
                  <div
                    key={entry.entry_id}
                    className="flex flex-col items-center cursor-pointer flex-1 max-w-[130px]"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <div className="flex flex-col items-center mb-1">
                      <div className="relative mb-1">
                        <div
                          className={`${isFirst ? 'w-14 h-14' : 'w-11 h-11'} rounded-full flex items-center justify-center border-2 ${getMedalRingClasses(actualRank)} bg-surface`}
                          style={isFirst ? { animation: 'crownFloat 2s ease-in-out infinite' } : undefined}
                        >
                          <span className={`${isFirst ? 'text-2xl' : 'text-lg'}`}>{getMedalEmoji(actualRank)}</span>
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white ${
                          actualRank === 1 ? 'bg-accent-500' : actualRank === 2 ? 'bg-neutral-400' : 'bg-[#CD7F32]'
                        }`}>
                          {actualRank}
                        </div>
                        {delta !== null && delta !== 0 && (
                          <div className={`absolute -bottom-1 -left-1 px-1 py-0.5 rounded-full text-[8px] font-bold ${
                            delta > 0 ? 'bg-success-500 text-white' : 'bg-danger-500 text-white'
                          }`}>
                            {delta > 0 ? '▲' : '▼'}{Math.abs(delta)}
                          </div>
                        )}
                      </div>

                      <div className="text-[11px] font-bold text-center truncate w-full text-neutral-900 dark:text-white">
                        {getDisplayName(entry)}
                      </div>
                      <div className="text-[10px] text-neutral-400 dark:text-neutral-500 text-center truncate w-full">
                        @{getUsername(entry)}
                      </div>
                      <div className={`mt-1 text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${getLevelPillClasses(stats?.level ?? 1)}`}>
                        {stats?.levelName ?? 'Rookie'}
                      </div>

                      {!isBracketPicker && stats && stats.last5.length > 0 && (
                        <div className="flex items-center gap-[3px] mt-1.5">
                          {stats.last5.map((type, di) => (
                            <div key={di} className={`w-2 h-2 rounded-full ${getFormDotClass(type)}`} />
                          ))}
                        </div>
                      )}
                    </div>

                    <div
                      className={`w-full rounded-t-xl bg-gradient-to-b ${gradientClass} flex flex-col items-center justify-start pt-3`}
                      style={{ height: `${heightPx}px` }}
                    >
                      <div className="text-xl font-black text-primary-500">
                        {formatNumber(ps.total_points)}
                      </div>
                      <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
                        {formatNumber(stats?.matchPoints ?? 0)} + {formatNumber(stats?.bonusPoints ?? 0)} bonus
                      </div>
                      <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                        {stats?.exactCount ?? 0} exact · {stats ? `${stats.hitRate.toFixed(0)}%` : '0%'} rate
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
          <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">🔥 <span className="text-danger-500 font-medium">Hot Streak</span></span>
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">❄️ <span className="text-primary-500 font-medium">Cold Streak</span></span>
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">🎲 <span className="text-[#7c3aed] dark:text-[#a78bfa] font-medium">Contrarian King</span></span>
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">👥 <span className="text-primary-500 font-medium">Crowd Follower</span></span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-1">
              <div className="w-[7px] h-[7px] rounded-full bg-success-500" />
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Correct</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-[7px] h-[7px] rounded-full bg-accent-500" />
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Exact</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-[7px] h-[7px] rounded-full bg-danger-400" />
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Miss</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-[7px] h-[7px] rounded-full bg-neutral-300 dark:bg-neutral-600" />
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">No Pick</span>
            </div>
          </div>
        </div>
      )}

      {/* Tap hint */}
      <p
        className="text-center text-[11px] text-neutral-400 dark:text-neutral-500"
        style={{ animation: 'fadeUp 0.3s ease 0.18s both' }}
      >
        Tap a player to see their full breakdown
      </p>

      {/* Leaderboard rows (rank 4+) */}
      <div className="space-y-2">
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
              style={{ animation: `fadeUp 0.3s ease ${delay}s both` }}
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
                          <div key={di} className={`w-2 h-2 rounded-full ${getFormDotClass(type)}`} />
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
                  <div className="text-base font-black text-primary-500">
                    {formatNumber(ps.total_points)}
                  </div>
                  <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                    {formatNumber(stats?.matchPoints ?? 0)} + {formatNumber(stats?.bonusPoints ?? 0)} bonus
                  </div>
                  {!isBracketPicker && stats && (
                    <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                      {stats.exactCount} exact · {stats.hitRate.toFixed(0)}%
                    </div>
                  )}
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
          className="w-full py-2.5 rounded-lg text-xs font-semibold transition-colors bg-surface-secondary text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
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
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-3">Pool Superlatives</h3>
          <div className="space-y-2">
            {poolSuperlatives.map((s) => (
              <div
                key={s.type}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${s.bgClass}`}
              >
                <span className="text-lg flex-shrink-0">{s.emoji}</span>
                <div className="min-w-0">
                  <div className={`text-[11px] font-bold ${s.titleColorClass}`}>{s.title}</div>
                  <div className="text-[11px] text-neutral-700 dark:text-neutral-300">
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
        className="flex items-center justify-between px-3 py-2 rounded-lg text-[11px] bg-surface-secondary border border-border-default"
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
          entryPredictions={allPredictions.filter(p => p.entry_id === selectedEntry.entry_id)}
          teams={teams}
          conductData={conductData}
          predictionMode={predictionMode}
        />
      )}
    </div>
  )
}
