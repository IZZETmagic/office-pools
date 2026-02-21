'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { PointsBreakdownModal } from './PointsBreakdownModal'
import { calculateAllBonusPoints, type MatchWithResult } from '@/lib/bonusCalculation'
import { calculatePoints, type PoolSettings } from './results/points'
import type { MemberData, PlayerScoreData, BonusScoreData, MatchData, TeamData, PredictionData } from './types'
import type { PredictionMap, MatchConductData, Team } from '@/lib/tournament'

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
}: LeaderboardTabProps) {
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(null)

  // Build lookup map for player scores
  const scoreMap = new Map<string, PlayerScoreData>()
  for (const ps of playerScores) {
    scoreMap.set(ps.member_id, ps)
  }

  // Pre-compute shared data for bonus calculation
  const matchesWithResult = useMemo(() => matches.map(toMatchWithResult), [matches])
  const tournamentTeams = useMemo(() => toTournamentTeams(teams), [teams])

  // Compute bonus scores for ALL members client-side
  // This replaces the database-dependent bonusScores with live computation
  const computedBonusMap = useMemo(() => {
    const map = new Map<string, BonusScoreData[]>()

    // Group predictions by member
    const predsByMember = new Map<string, PredictionData[]>()
    for (const p of allPredictions) {
      const existing = predsByMember.get(p.member_id) || []
      existing.push(p)
      predsByMember.set(p.member_id, existing)
    }

    // Calculate bonus for each member with predictions
    for (const [memberId, preds] of predsByMember) {
      const predictionMap = buildPredictionMap(preds)
      const entries = calculateAllBonusPoints({
        memberId,
        memberPredictions: predictionMap,
        matches: matchesWithResult,
        teams: tournamentTeams,
        conductData,
        settings: poolSettings,
        tournamentAwards: null, // Tournament awards not available client-side yet
      })

      // Convert BonusScoreEntry[] to BonusScoreData[] (add bonus_score_id)
      const bonusData: BonusScoreData[] = entries.map((e, i) => ({
        bonus_score_id: `computed-${memberId}-${i}`,
        member_id: e.member_id,
        bonus_type: e.bonus_type,
        bonus_category: e.bonus_category,
        related_group_letter: e.related_group_letter,
        related_match_id: e.related_match_id,
        points_earned: e.points_earned,
        description: e.description,
      }))

      map.set(memberId, bonusData)
    }

    return map
  }, [allPredictions, matchesWithResult, tournamentTeams, conductData, poolSettings])

  // Compute match points for each member client-side too
  const computedMatchPointsMap = useMemo(() => {
    const map = new Map<string, number>()

    // Group predictions by member
    const predsByMember = new Map<string, PredictionData[]>()
    for (const p of allPredictions) {
      const existing = predsByMember.get(p.member_id) || []
      existing.push(p)
      predsByMember.set(p.member_id, existing)
    }

    for (const [memberId, preds] of predsByMember) {
      const predMap = new Map(preds.map(p => [p.match_id, p]))
      let totalMatchPts = 0

      for (const m of matches) {
        if ((m.is_completed || m.status === 'live') && m.home_score_ft !== null && m.away_score_ft !== null) {
          const pred = predMap.get(m.match_id)
          if (!pred) continue

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
              : undefined
          )
          totalMatchPts += result.points
        }
      }

      map.set(memberId, totalMatchPts)
    }

    return map
  }, [allPredictions, matches, poolSettings])

  // Get bonus data for a member — prefer computed, fall back to DB
  const getBonusForMember = (memberId: string): BonusScoreData[] => {
    return computedBonusMap.get(memberId) || bonusScores.filter(bs => bs.member_id === memberId)
  }

  // Check if any member has computed bonus points
  const hasAnyBonusPoints = useMemo(() => {
    for (const entries of computedBonusMap.values()) {
      if (entries.length > 0) return true
    }
    return playerScores.some(ps => ps.bonus_points > 0)
  }, [computedBonusMap, playerScores])

  // Build computed player score for modal
  const getPlayerScore = (memberId: string): PlayerScoreData => {
    const computedMatchPts = computedMatchPointsMap.get(memberId)
    const computedBonus = computedBonusMap.get(memberId)
    const computedBonusPts = computedBonus ? computedBonus.reduce((sum, e) => sum + e.points_earned, 0) : 0

    if (computedMatchPts !== undefined) {
      return {
        member_id: memberId,
        match_points: computedMatchPts,
        bonus_points: computedBonusPts,
        total_points: computedMatchPts + computedBonusPts,
      }
    }

    // Fall back to DB
    const dbScore = scoreMap.get(memberId)
    if (dbScore) return dbScore

    // Last resort: member's total_points
    const member = members.find(m => m.member_id === memberId)
    return {
      member_id: memberId,
      match_points: member?.total_points ?? 0,
      bonus_points: 0,
      total_points: member?.total_points ?? 0,
    }
  }

  // Sort by rank
  const sorted = [...members].sort(
    (a, b) => (a.current_rank ?? 999) - (b.current_rank ?? 999)
  )

  if (sorted.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-gray-600">No members in this pool yet.</p>
      </Card>
    )
  }

  return (
    <>
      {/* Tap hint */}
      <p className="text-xs text-gray-400 text-center mb-2">Tap a player to see their points breakdown</p>

      {/* Mobile card view */}
      <div className="sm:hidden space-y-2">
        {sorted.map((member, index) => {
          const rank = member.current_rank || index + 1
          const isTopThree = rank <= 3
          const ps = getPlayerScore(member.member_id)

          return (
            <div
              key={member.member_id}
              onClick={() => setSelectedMember(member)}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                isTopThree
                  ? 'bg-yellow-50 border-yellow-200 active:bg-yellow-100'
                  : 'bg-white border-gray-200 active:bg-gray-50'
              }`}
            >
              {/* Rank */}
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                {rank === 1 && <span className="text-lg">{'\u{1F947}'}</span>}
                {rank === 2 && <span className="text-lg">{'\u{1F948}'}</span>}
                {rank === 3 && <span className="text-lg">{'\u{1F949}'}</span>}
                {rank > 3 && <span className="text-sm font-bold text-gray-700">#{rank}</span>}
              </div>

              {/* Player info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {member.users?.full_name || member.users?.username || 'Unknown Player'}
                </div>
                <div className="flex items-center gap-1.5">
                  {member.users?.username && member.users?.full_name && (
                    <span className="text-xs text-gray-500">@{member.users.username}</span>
                  )}
                  {member.role === 'admin' && (
                    <Badge variant="blue">Admin</Badge>
                  )}
                </div>
              </div>

              {/* Points */}
              <div className="flex-shrink-0 text-right">
                <div className="text-lg font-bold text-blue-600">{ps.total_points}</div>
                {hasAnyBonusPoints && ps.bonus_points > 0 ? (
                  <div className="text-[10px] text-gray-500">
                    {ps.match_points} + {ps.bonus_points} bonus
                  </div>
                ) : (
                  <div className="text-[10px] text-gray-500 uppercase">pts</div>
                )}
              </div>

              {/* Chevron hint */}
              <div className="flex-shrink-0 text-gray-300">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop table view */}
      <div className="hidden sm:block bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Player
              </th>
              {hasAnyBonusPoints && (
                <>
                  <th className="px-3 md:px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Match
                  </th>
                  <th className="px-3 md:px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Bonus
                  </th>
                </>
              )}
              <th className="px-4 md:px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                Total
              </th>
              <th className="px-4 md:px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Role
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sorted.map((member, index) => {
              const rank = member.current_rank || index + 1
              const isTopThree = rank <= 3
              const ps = getPlayerScore(member.member_id)

              return (
                <tr
                  key={member.member_id}
                  onClick={() => setSelectedMember(member)}
                  className={`cursor-pointer transition-colors ${
                    isTopThree ? 'bg-yellow-50 hover:bg-yellow-100' : 'hover:bg-blue-50'
                  }`}
                >
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {rank === 1 && <span className="text-2xl mr-2">{'\u{1F947}'}</span>}
                      {rank === 2 && <span className="text-2xl mr-2">{'\u{1F948}'}</span>}
                      {rank === 3 && <span className="text-2xl mr-2">{'\u{1F949}'}</span>}
                      {rank > 3 && <span className="text-2xl mr-2 invisible">{'\u{1F947}'}</span>}
                      <span className="text-lg font-bold text-gray-900">#{rank}</span>
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {member.users?.full_name || member.users?.username || 'Unknown Player'}
                      </div>
                      {member.users?.username && member.users?.full_name && (
                        <div className="text-xs text-gray-600">@{member.users.username}</div>
                      )}
                    </div>
                  </td>
                  {hasAnyBonusPoints && (
                    <>
                      <td className="px-3 md:px-4 py-4 whitespace-nowrap text-right">
                        <span className="text-sm font-medium text-gray-700">
                          {ps.match_points}
                        </span>
                      </td>
                      <td className="px-3 md:px-4 py-4 whitespace-nowrap text-right">
                        <span className="text-sm font-medium text-green-600">
                          {ps.bonus_points}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-right">
                    <span className="text-xl font-bold text-blue-600">
                      {ps.total_points}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-center">
                    {member.role === 'admin' && (
                      <Badge variant="blue" className="py-1">Admin</Badge>
                    )}
                  </td>
                  <td className="pr-3 py-4 whitespace-nowrap text-gray-300">
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
      {selectedMember && (
        <PointsBreakdownModal
          member={selectedMember}
          playerScore={getPlayerScore(selectedMember.member_id)}
          bonusScores={getBonusForMember(selectedMember.member_id)}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </>
  )
}
