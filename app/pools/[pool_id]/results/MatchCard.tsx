'use client'

import { calculatePoints, type PointsResult, type PoolSettings } from './points'
import { PointsBadge } from './PointsBadge'
import { STAGE_LABELS } from '@/lib/tournament'

// =============================================
// TYPES
// =============================================
export type ResultMatch = {
  match_id: string
  match_number: number
  stage: string
  group_letter: string | null
  match_date: string
  venue: string | null
  status: string
  home_score_ft: number | null
  away_score_ft: number | null
  home_team_placeholder: string | null
  away_team_placeholder: string | null
  home_team: { country_name: string; country_code: string } | null
  away_team: { country_name: string; country_code: string } | null
  prediction: {
    predicted_home_score: number
    predicted_away_score: number
  } | null
}

// =============================================
// HELPERS
// =============================================
function getStageLabel(stage: string, groupLetter: string | null): string {
  if (stage === 'group' && groupLetter) return `Group ${groupLetter}`
  if (stage === 'third_place') return 'Third Place'
  if (stage === 'final') return 'Final'
  return STAGE_LABELS[stage] || stage
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getCardBackground(result: PointsResult | null): string {
  if (!result) return 'bg-white'
  switch (result.type) {
    case 'exact':
      return 'bg-yellow-50/60'
    case 'winner_gd':
    case 'winner':
      return 'bg-green-50/60'
    case 'miss':
      return 'bg-red-50/40'
  }
}

// =============================================
// COMPONENT
// =============================================
export function MatchCard({
  match,
  poolSettings,
}: {
  match: ResultMatch
  poolSettings: PoolSettings
}) {
  const isCompleted = match.status === 'completed'
  const isLive = match.status === 'live'
  const hasActualScores =
    match.home_score_ft !== null && match.away_score_ft !== null
  const hasPrediction = match.prediction !== null

  // Calculate points only for completed matches with actual scores and a prediction
  let pointsResult: PointsResult | null = null
  if (isCompleted && hasActualScores && hasPrediction) {
    pointsResult = calculatePoints(
      match.prediction!.predicted_home_score,
      match.prediction!.predicted_away_score,
      match.home_score_ft!,
      match.away_score_ft!,
      match.stage,
      poolSettings
    )
  }

  const homeName =
    match.home_team?.country_name || match.home_team_placeholder || 'TBD'
  const awayName =
    match.away_team?.country_name || match.away_team_placeholder || 'TBD'

  return (
    <div
      className={`rounded-lg shadow border border-gray-200 overflow-hidden ${getCardBackground(pointsResult)}`}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/80">
        {/* Stage + match number */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
            {getStageLabel(match.stage, match.group_letter)}
          </span>
          <span className="text-xs text-gray-400">#{match.match_number}</span>
        </div>

        {/* Date */}
        <span className="text-xs text-gray-500 hidden sm:block">
          {formatDate(match.match_date)}
        </span>

        {/* Status badge */}
        {isCompleted && (
          <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            Final
          </span>
        )}
        {isLive && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            LIVE
          </span>
        )}
        {!isCompleted && !isLive && (
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            Upcoming
          </span>
        )}
      </div>

      {/* ── Date (mobile only) ── */}
      <div className="px-4 pt-2 sm:hidden">
        <span className="text-xs text-gray-500">
          {formatDate(match.match_date)}
        </span>
      </div>

      {/* ── Main: Teams + Score ── */}
      <div className="px-4 py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {/* Home team */}
          <div className="text-right">
            <p className="text-sm sm:text-base font-bold text-gray-900 leading-tight">
              {homeName}
            </p>
            {hasPrediction ? (
              <p className="text-xs text-gray-400 mt-1">
                Your prediction:{' '}
                <span className="font-semibold text-gray-600">
                  {match.prediction!.predicted_home_score}
                </span>
              </p>
            ) : isCompleted ? (
              <p className="text-xs text-gray-300 italic mt-1">No prediction</p>
            ) : null}
          </div>

          {/* Score */}
          <div className="text-center px-3">
            {hasActualScores ? (
              <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 tabular-nums">
                {match.home_score_ft}{' '}
                <span className="text-gray-300">-</span>{' '}
                {match.away_score_ft}
              </p>
            ) : isCompleted ? (
              <p className="text-sm text-gray-400 italic">Result pending</p>
            ) : hasPrediction ? (
              <p className="text-lg sm:text-xl font-bold text-gray-300 tabular-nums">
                {match.prediction!.predicted_home_score}{' '}
                <span className="text-gray-200">-</span>{' '}
                {match.prediction!.predicted_away_score}
              </p>
            ) : (
              <p className="text-lg font-bold text-gray-200">vs</p>
            )}
          </div>

          {/* Away team */}
          <div className="text-left">
            <p className="text-sm sm:text-base font-bold text-gray-900 leading-tight">
              {awayName}
            </p>
            {hasPrediction ? (
              <p className="text-xs text-gray-400 mt-1">
                Your prediction:{' '}
                <span className="font-semibold text-gray-600">
                  {match.prediction!.predicted_away_score}
                </span>
              </p>
            ) : isCompleted ? (
              <p className="text-xs text-gray-300 italic mt-1">No prediction</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Footer (completed matches only) ── */}
      {isCompleted && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100">
          <span className="text-xs text-gray-400 truncate max-w-[60%]">
            {match.venue || ''}
          </span>
          <div>
            {pointsResult ? (
              <PointsBadge result={pointsResult} />
            ) : !hasPrediction ? (
              <span className="text-xs text-gray-300 italic">
                No prediction
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
