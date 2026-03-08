'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { Fragment } from 'react'
import {
  calculateGroupStandings,
  rankThirdPlaceTeams,
  GROUP_LETTERS,
  type GroupStanding,
  type ThirdPlaceTeam,
  type PredictionMap,
  type Match,
  type Team,
  type MatchConductData,
} from '@/lib/tournament'
import { resolveFullBracket } from '@/lib/bracketResolver'
import type { MatchData, TeamData, ExistingPrediction, BonusScoreData } from '../types'
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
  groupFilter: string
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
    home_team: m.home_team ? { country_name: m.home_team.country_name, country_code: m.home_team.country_code, flag_url: m.home_team.flag_url ?? null } : null,
    away_team: m.away_team ? { country_name: m.away_team.country_name, country_code: m.away_team.country_code, flag_url: m.away_team.flag_url ?? null } : null,
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
  group_winner_and_runnerup: { bg: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400', label: 'WINNER & RU' },
  both_qualify_swapped: { bg: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400', label: 'SWAPPED' },
  group_winner_only: { bg: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400', label: 'WINNER' },
  group_runnerup_only: { bg: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400', label: 'RUNNER-UP' },
  one_qualifies_wrong_position: { bg: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400', label: '1 QUALIFIER' },
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
  index = 0,
}: {
  groupLetter: string
  predictedStandings: GroupStanding[]
  actualStandings: GroupStanding[]
  computedBonus: ComputedGroupBonus | null
  groupComplete: boolean
  index?: number
}) {
  // Build lookup: team_id → actual position (0-indexed)
  const actualPositionMap = new Map<string, number>()
  for (let i = 0; i < actualStandings.length; i++) {
    actualPositionMap.set(actualStandings[i].team_id, i)
  }

  const hasActualData = actualStandings.some((s) => s.played > 0)
  // Actual top-2 qualifying team IDs
  const actualQualifiedIds = new Set(actualStandings.slice(0, 2).map((s) => s.team_id))

  return (
    <div className="animate-fade-up" style={{ animationDelay: `${index * 0.03}s` }}>
    <Card padding="md">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">Group {groupLetter}</h3>
        {computedBonus ? (
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${computedBonus.bg}`}>
              {computedBonus.label}
            </span>
            <span className="text-xs font-bold tabular-nums text-success-600 dark:text-success-400">
              +{computedBonus.points}
            </span>
          </div>
        ) : groupComplete ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400">
              MISS
            </span>
            <span className="text-xs font-bold tabular-nums text-neutral-400 dark:text-neutral-500">
              +0
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Predicted column */}
        <div>
          <div className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1.5">
            Your Picks
          </div>
          <div className="space-y-1">
            {predictedStandings.map((team, idx) => {
              const isTopTwo = idx < 2
              const actualPos = actualPositionMap.get(team.team_id)

              // Only color top-2 picks when group is complete (these affect scoring)
              // Positions 3-4 don't earn bonus points so stay neutral
              let rowStyle = 'bg-neutral-50 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'

              if (hasActualData && groupComplete && isTopTwo) {
                const exactPosition = actualPos === idx
                const qualified = actualQualifiedIds.has(team.team_id)

                if (exactPosition) {
                  // Exact position match — contributes to winner/runner-up bonus
                  rowStyle = 'bg-success-50 text-success-800 ring-1 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-800'
                } else if (qualified) {
                  // Qualified but swapped position — contributes to swapped/partial bonus
                  rowStyle = 'bg-primary-50 text-primary-800 ring-1 ring-primary-200 dark:bg-primary-900/20 dark:text-primary-300 dark:ring-primary-800'
                } else {
                  // Didn't qualify at all — miss
                  rowStyle = 'bg-danger-50 text-danger-700 ring-1 ring-danger-200 dark:bg-danger-900/20 dark:text-danger-300 dark:ring-danger-800'
                }
              } else if (hasActualData && groupComplete && !isTopTwo) {
                // Positions 3-4: muted style
                rowStyle = 'bg-neutral-50/50 text-neutral-400 dark:bg-neutral-800/50 dark:text-neutral-500'
              }

              return (
                <div
                  key={team.team_id}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${rowStyle}`}
                >
                  <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500 w-3">{idx + 1}</span>
                  <span className="truncate flex-1 font-medium">{team.country_name}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Actual column */}
        <div>
          <div className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1.5">
            Actual
          </div>
          {!hasActualData ? (
            <div className="text-xs text-neutral-400 italic py-2">
              No results yet
            </div>
          ) : (
            <div className="space-y-1">
              {actualStandings.map((team, idx) => (
                <div
                  key={team.team_id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-neutral-50 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500 w-3">{idx + 1}</span>
                  <span className="truncate flex-1 font-medium">{team.country_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
    </div>
  )
}

// =============================================
// THIRD-PLACE COMPARISON CARD
// =============================================

function ThirdPlaceComparisonCard({
  predictedThirds,
  actualThirds,
  hasActualData,
  index = 0,
}: {
  predictedThirds: ThirdPlaceTeam[]
  actualThirds: ThirdPlaceTeam[]
  hasActualData: boolean
  index?: number
}) {
  // Actual qualifiers (top 8)
  const actualQualifierIds = new Set(actualThirds.slice(0, 8).map(t => t.team_id))

  // Count correct qualifiers for points display
  const correctQualifiers = predictedThirds.slice(0, 8).filter(t => actualQualifierIds.has(t.team_id)).length

  return (
    <div className="animate-fade-up" style={{ animationDelay: `${index * 0.03}s` }}>
    <Card padding="md">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">Third-Place Rankings</h3>
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500">Top 8 qualify</span>
        </div>
        {hasActualData && (
          <span className="text-xs font-medium text-neutral-400 tabular-nums">
            {correctQualifiers}/8 correct
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Predicted column */}
        <div>
          <div className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1.5">
            Your Picks
          </div>
          <div className="space-y-1">
            {predictedThirds.map((team, idx) => {
              const isQualifier = idx < 8
              const actuallyQualified = hasActualData && actualQualifierIds.has(team.team_id)

              // Only top-8 picks matter (did you correctly predict they'd advance to R32?)
              // Positions 9-12 stay muted since they don't earn points
              let rowStyle = isQualifier
                ? 'bg-neutral-50 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                : 'bg-neutral-50/50 text-neutral-400 dark:bg-neutral-800/50 dark:text-neutral-500'

              if (hasActualData && isQualifier) {
                if (actuallyQualified) {
                  // Green: predicted to qualify and they did
                  rowStyle = 'bg-success-50 text-success-800 ring-1 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-800'
                } else {
                  // Red: predicted to qualify but they didn't
                  rowStyle = 'bg-danger-50 text-danger-700 ring-1 ring-danger-200 dark:bg-danger-900/20 dark:text-danger-300 dark:ring-danger-800'
                }
              }

              return (
                <Fragment key={team.team_id}>
                  {idx === 8 && (
                    <div className="flex items-center gap-2 py-0.5">
                      <div className="flex-1 border-t border-dashed border-neutral-300 dark:border-neutral-600" />
                      <span className="text-[9px] text-neutral-400 uppercase tracking-wider">Eliminated</span>
                      <div className="flex-1 border-t border-dashed border-neutral-300 dark:border-neutral-600" />
                    </div>
                  )}
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${rowStyle}`}
                  >
                    <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500 w-4">{idx + 1}</span>
                    <span className="truncate flex-1 font-medium">{team.country_name}</span>
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{team.group_letter}</span>
                  </div>
                </Fragment>
              )
            })}
          </div>
        </div>

        {/* Actual column */}
        <div>
          <div className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1.5">
            Actual
          </div>
          {!hasActualData ? (
            <div className="text-xs text-neutral-400 italic py-2">
              No results yet
            </div>
          ) : (
            <div className="space-y-1">
              {actualThirds.map((team, idx) => {
                const isQualifier = idx < 8
                return (
                  <Fragment key={team.team_id}>
                    {idx === 8 && (
                      <div className="flex items-center gap-2 py-0.5">
                        <div className="flex-1 border-t border-dashed border-neutral-300 dark:border-neutral-600" />
                        <span className="text-[9px] text-neutral-400 uppercase tracking-wider">Eliminated</span>
                        <div className="flex-1 border-t border-dashed border-neutral-300 dark:border-neutral-600" />
                      </div>
                    )}
                    <div
                      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-neutral-50 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500 w-4">{idx + 1}</span>
                      <span className="truncate flex-1 font-medium">{team.country_name}</span>
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{team.group_letter}</span>
                    </div>
                  </Fragment>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
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
  groupFilter,
}: GroupStandingsComparisonProps) {

  // Convert to tournament lib types (stable reference via useMemo)
  const tournamentMatches = useMemo(() => toTournamentMatches(matches), [matches])
  const tournamentTeams = useMemo(() => toTournamentTeams(teams), [teams])

  // Build predicted standings via resolveFullBracket
  const predictedStandingsMap = useMemo(() => {
    const predictionMap = buildPredictionMap(userPredictions)
    const bracket = resolveFullBracket({
      matches: tournamentMatches,
      predictionMap,
      teams: tournamentTeams,
    })
    return bracket.allGroupStandings
  }, [userPredictions, tournamentMatches, tournamentTeams])

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
    const all = GROUP_LETTERS.filter((letter) => {
      const standings = actualStandingsMap.get(letter)
      return standings && standings.some((s) => s.played > 0)
    })
    if (groupFilter !== 'all') {
      return all.filter((letter) => letter === groupFilter)
    }
    return all
  }, [actualStandingsMap, groupFilter])

  // Third-place rankings: predicted vs actual
  const predictedThirdPlaceTeams = useMemo(() => {
    return rankThirdPlaceTeams(predictedStandingsMap)
  }, [predictedStandingsMap])

  const actualThirdPlaceTeams = useMemo(() => {
    return rankThirdPlaceTeams(actualStandingsMap)
  }, [actualStandingsMap])

  // Check if enough groups have data for third-place comparison (need all 12 groups to have standings)
  const hasThirdPlaceData = predictedThirdPlaceTeams.length >= 12

  if (!hasAnyActualData && predictedStandingsMap.size === 0) return null

  // Total active groups (ignoring filter) for the "no results" message
  const totalActiveGroups = GROUP_LETTERS.filter((letter) => {
    const standings = actualStandingsMap.get(letter)
    return standings && standings.some((s) => s.played > 0)
  }).length

  return (
    <div className="mb-6 space-y-3">
      {/* Group comparison grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {activeGroups.map((letter, i) => {
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
              index={i}
            />
          )
        })}
      </div>

      {/* Third-place rankings comparison (only when viewing all groups) */}
      {groupFilter === 'all' && hasThirdPlaceData && (
        <ThirdPlaceComparisonCard
          predictedThirds={predictedThirdPlaceTeams}
          actualThirds={actualThirdPlaceTeams}
          hasActualData={hasAnyActualData}
          index={activeGroups.length}
        />
      )}

      {/* Show groups with no results yet (only when viewing all groups) */}
      {groupFilter === 'all' && totalActiveGroups < GROUP_LETTERS.length && (
        <p className="text-xs text-neutral-400 text-center">
          {GROUP_LETTERS.length - totalActiveGroups} groups have no match results yet
        </p>
      )}
    </div>
  )
}
