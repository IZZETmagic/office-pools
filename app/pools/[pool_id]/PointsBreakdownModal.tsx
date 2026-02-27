'use client'

import { useMemo, useCallback } from 'react'
import type { LeaderboardEntry, PlayerScoreData, BonusScoreData, MatchData, TeamData, PredictionData } from './types'
import { calculatePoints, checkKnockoutTeamsMatch, type PoolSettings } from './results/points'
import { resolveFullBracket } from '@/lib/bracketResolver'
import type { MatchConductData } from '@/lib/tournament'
import { formatNumber } from '@/lib/format'

// =============================================
// TYPES & CONSTANTS
// =============================================

type PointsBreakdownModalProps = {
  entry: LeaderboardEntry
  playerScore: PlayerScoreData | null
  bonusScores: BonusScoreData[]
  onClose: () => void
  isMultiEntry?: boolean
  poolSettings: PoolSettings
  matches: MatchData[]
  entryPredictions: PredictionData[]
  teams: TeamData[]
  conductData: MatchConductData[]
}

type MatchPointDetail = {
  matchNumber: number
  homeTeam: string
  awayTeam: string
  actualHome: number
  actualAway: number
  predictedHome: number
  predictedAway: number
  points: number
  type: 'exact' | 'winner_gd' | 'winner' | 'miss'
  basePoints: number
  multiplier: number
  psoPoints: number
  stage: string
}

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage',
  round_32: 'Round of 32',
  round_16: 'Round of 16',
  quarter_final: 'Quarter Finals',
  semi_final: 'Semi Finals',
  third_place: 'Third Place',
  final: 'Final',
}

const TYPE_LABELS: Record<string, string> = {
  exact: 'Exact',
  winner_gd: 'W+GD',
  winner: 'Winner',
  miss: 'Miss',
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  exact: { bg: 'bg-success-100', text: 'text-success-700' },
  winner_gd: { bg: 'bg-primary-100', text: 'text-primary-700' },
  winner: { bg: 'bg-warning-100', text: 'text-warning-700' },
  miss: { bg: 'bg-neutral-100', text: 'text-neutral-500' },
}

const BONUS_CATEGORY_ORDER = ['group_standings', 'qualification', 'bracket', 'tournament'] as const

const BONUS_CATEGORY_CONFIG: Record<string, { label: string }> = {
  group_standings: { label: 'Group Standings Bonus' },
  qualification: { label: 'Overall Qualification Bonus' },
  bracket: { label: 'Knockout & Bracket Bonus' },
  tournament: { label: 'Tournament Podium' },
}

// =============================================
// SUB-COMPONENTS
// =============================================

function PointsRow({ label, value, suffix = 'pts' }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 px-3">
      <span className="text-xs text-neutral-600">{label}</span>
      <span className="text-xs font-semibold text-neutral-900">{value} {suffix}</span>
    </div>
  )
}

// =============================================
// COMPONENT
// =============================================

