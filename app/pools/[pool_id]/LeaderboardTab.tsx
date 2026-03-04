'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { PointsBreakdownModal } from './PointsBreakdownModal'
import { calculateAllBonusPoints, type MatchWithResult } from '@/lib/bonusCalculation'
import { calculatePoints, checkKnockoutTeamsMatch, type PoolSettings } from './results/points'
import { resolveFullBracket } from '@/lib/bracketResolver'
import { calculateBracketPickerPoints, type MatchWithResult as BPMatchWithResult } from '@/lib/bracketPickerScoring'
import { calculateGroupStandings, rankThirdPlaceTeams, GROUP_LETTERS } from '@/lib/tournament'
import type { MemberData, LeaderboardEntry, PlayerScoreData, BonusScoreData, MatchData, TeamData, PredictionData, BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick } from './types'
import type { PredictionMap, MatchConductData, Team, GroupStanding, ScoreEntry } from '@/lib/tournament'
import { formatNumber } from '@/lib/format'

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
  const [selectedEntry, setSelectedEntry] = useState<LeaderboardEntry | null>(null)

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
        if (d.points > 0) {
          const team = tournamentTeams.find(t => t.team_id === d.team_id)
          bonusData.push({
            bonus_score_id: `bp-computed-${entryId}-${idx++}`,
            entry_id: entryId,
            bonus_type: `bp_group_position_${d.position}`,
            bonus_category: 'bp_group',
            related_group_letter: d.group_letter,
            related_match_id: null,
            points_earned: d.points,
            description: `Correctly predicted ${team?.country_name || d.team_id} at position ${d.position} in Group ${d.group_letter}`,
          })
        }
      }

      for (const d of breakdown.thirdPlaceDetails) {
        if (d.points > 0) {
          const team = tournamentTeams.find(t => t.team_id === d.team_id)
          const label = d.predicted_qualifies ? 'qualifies' : 'eliminated'
          bonusData.push({
            bonus_score_id: `bp-computed-${entryId}-${idx++}`,
            entry_id: entryId,
            bonus_type: `bp_third_${label}`,
            bonus_category: 'bp_third_place',
            related_group_letter: d.group_letter,
            related_match_id: null,
            points_earned: d.points,
            description: `Correctly predicted ${team?.country_name || d.team_id} (Group ${d.group_letter}) ${label}`,
          })
        }
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
        if (d.points > 0) {
          const stageLabel = formatStage(d.stage)
          const team = tournamentTeams.find(t => t.team_id === d.predicted_winner)
          bonusData.push({
            bonus_score_id: `bp-computed-${entryId}-${idx++}`,
            entry_id: entryId,
            bonus_type: `bp_knockout_${d.stage}`,
            bonus_category: 'bp_knockout',
            related_group_letter: null,
            related_match_id: d.match_id,
            points_earned: d.points,
            description: `Correctly predicted ${team?.country_name || d.predicted_winner} to win Match ${d.match_number} (${stageLabel})`,
          })
        }
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

  if (sorted.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-neutral-600">No members in this pool yet.</p>
      </Card>
    )
  }

  return (
    <>
      {/* Tap hint */}
      <p className="text-xs text-neutral-400 text-center mb-2">Tap a player to see their points breakdown</p>

      {/* Mobile card view */}
      <div className="sm:hidden space-y-2">
        {sorted.map((entry, index) => {
          const rank = index + 1
          const isTopThree = rank <= 3
          const ps = getPlayerScore(entry.entry_id)
          const isCurrentUser = entry.users?.user_id === currentUserId

          return (
            <div
              key={entry.entry_id}
              onClick={() => setSelectedEntry(entry)}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                isTopThree
                  ? 'bg-warning-50 border-warning-200 active:bg-warning-100'
                  : 'bg-surface border-neutral-200 active:bg-neutral-50'
              }`}
            >
              {/* Rank */}
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center">
                {rank === 1 && <span className="text-lg">{'\u{1F947}'}</span>}
                {rank === 2 && <span className="text-lg">{'\u{1F948}'}</span>}
                {rank === 3 && <span className="text-lg">{'\u{1F949}'}</span>}
                {rank > 3 && <span className="text-sm font-bold text-neutral-700">#{rank}</span>}
              </div>

              {/* Player info */}
              <div className="flex-1 min-w-0">
                {isMultiEntry ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-neutral-900 truncate">
                        {entry.entry_name}
                      </span>
                      {isCurrentUser && (
                        <span className="text-xs text-primary-500 ml-1">(you)</span>
                      )}
                      {entry.role === 'admin' && (
                        <Badge variant="outline">Admin</Badge>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 truncate">
                      @{entry.users?.username || 'Unknown'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-neutral-900 truncate">
                        {entry.users?.full_name || entry.users?.username || 'Unknown'}
                      </span>
                      {isCurrentUser && (
                        <span className="text-xs text-primary-500 ml-1">(you)</span>
                      )}
                      {entry.role === 'admin' && (
                        <Badge variant="outline">Admin</Badge>
                      )}
                    </div>
                    {entry.users?.username && (
                      <div className="text-xs text-neutral-500 truncate">
                        @{entry.users.username}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Points */}
              <div className="flex-shrink-0 text-right">
                <div className="text-lg font-bold text-primary-600">{formatNumber(ps.total_points)}</div>
                {predictionMode === 'bracket_picker' ? (
                  <div className="text-[10px] text-neutral-500 uppercase">pts</div>
                ) : hasAnyBonusPoints && ps.bonus_points > 0 ? (
                  <div className="text-[10px] text-neutral-500">
                    {formatNumber(ps.match_points)} + {formatNumber(ps.bonus_points)} bonus
                  </div>
                ) : (
                  <div className="text-[10px] text-neutral-500 uppercase">pts</div>
                )}
              </div>

              {/* Chevron hint */}
              <div className="flex-shrink-0 text-neutral-300">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop table view */}
      <div className="hidden sm:block bg-surface rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-neutral-700 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-neutral-700 uppercase tracking-wider">
                {isMultiEntry ? 'Entry' : 'Player'}
              </th>
              {hasAnyBonusPoints && predictionMode !== 'bracket_picker' && (
                <>
                  <th className="px-3 md:px-4 py-3 text-right text-xs font-medium text-neutral-700 uppercase tracking-wider">
                    Match
                  </th>
                  <th className="px-3 md:px-4 py-3 text-right text-xs font-medium text-neutral-700 uppercase tracking-wider">
                    Bonus
                  </th>
                </>
              )}
              <th className="px-4 md:px-6 py-3 text-right text-xs font-medium text-neutral-700 uppercase tracking-wider">
                Total
              </th>
              <th className="px-4 md:px-6 py-3 text-center text-xs font-medium text-neutral-700 uppercase tracking-wider">
                Role
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {sorted.map((entry, index) => {
              const rank = index + 1
              const isTopThree = rank <= 3
              const ps = getPlayerScore(entry.entry_id)
              const isCurrentUser = entry.users?.user_id === currentUserId

              return (
                <tr
                  key={entry.entry_id}
                  onClick={() => setSelectedEntry(entry)}
                  className={`cursor-pointer transition-colors ${
                    isTopThree ? 'bg-warning-50 hover:bg-warning-100' : 'hover:bg-primary-50'
                  }`}
                >
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {rank === 1 && <span className="text-2xl mr-2">{'\u{1F947}'}</span>}
                      {rank === 2 && <span className="text-2xl mr-2">{'\u{1F948}'}</span>}
                      {rank === 3 && <span className="text-2xl mr-2">{'\u{1F949}'}</span>}
                      {rank > 3 && <span className="text-2xl mr-2 invisible">{'\u{1F947}'}</span>}
                      <span className="text-lg font-bold text-neutral-900">#{rank}</span>
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                    {isMultiEntry ? (
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-neutral-900">
                            {entry.entry_name}
                          </span>
                          {isCurrentUser && <span className="text-xs text-primary-500 ml-1">(you)</span>}
                        </div>
                        <div className="text-xs text-neutral-500">
                          @{entry.users?.username || 'Unknown'}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-neutral-900">
                            {entry.users?.full_name || entry.users?.username || 'Unknown'}
                          </span>
                          {isCurrentUser && <span className="text-xs text-primary-500 ml-1">(you)</span>}
                        </div>
                        {entry.users?.username && (
                          <div className="text-xs text-neutral-500">
                            @{entry.users.username}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  {hasAnyBonusPoints && predictionMode !== 'bracket_picker' && (
                    <>
                      <td className="px-3 md:px-4 py-4 whitespace-nowrap text-right">
                        <span className="text-sm font-medium text-neutral-700">
                          {formatNumber(ps.match_points)}
                        </span>
                      </td>
                      <td className="px-3 md:px-4 py-4 whitespace-nowrap text-right">
                        <span className="text-sm font-medium text-success-600">
                          {formatNumber(ps.bonus_points)}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-right">
                    <span className="text-xl font-bold text-primary-600">
                      {formatNumber(ps.total_points)}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-center">
                    {entry.role === 'admin' && (
                      <Badge variant="outline" className="py-1">Admin</Badge>
                    )}
                  </td>
                  <td className="pr-3 py-4 whitespace-nowrap text-neutral-300">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
    </>
  )
}
