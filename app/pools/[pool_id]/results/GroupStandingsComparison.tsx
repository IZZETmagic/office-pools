'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/Badge'
import {
  calculateGroupStandings,
  GROUP_LETTERS,
  type GroupStanding,
  type PredictionMap,
  type Match,
  type Team,
  type MatchConductData,
} from '@/lib/tournament'
import { resolveFullBracket } from '@/lib/bracketResolver'
import type { MatchData, TeamData, ExistingPrediction, MemberData, PredictionData, BonusScoreData } from '../types'
import type { PoolSettings } from './points'

// =============================================
// TYPES
// =============================================

type GroupStandingsComparisonProps = {
  matches: MatchData[]
  teams: TeamData[]
  conductData: MatchConductData[]
  userPredictions: ExistingPrediction[]
  poolSettings: PoolSettings
  bonusScores: BonusScoreData[]
  // Admin member selection
  isAdmin: boolean
  members: MemberData[]
  allPredictions: PredictionData[]
  // Current user's member ID (to default dropdown)
  currentMemberId: string
}

// =============================================
// HELPERS
// =============================================

/** Convert ExistingPrediction[] or PredictionData[] into PredictionMap */
function buildPredictionMap(
  predictions: { match_id: string; predicted_home_score: number; predicted_away_score: number; predicted_home_pso?: number | null; predicted_away_pso?: number | null; predicted_winner_team_id?: string | null }[]
): PredictionMap {
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

/** Convert MatchData[] to Match[] (the tournament lib's type) */
function toTournamentMatches(matches: MatchData[]): Match[] {
  return matches.map((m) => ({
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
  }))
}

/** Convert TeamData[] to Team[] (the tournament lib's type) */
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

/** Build actual results PredictionMap from completed matches */
function buildActualScores(matches: MatchData[]): PredictionMap {
  const map: PredictionMap = new Map()
  for (const m of matches) {
    if (m.stage === 'group' && (m.is_completed || m.status === 'live') && m.home_score_ft !== null && m.away_score_ft !== null) {
      map.set(m.match_id, {
        home: m.home_score_ft,
        away: m.away_score_ft,
      })
    }
  }
  return map
}

// =============================================
// CLIENT-SIDE BONUS COMPUTATION
// =============================================

type ComputedGroupBonus = {
  type: string
  label: string
  points: number
  bg: string
}

const GROUP_BONUS_CONFIG: Record<string, { bg: string; label: string }> = {
  group_winner_and_runnerup: { bg: 'bg-warning-100 text-warning-800 border border-warning-500', label: 'Winner & Runner-up' },
  both_qualify_swapped: { bg: 'bg-success-100 text-success-800 border border-success-500', label: 'Both Qualify (Swapped)' },
  group_winner_only: { bg: 'bg-primary-100 text-primary-800 border border-primary-500', label: 'Correct Winner' },
  group_runnerup_only: { bg: 'bg-primary-100 text-primary-800 border border-primary-500', label: 'Correct Runner-up' },
  one_qualifies_wrong_position: { bg: 'bg-primary-100 text-primary-800 border border-primary-500', label: 'One Qualifier' },
}

/** Whether all group matches are completed */
function isGroupComplete(matches: MatchData[], groupLetter: string): boolean {
  const groupMatches = matches.filter(m => m.stage === 'group' && m.group_letter === groupLetter)
  return groupMatches.length >= 6 && groupMatches.every(m => m.is_completed)
}

/**
 * Compute the group bonus client-side by comparing predicted vs actual top 2.
 * Mirrors the logic in lib/bonusCalculation.ts so the badge is always
 * accurate regardless of whether the backend calculation has run.
 */
function computeGroupBonus(
  predicted: GroupStanding[],
  actual: GroupStanding[],
  groupComplete: boolean,
  settings: PoolSettings
): ComputedGroupBonus | null {
  if (!groupComplete || predicted.length < 2 || actual.length < 2) return null

  const predictedWinner = predicted[0].team_id
  const predictedRunnerUp = predicted[1].team_id
  const actualWinner = actual[0].team_id
  const actualRunnerUp = actual[1].team_id

  let bonusType: string | null = null
  let points = 0

  if (predictedWinner === actualWinner && predictedRunnerUp === actualRunnerUp) {
    bonusType = 'group_winner_and_runnerup'
    points = settings.bonus_group_winner_and_runnerup ?? 150
  } else if (predictedWinner === actualRunnerUp && predictedRunnerUp === actualWinner) {
    bonusType = 'both_qualify_swapped'
    points = settings.bonus_both_qualify_swapped ?? 75
  } else if (predictedWinner === actualWinner) {
    bonusType = 'group_winner_only'
    points = settings.bonus_group_winner_only ?? 100
  } else if (predictedRunnerUp === actualRunnerUp) {
    bonusType = 'group_runnerup_only'
    points = settings.bonus_group_runnerup_only ?? 50
  } else if (predictedWinner === actualRunnerUp || predictedRunnerUp === actualWinner) {
    bonusType = 'one_qualifies_wrong_position'
    points = settings.bonus_one_qualifies_wrong_position ?? 25
  }

  if (bonusType && points > 0) {
    const config = GROUP_BONUS_CONFIG[bonusType]
    return { type: bonusType, label: config.label, points, bg: config.bg }
  }

  return null
}

// =============================================
// GROUP COMPARISON CARD
// =============================================

function GroupComparisonCard({
  groupLetter,
  predictedStandings,
  actualStandings,
  computedBonus,
  groupComplete,
}: {
  groupLetter: string
  predictedStandings: GroupStanding[]
  actualStandings: GroupStanding[]
  computedBonus: ComputedGroupBonus | null
  groupComplete: boolean
}) {
  // Build lookup: team_id → actual position (0-indexed)
  const actualPositionMap = new Map<string, number>()
  for (let i = 0; i < actualStandings.length; i++) {
    actualPositionMap.set(actualStandings[i].team_id, i)
  }

  // Build lookup: team_id → predicted position (0-indexed)
  const predictedPositionMap = new Map<string, number>()
  for (let i = 0; i < predictedStandings.length; i++) {
    predictedPositionMap.set(predictedStandings[i].team_id, i)
  }

  const hasActualData = actualStandings.some((s) => s.played > 0)

  // Build sets of top-2 qualifying team IDs for both sides
  const actualQualifiedIds = new Set(actualStandings.slice(0, 2).map((s) => s.team_id))
  const predictedQualifiedIds = new Set(predictedStandings.slice(0, 2).map((s) => s.team_id))

  // Split standings: top 2 (qualifying) vs bottom (no bonus possible)
  const predictedTop2 = predictedStandings.slice(0, 2)
  const predictedBottom = predictedStandings.slice(2)
  const actualTop2 = actualStandings.slice(0, 2)
  const actualBottom = actualStandings.slice(2)

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
      {/* Group header with bonus badge */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-neutral-50 border-b border-neutral-200">
        <span className="text-sm font-bold text-neutral-900 shrink-0">Group {groupLetter}</span>
        {computedBonus ? (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${computedBonus.bg}`}>
            <span>{'\u2713'}</span>
            <span>{computedBonus.label}</span>
            <span>+{computedBonus.points}</span>
          </span>
        ) : groupComplete ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-50 text-neutral-500 border border-neutral-200">
            <span>{'\u2717'}</span>
            <span>Miss</span>
            <span>+0</span>
          </span>
        ) : null}
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 divide-x divide-neutral-200">
        {/* Predicted column */}
        <div>
          <div className="px-2 py-1.5 bg-primary-50 border-b border-neutral-200">
            <span className="text-[10px] sm:text-xs font-semibold text-primary-700 uppercase tracking-wide">
              Predicted
            </span>
          </div>
          <div className="divide-y divide-neutral-100">
            {/* Top 2 — qualifying positions (full styling) */}
            {predictedTop2.map((team, idx) => {
              const actualPos = actualPositionMap.get(team.team_id)
              const positionCorrect = groupComplete && actualPos === idx
              const qualifiedWrongPos = groupComplete && !positionCorrect && actualQualifiedIds.has(team.team_id)

              return (
                <div
                  key={team.team_id}
                  className={`flex items-center gap-1.5 px-2 py-1.5 text-xs sm:text-sm ${
                    groupComplete
                      ? positionCorrect
                        ? 'bg-success-50'
                        : qualifiedWrongPos
                          ? 'bg-warning-50'
                          : 'bg-danger-50/50'
                      : ''
                  }`}
                >
                  <span className="w-4 text-center font-bold text-[10px] sm:text-xs text-success-700">
                    {idx + 1}
                  </span>
                  <span className="flex-1 font-medium text-neutral-900 truncate text-xs sm:text-sm">
                    {team.country_name}
                  </span>
                  {groupComplete && (
                    <span className="flex-shrink-0 w-4 text-center">
                      {positionCorrect ? (
                        <svg className="w-3.5 h-3.5 text-success-600 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : qualifiedWrongPos ? (
                        <svg className="w-3.5 h-3.5 text-warning-500 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5 text-danger-400 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </span>
                  )}
                </div>
              )
            })}
            {/* Positions 3+ — greyed out (no bonus possible) */}
            {predictedBottom.map((team, idx) => (
              <div
                key={team.team_id}
                className="flex items-center gap-1.5 px-2 py-1 text-xs bg-neutral-50/50"
              >
                <span className="w-4 text-center font-bold text-[10px] text-neutral-300">
                  {idx + 3}
                </span>
                <span className="flex-1 font-medium text-neutral-400 truncate text-xs">
                  {team.country_name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actual column */}
        <div>
          <div className="px-2 py-1.5 bg-neutral-50 border-b border-neutral-200">
            <span className="text-[10px] sm:text-xs font-semibold text-neutral-600 uppercase tracking-wide">
              Actual
            </span>
          </div>
          <div className="divide-y divide-neutral-100">
            {hasActualData ? (
              <>
                {/* Top 2 — qualifying positions (full styling) */}
                {actualTop2.map((team, idx) => {
                  const predictedPos = predictedPositionMap.get(team.team_id)
                  const positionCorrect = groupComplete && predictedPos === idx
                  const predictedToQualify = predictedQualifiedIds.has(team.team_id)
                  const qualifiedWrongPos = groupComplete && !positionCorrect && predictedToQualify

                  return (
                    <div
                      key={team.team_id}
                      className={`flex items-center gap-1.5 px-2 py-1.5 text-xs sm:text-sm ${
                        groupComplete
                          ? positionCorrect
                            ? 'bg-success-50'
                            : qualifiedWrongPos
                              ? 'bg-warning-50'
                              : ''
                          : ''
                      }`}
                    >
                      <span className="w-4 text-center font-bold text-[10px] sm:text-xs text-success-700">
                        {idx + 1}
                      </span>
                      <span className="flex-1 font-medium text-neutral-900 truncate text-xs sm:text-sm">
                        {team.country_name}
                      </span>
                    </div>
                  )
                })}
                {/* Positions 3+ — greyed out */}
                {actualBottom.map((team, idx) => (
                  <div
                    key={team.team_id}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs bg-neutral-50/50"
                  >
                    <span className="w-4 text-center font-bold text-[10px] text-neutral-300">
                      {idx + 3}
                    </span>
                    <span className="flex-1 font-medium text-neutral-400 truncate text-xs">
                      {team.country_name}
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <div className="px-2 py-4 text-center">
                <span className="text-xs text-neutral-400">No results yet</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================
// MAIN COMPONENT
// =============================================

export function GroupStandingsComparison({
  matches,
  teams,
  conductData,
  userPredictions,
  poolSettings,
  bonusScores,
  isAdmin,
  members,
  allPredictions,
  currentMemberId,
}: GroupStandingsComparisonProps) {
  const [selectedMemberId, setSelectedMemberId] = useState<string>(currentMemberId)
  const [isExpanded, setIsExpanded] = useState(true)

  // Build list of members who have predictions (for admin dropdown)
  // Uses allPredictions data instead of has_submitted_predictions flag which can be stale
  const membersWithPredictions = useMemo(() => {
    // Build set of member IDs that have at least one prediction
    const memberIdsWithPreds = new Set<string>()
    // Always include current user
    memberIdsWithPreds.add(currentMemberId)
    for (const p of allPredictions) {
      memberIdsWithPreds.add(p.member_id)
    }
    // Also include members with the submitted flag (belt-and-suspenders)
    for (const m of members) {
      if (m.has_submitted_predictions) {
        memberIdsWithPreds.add(m.member_id)
      }
    }
    return members.filter((m) => memberIdsWithPreds.has(m.member_id))
  }, [members, allPredictions, currentMemberId])

  // Convert to tournament lib types (stable reference via useMemo)
  const tournamentMatches = useMemo(() => toTournamentMatches(matches), [matches])
  const tournamentTeams = useMemo(() => toTournamentTeams(teams), [teams])

  // Get active member's predictions
  const activePredictions = useMemo(() => {
    if (selectedMemberId === currentMemberId) {
      return userPredictions
    }
    // Admin viewing another member
    return allPredictions.filter((p) => p.member_id === selectedMemberId)
  }, [selectedMemberId, currentMemberId, userPredictions, allPredictions])

  // Build predicted standings via resolveFullBracket
  const predictedStandingsMap = useMemo(() => {
    const predictionMap = buildPredictionMap(activePredictions)
    const bracket = resolveFullBracket({
      matches: tournamentMatches,
      predictionMap,
      teams: tournamentTeams,
    })
    return bracket.allGroupStandings
  }, [activePredictions, tournamentMatches, tournamentTeams])

  // Build actual standings from completed match results
  const actualStandingsMap = useMemo(() => {
    const actualScores = buildActualScores(matches)
    const groupMatches = tournamentMatches.filter((m) => m.stage === 'group')

    const allStandings = new Map<string, GroupStanding[]>()
    for (const letter of GROUP_LETTERS) {
      const gMatches = groupMatches.filter((m) => m.group_letter === letter)
      const standings = calculateGroupStandings(letter, gMatches, actualScores, tournamentTeams, conductData)
      allStandings.set(letter, standings)
    }
    return allStandings
  }, [matches, tournamentMatches, tournamentTeams, conductData])

  // Check if any group has actual data
  const hasAnyActualData = useMemo(() => {
    for (const standings of actualStandingsMap.values()) {
      if (standings.some((s) => s.played > 0)) return true
    }
    return false
  }, [actualStandingsMap])

  // Groups that have at least one completed/live match
  const activeGroups = useMemo(() => {
    return GROUP_LETTERS.filter((letter) => {
      const standings = actualStandingsMap.get(letter)
      return standings && standings.some((s) => s.played > 0)
    })
  }, [actualStandingsMap])

  // Get selected member's name for display
  const selectedMember = members.find((m) => m.member_id === selectedMemberId)
  const memberLabel = selectedMemberId === currentMemberId
    ? 'Your'
    : `${selectedMember?.users?.full_name || selectedMember?.users?.username || 'Unknown'}'s`

  if (!hasAnyActualData && predictedStandingsMap.size === 0) return null

  return (
    <div className="mb-6">
      {/* Header with collapse toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-lg shadow border border-neutral-200 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-neutral-900">
            Group Standings: Predicted vs Actual
          </h3>
          <Badge variant="blue">{activeGroups.length} groups</Badge>
        </div>
        <svg
          className={`w-4 h-4 text-neutral-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {/* Admin member selector */}
          {isAdmin && members.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-neutral-600">Viewing:</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="px-3 py-1.5 text-sm border border-neutral-300 rounded-md bg-white text-neutral-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {membersWithPredictions.map((m) => (
                  <option key={m.member_id} value={m.member_id}>
                    {m.member_id === currentMemberId
                      ? `${m.users?.full_name || m.users?.username || 'You'} (You)`
                      : m.users?.full_name || m.users?.username || 'Unknown'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Info banner */}
          <div className="bg-primary-50 border border-primary-200 rounded-lg px-3 py-2 text-xs text-primary-700">
            {memberLabel} predicted group standings compared to actual results.
            <span className="inline-flex items-center gap-1 ml-1">
              <svg className="w-3 h-3 text-success-600 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              = correct position
            </span>
          </div>

          {/* Group comparison grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeGroups.map((letter) => {
              const predicted = predictedStandingsMap.get(letter) || []
              const actual = actualStandingsMap.get(letter) || []
              const groupComplete = isGroupComplete(matches, letter)
              const bonus = computeGroupBonus(predicted, actual, groupComplete, poolSettings)

              return (
                <GroupComparisonCard
                  key={letter}
                  groupLetter={letter}
                  predictedStandings={predicted}
                  actualStandings={actual}
                  computedBonus={bonus}
                  groupComplete={groupComplete}
                />
              )
            })}
          </div>

          {/* Show groups with no results yet */}
          {activeGroups.length < GROUP_LETTERS.length && (
            <p className="text-xs text-neutral-400 text-center">
              {GROUP_LETTERS.length - activeGroups.length} groups have no match results yet
            </p>
          )}
        </div>
      )}
    </div>
  )
}