export function PointsBreakdownModal({
  entry,
  playerScore,
  bonusScores,
  onClose,
  isMultiEntry = false,
  poolSettings,
  matches,
  entryPredictions,
  teams,
  conductData,
}: PointsBreakdownModalProps) {
  const matchPoints = playerScore?.match_points ?? entry.total_points ?? 0
  const bonusPoints = playerScore?.bonus_points ?? 0
  const totalPoints = playerScore?.total_points ?? entry.total_points ?? 0

  // Build prediction lookup
  const predictionMap = useMemo(() => {
    const map = new Map<string, PredictionData>()
    for (const p of entryPredictions) {
      map.set(p.match_id, p)
    }
    return map
  }, [entryPredictions])

  // Resolve bracket for knockout team matching
  const knockoutTeamMap = useMemo(() => {
    const bracketMatches = matches.map(m => ({
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
    }))
    const bracketPredMap = new Map(
      entryPredictions.map(p => [p.match_id, {
        home: p.predicted_home_score,
        away: p.predicted_away_score,
        homePso: p.predicted_home_pso ?? null,
        awayPso: p.predicted_away_pso ?? null,
        winnerTeamId: p.predicted_winner_team_id ?? null,
      }])
    )
    const tournamentTeams = teams.map(t => ({
      team_id: t.team_id,
      country_name: t.country_name,
      country_code: t.country_code,
      group_letter: t.group_letter,
      fifa_ranking_points: t.fifa_ranking_points,
      flag_url: t.flag_url,
    }))
    const bracket = resolveFullBracket({
      matches: bracketMatches,
      predictionMap: bracketPredMap,
      teams: tournamentTeams,
      conductData,
    })
    return bracket.knockoutTeamMap
  }, [matches, entryPredictions, teams, conductData])

  // Compute per-match point details
  const matchDetails = useMemo(() => {
    const details: MatchPointDetail[] = []

    for (const m of matches) {
      if (!(m.is_completed || m.status === 'live') || m.home_score_ft === null || m.away_score_ft === null) continue

      const pred = predictionMap.get(m.match_id)
      if (!pred) continue

      const resolved = knockoutTeamMap.get(m.match_number)
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

      details.push({
        matchNumber: m.match_number,
        homeTeam: m.home_team?.country_name ?? m.home_team_placeholder ?? '?',
        awayTeam: m.away_team?.country_name ?? m.away_team_placeholder ?? '?',
        actualHome: m.home_score_ft,
        actualAway: m.away_score_ft,
        predictedHome: pred.predicted_home_score,
        predictedAway: pred.predicted_away_score,
        points: result.points,
        type: result.type,
        basePoints: result.basePoints,
        multiplier: result.multiplier,
        psoPoints: result.pso?.psoPoints ?? 0,
        stage: m.stage,
      })
    }

    details.sort((a, b) => a.matchNumber - b.matchNumber)
    return details
  }, [matches, predictionMap, poolSettings])

  // Group match details by stage
  const matchesByStage = useMemo(() => {
    const grouped = new Map<string, MatchPointDetail[]>()
    for (const d of matchDetails) {
      const existing = grouped.get(d.stage) || []
      existing.push(d)
      grouped.set(d.stage, existing)
    }
    return grouped
  }, [matchDetails])

  // Count match point type totals per stage
  const stageStats = useMemo(() => {
    const stats = new Map<string, { total: number; exact: number; winnerGd: number; winner: number; miss: number; pso: number }>()
    for (const [stage, details] of matchesByStage) {
      const s = { total: 0, exact: 0, winnerGd: 0, winner: 0, miss: 0, pso: 0 }
      for (const d of details) {
        s.total += d.points
        if (d.type === 'exact') s.exact++
        else if (d.type === 'winner_gd') s.winnerGd++
        else if (d.type === 'winner') s.winner++
        else s.miss++
        s.pso += d.psoPoints
      }
      stats.set(stage, s)
    }
    return stats
  }, [matchesByStage])

  // Group bonus scores by category
  const groupedBonuses = useMemo(() => {
    const grouped = new Map<string, BonusScoreData[]>()
    for (const bs of bonusScores) {
      const existing = grouped.get(bs.bonus_category) || []
      existing.push(bs)
      grouped.set(bs.bonus_category, existing)
    }
    return grouped
  }, [bonusScores])

  // Category subtotals
  const categorySubtotals = useMemo(() => {
    const subtotals = new Map<string, number>()
    for (const [category, entries] of groupedBonuses) {
      subtotals.set(category, entries.reduce((sum, e) => sum + e.points_earned, 0))
    }
    return subtotals
  }, [groupedBonuses])

  const rank = entry.current_rank
  const playerName = entry.users?.full_name || entry.users?.username || 'Unknown Player'
  const username = entry.users?.username
  const entryName = entry.entry_name

  // Total PSO points across all stages
  const totalPsoPoints = useMemo(() => {
    let total = 0
    for (const s of stageStats.values()) total += s.pso
    return total
  }, [stageStats])

  const exportCsv = useCallback(() => {
    const esc = (v: string | number) => {
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }

    const lines: string[] = []

    // Summary
    lines.push('POINTS SUMMARY')
    lines.push(`Player,${esc(playerName)}`)
    if (isMultiEntry) lines.push(`Entry,${esc(entryName)}`)
    if (rank) lines.push(`Rank,${rank}`)
    lines.push(`Match Points,${matchPoints}`)
    lines.push(`Bonus Points,${bonusPoints}`)
    lines.push(`Total Points,${totalPoints}`)
    lines.push('')

    // Match Points
    if (matchDetails.length > 0) {
      lines.push('MATCH POINTS BREAKDOWN')
      lines.push('Match #,Stage,Home Team,Away Team,Predicted,Actual,Type,Base Pts,Multiplier,PSO Pts,Total Pts')
      for (const d of matchDetails) {
        lines.push([
          d.matchNumber,
          esc(STAGE_LABELS[d.stage] ?? d.stage),
          esc(d.homeTeam),
          esc(d.awayTeam),
          `${d.predictedHome}-${d.predictedAway}`,
          `${d.actualHome}-${d.actualAway}`,
          esc(TYPE_LABELS[d.type] ?? d.type),
          d.basePoints,
          d.multiplier,
          d.psoPoints,
          d.points,
        ].join(','))
      }
      lines.push('')

      // Stage subtotals
      lines.push('STAGE SUBTOTALS')
      lines.push('Stage,Exact,W+GD,Winner,Miss,PSO Pts,Total Pts')
      for (const stage of ['group', 'round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']) {
        const stats = stageStats.get(stage)
        if (!stats) continue
        lines.push([
          esc(STAGE_LABELS[stage] ?? stage),
          stats.exact,
          stats.winnerGd,
          stats.winner,
          stats.miss,
          stats.pso,
          stats.total,
        ].join(','))
      }
      lines.push('')
    }

    // Bonus Points
    if (bonusScores.length > 0) {
      lines.push('BONUS POINTS BREAKDOWN')
      lines.push('Category,Description,Points')
      for (const category of BONUS_CATEGORY_ORDER) {
        const entries = groupedBonuses.get(category)
        if (!entries || entries.length === 0) continue
        const config = BONUS_CATEGORY_CONFIG[category]
        for (const bs of entries) {
          lines.push([
            esc(config.label),
            esc(bs.description),
            bs.points_earned,
          ].join(','))
        }
      }
      lines.push('')
    }

    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const safeName = (isMultiEntry ? entryName : playerName).replace(/[^a-zA-Z0-9]/g, '_')
    a.href = url
    a.download = `points_breakdown_${safeName}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [playerName, entryName, isMultiEntry, rank, matchPoints, bonusPoints, totalPoints, matchDetails, stageStats, bonusScores, groupedBonuses])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="points-breakdown-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-surface rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-lg w-full sm:mx-4 max-h-[85vh] flex flex-col dark:shadow-none dark:border dark:border-border-default">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-neutral-100 dark:border-border-default flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {rank && (
              <span className="text-2xl font-bold text-primary-600 flex-shrink-0 bg-primary-50 rounded-lg px-2.5 py-1">#{rank}</span>
            )}
            <div className="min-w-0">
              {isMultiEntry ? (
                <>
                  <h2 id="points-breakdown-title" className="text-lg font-bold text-neutral-900 truncate">{entryName}</h2>
                  <div className="text-sm text-neutral-500 truncate">
                    {playerName}
                    {username && entry.users?.full_name && ` (@${username})`}
                  </div>
                </>
              ) : (
                <>
                  <h2 id="points-breakdown-title" className="text-lg font-bold text-neutral-900 truncate">{playerName}</h2>
                  {username && (
                    <div className="text-sm text-neutral-500 truncate">
                      @{username}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={exportCsv}
              className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              aria-label="Export CSV"
              title="Export as CSV"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-5">
          {/* Total summary */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-primary-50 rounded-lg p-3 text-center">
              <div className="text-[11px] sm:text-xs font-medium text-primary-600 uppercase tracking-wide">Match</div>
              <div className="text-xl sm:text-2xl font-bold text-primary-700 mt-1">{formatNumber(matchPoints)}</div>
            </div>
            <div className="bg-success-50 rounded-lg p-3 text-center">
              <div className="text-[11px] sm:text-xs font-medium text-success-600 uppercase tracking-wide">Bonus</div>
              <div className="text-xl sm:text-2xl font-bold text-success-700 mt-1">{formatNumber(bonusPoints)}</div>
            </div>
            <div className="bg-neutral-50 rounded-lg p-3 text-center border-2 border-neutral-200">
              <div className="text-[11px] sm:text-xs font-medium text-neutral-600 uppercase tracking-wide">Total</div>
              <div className="text-xl sm:text-2xl font-bold text-neutral-900 mt-1">{formatNumber(totalPoints)}</div>
            </div>
          </div>

          {/* ========================================== */}
          {/* MATCH POINTS BREAKDOWN                     */}
          {/* ========================================== */}
          <div>
            <h3 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-3 pb-2 border-b border-neutral-100 dark:border-border-default">
              Match Points Breakdown
            </h3>

            {matchDetails.length === 0 ? (
              <div className="text-center py-6 bg-neutral-50 rounded-lg">
                <div className="text-neutral-400 text-sm">No completed matches with predictions yet</div>
              </div>
            ) : (
              <div className="space-y-3">
                {renderMatchStageSection('group')}
                {renderMatchStageSection('round_32')}
                {renderMatchStageSection('round_16')}
                {renderMatchStageSection('quarter_final')}
                {renderMatchStageSection('semi_final')}
                {renderMatchStageSection('third_place')}
                {renderMatchStageSection('final')}

                {totalPsoPoints > 0 && (
                  <div className="bg-accent-50 rounded-lg px-3 py-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-accent-700">Penalty Shootout Bonus (included above)</span>
                      <span className="text-xs font-bold text-accent-700">+{formatNumber(totalPsoPoints)} pts</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ========================================== */}
          {/* BONUS POINTS BREAKDOWN                     */}
          {/* ========================================== */}
          <div>
            <h3 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-3 pb-2 border-b border-neutral-100 dark:border-border-default">
              Bonus Points Breakdown
            </h3>

            {bonusScores.length === 0 ? (
              <div className="text-center py-6 bg-neutral-50 rounded-lg">
                <div className="text-neutral-400 text-sm">No bonus points earned yet</div>
                <div className="text-neutral-400 text-xs mt-1">
                  Bonus points are calculated as tournament stages complete
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {BONUS_CATEGORY_ORDER.map((category) => {
                  const entries = groupedBonuses.get(category)
                  if (!entries || entries.length === 0) return null
                  const subtotal = categorySubtotals.get(category) ?? 0
                  const config = BONUS_CATEGORY_CONFIG[category]

                  return (
                    <div key={category} className="border border-neutral-200 dark:border-border-default rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-neutral-50">
                        <span className="text-xs font-semibold text-neutral-900">
                          {config.label}
                        </span>
                        <span className="text-xs font-bold text-neutral-900 flex-shrink-0">
                          {formatNumber(subtotal)} pts
                        </span>
                      </div>
                      <div className="divide-y divide-neutral-100 dark:divide-border-default">
                        {entries.map((bs, i) => (
                          <div
                            key={`${bs.bonus_type}-${bs.related_group_letter}-${bs.related_match_id}-${i}`}
                            className="flex items-start justify-between px-3 py-2 text-xs"
                          >
                            <span className="text-neutral-700 pr-3 leading-snug">
                              {bs.description}
                            </span>
                            <span className="text-success-600 font-semibold flex-shrink-0">
                              +{formatNumber(bs.points_earned)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ========================================== */}
          {/* SCORING RULES REFERENCE                    */}
          {/* ========================================== */}
          <div>
            <h3 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-3 pb-2 border-b border-neutral-100 dark:border-border-default">
              Scoring Rules Reference
            </h3>

            <div className="space-y-3">
              {/* Group Stage Rules */}
              <div className="border border-neutral-200 dark:border-border-default rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-neutral-50">
                  <span className="text-xs font-semibold text-neutral-900">Group Stage</span>
                </div>
                <div className="divide-y divide-neutral-100 dark:divide-border-default">
                  <PointsRow label="Exact Score" value={poolSettings.group_exact_score} />
                  <PointsRow label="Correct Winner + Goal Diff" value={poolSettings.group_correct_difference} />
                  <PointsRow label="Correct Result Only" value={poolSettings.group_correct_result} />
                </div>
              </div>

              {/* Knockout Stage Rules */}
              <div className="border border-neutral-200 dark:border-border-default rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-neutral-50">
                  <span className="text-xs font-semibold text-neutral-900">Knockout Stage (Base)</span>
                </div>
                <div className="divide-y divide-neutral-100 dark:divide-border-default">
                  <PointsRow label="Exact Score" value={poolSettings.knockout_exact_score} />
                  <PointsRow label="Correct Winner + Goal Diff" value={poolSettings.knockout_correct_difference} />
                  <PointsRow label="Correct Result Only" value={poolSettings.knockout_correct_result} />
                </div>
              </div>

              {/* Multipliers */}
              <div className="border border-neutral-200 dark:border-border-default rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-neutral-50">
                  <span className="text-xs font-semibold text-neutral-900">Round Multipliers</span>
                </div>
                <div className="divide-y divide-neutral-100 dark:divide-border-default">
                  <PointsRow label="Round of 16" value={`${poolSettings.round_16_multiplier}x`} suffix="" />
                  <PointsRow label="Quarter Finals" value={`${poolSettings.quarter_final_multiplier}x`} suffix="" />
                  <PointsRow label="Semi Finals" value={`${poolSettings.semi_final_multiplier}x`} suffix="" />
                  <PointsRow label="Third Place" value={`${poolSettings.third_place_multiplier}x`} suffix="" />
                  <PointsRow label="Final" value={`${poolSettings.final_multiplier}x`} suffix="" />
                </div>
              </div>

              {/* PSO Rules */}
              {poolSettings.pso_enabled && (
                <div className="border border-neutral-200 dark:border-border-default rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-neutral-50">
                    <span className="text-xs font-semibold text-neutral-900">Penalty Shootout (Bonus)</span>
                  </div>
                  <div className="divide-y divide-neutral-100 dark:divide-border-default">
                    <PointsRow label="Exact PSO Score" value={poolSettings.pso_exact_score} />
                    <PointsRow label="Correct PSO Winner + GD" value={poolSettings.pso_correct_difference} />
                    <PointsRow label="Correct PSO Winner Only" value={poolSettings.pso_correct_result} />
                  </div>
                </div>
              )}

              {/* Bonus Rules */}
              <div className="border border-neutral-200 dark:border-border-default rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-neutral-50">
                  <span className="text-xs font-semibold text-neutral-900">Bonus Points (per group / per match)</span>
                </div>
                <div className="divide-y divide-neutral-100 dark:divide-border-default">
                  <PointsRow label="Winner AND Runner-up correct" value={poolSettings.bonus_group_winner_and_runnerup ?? 0} />
                  <PointsRow label="Winner only correct" value={poolSettings.bonus_group_winner_only ?? 0} />
                  <PointsRow label="Runner-up only correct" value={poolSettings.bonus_group_runnerup_only ?? 0} />
                  <PointsRow label="Both qualify, positions swapped" value={poolSettings.bonus_both_qualify_swapped ?? 0} />
                  <PointsRow label="One qualifies, wrong position" value={poolSettings.bonus_one_qualifies_wrong_position ?? 0} />
                  <PointsRow label="Correct bracket pairing" value={poolSettings.bonus_correct_bracket_pairing ?? 0} />
                  <PointsRow label="Correct match winner" value={poolSettings.bonus_match_winner_correct ?? 0} />
                  <PointsRow label="Champion correct" value={poolSettings.bonus_champion_correct ?? 0} />
                  <PointsRow label="Runner-up correct" value={poolSettings.bonus_second_place_correct ?? 0} />
                  <PointsRow label="Third place correct" value={poolSettings.bonus_third_place_correct ?? 0} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // =============================================
  // RENDER HELPERS
  // =============================================

  function renderMatchStageSection(stage: string) {
    const details = matchesByStage.get(stage)
    if (!details || details.length === 0) return null
    const stats = stageStats.get(stage)!
    const label = STAGE_LABELS[stage] ?? stage
    const isKnockout = stage !== 'group'

    return (
      <div key={stage} className="border border-neutral-200 dark:border-border-default rounded-lg overflow-hidden">
        {/* Stage header */}
        <div className="flex items-center justify-between px-3 py-2 bg-neutral-50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-900">{label}</span>
            {isKnockout && (
              <span className="text-[10px] text-neutral-500">
                ({details[0].multiplier}x)
              </span>
            )}
          </div>
          <span className="text-xs font-bold text-neutral-900">
            {formatNumber(stats.total)} pts
          </span>
        </div>

        {/* Hit type summary bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-100 dark:border-border-default">
          {stats.exact > 0 && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_COLORS.exact.bg} ${TYPE_COLORS.exact.text}`}>
              {stats.exact} Exact
            </span>
          )}
          {stats.winnerGd > 0 && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_COLORS.winner_gd.bg} ${TYPE_COLORS.winner_gd.text}`}>
              {stats.winnerGd} W+GD
            </span>
          )}
          {stats.winner > 0 && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_COLORS.winner.bg} ${TYPE_COLORS.winner.text}`}>
              {stats.winner} Winner
            </span>
          )}
          {stats.miss > 0 && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_COLORS.miss.bg} ${TYPE_COLORS.miss.text}`}>
              {stats.miss} Miss
            </span>
          )}
        </div>

        {/* Individual match rows */}
        <div className="divide-y divide-neutral-100 dark:divide-border-default">
          {details.map((d) => (
            <div key={d.matchNumber} className="flex items-center justify-between px-3 py-1.5 text-xs">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* Type badge */}
                <span className={`flex-shrink-0 text-[10px] font-medium w-10 text-center py-0.5 rounded ${TYPE_COLORS[d.type].bg} ${TYPE_COLORS[d.type].text}`}>
                  {TYPE_LABELS[d.type]}
                </span>
                {/* Teams & scores */}
                <span className="truncate">
                  <span className="text-neutral-900 font-medium">{d.predictedHome}-{d.predictedAway}</span>
                  <span className="text-neutral-400 mx-1">vs</span>
                  <span className="text-neutral-500">{d.actualHome}-{d.actualAway}</span>
                  <span className="text-neutral-500 ml-1.5">{d.homeTeam} v {d.awayTeam}</span>
                </span>
              </div>
              <span className={`flex-shrink-0 font-semibold ml-2 ${d.points > 0 ? 'text-success-600' : 'text-neutral-400'}`}>
                {d.points > 0 ? `+${formatNumber(d.points)}` : '0'}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
}
