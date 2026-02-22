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
  home_score_pso: number | null
  away_score_pso: number | null
  home_team_placeholder: string | null
  away_team_placeholder: string | null
  home_team_id: string | null
  away_team_id: string | null
  home_team: { country_name: string; country_code: string } | null
  away_team: { country_name: string; country_code: string } | null
  prediction: {
    predicted_home_score: number
    predicted_away_score: number
    predicted_home_pso: number | null
    predicted_away_pso: number | null
    predicted_winner_team_id: string | null
  } | null
  // Predicted teams for knockout matches (resolved from user's bracket)
  predicted_home_team_name: string | null
  predicted_away_team_name: string | null
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
      return 'bg-accent-50/60'
    case 'winner_gd':
    case 'winner':
      return 'bg-success-50/60'
    case 'miss':
      return 'bg-danger-50/40'
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

  const hasPsoScores =
    match.home_score_pso !== null && match.away_score_pso !== null

  // Calculate points for completed and live matches with actual scores and a prediction
  let pointsResult: PointsResult | null = null
  if ((isCompleted || isLive) && hasActualScores && hasPrediction) {
    pointsResult = calculatePoints(
      match.prediction!.predicted_home_score,
      match.prediction!.predicted_away_score,
      match.home_score_ft!,
      match.away_score_ft!,
      match.stage,
      poolSettings,
      hasPsoScores
        ? {
            actualHomePso: match.home_score_pso!,
            actualAwayPso: match.away_score_pso!,
            predictedHomePso: match.prediction!.predicted_home_pso,
            predictedAwayPso: match.prediction!.predicted_away_pso,
          }
        : undefined
    )
  }

  const homeName =
    match.home_team?.country_name || match.home_team_placeholder || 'TBD'
  const awayName =
    match.away_team?.country_name || match.away_team_placeholder || 'TBD'

  const isKnockout = match.stage !== 'group'

  return (
    <div
      className={`rounded-lg shadow border border-neutral-200 overflow-hidden ${getCardBackground(pointsResult)}`}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100 bg-neutral-50/80">
        {/* Stage + match number */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-primary-700 bg-primary-100 px-2 py-0.5 rounded-full">
            {getStageLabel(match.stage, match.group_letter)}
          </span>
          <span className="text-xs text-neutral-500">#{match.match_number}</span>
        </div>

        {/* Date */}
        <span className="text-xs text-neutral-600 hidden sm:block">
          {formatDate(match.match_date)}
        </span>

        {/* Status badge */}
        {isCompleted && (
          <span className="text-xs font-semibold text-success-700 bg-success-100 px-2 py-0.5 rounded-full">
            Final
          </span>
        )}
        {isLive && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger-700 bg-danger-100 px-2 py-0.5 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-danger-500" />
            </span>
            LIVE
          </span>
        )}
        {!isCompleted && !isLive && (
          <span className="text-xs font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full">
            Upcoming
          </span>
        )}
      </div>

      {/* ── Date (mobile only) ── */}
      <div className="px-4 pt-2 sm:hidden">
        <span className="text-xs text-neutral-600">
          {formatDate(match.match_date)}
        </span>
      </div>

      {/* ── Main: Teams + Score ── */}
      <div className="px-3 sm:px-4 py-3 sm:py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 sm:gap-2">
          {/* Home team */}
          <div className="text-right">
            <p className="text-sm sm:text-base font-bold text-neutral-900 leading-tight">
              {homeName}
            </p>
            {hasPrediction ? (
              <div className="mt-1">
                {isKnockout ? (
                  <>
                    <p className="text-xs text-neutral-400">
                      {match.predicted_home_team_name ? match.predicted_home_team_name + ' ' : ''}
                      <span className="font-semibold">{match.prediction!.predicted_home_score}</span>
                    </p>
                    {hasPsoScores && match.prediction!.predicted_home_pso != null && (
                      <p className="text-xs text-neutral-400">
                        PSO: <span className="font-semibold">{match.prediction!.predicted_home_pso}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-neutral-500">
                    Your prediction{' '}
                    <span className="font-semibold text-neutral-600">
                      {match.prediction!.predicted_home_score}
                    </span>
                  </p>
                )}
              </div>
            ) : isCompleted ? (
              <p className="text-xs text-neutral-400 italic mt-1">No prediction</p>
            ) : null}
          </div>

          {/* Score */}
          <div className="text-center px-3">
            {hasActualScores ? (
              <div>
                <p className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tabular-nums">
                  {match.home_score_ft}{' '}
                  <span className="text-neutral-400">-</span>{' '}
                  {match.away_score_ft}
                </p>
                {hasPsoScores && (
                  <p className="text-xs font-semibold text-accent-500 mt-0.5">
                    PSO: {match.home_score_pso} - {match.away_score_pso}
                  </p>
                )}
              </div>
            ) : isCompleted ? (
              <p className="text-sm text-neutral-500 italic">Result pending</p>
            ) : hasPrediction ? (
              <p className="text-lg sm:text-xl font-bold text-neutral-400 tabular-nums">
                {match.prediction!.predicted_home_score}{' '}
                <span className="text-neutral-200">-</span>{' '}
                {match.prediction!.predicted_away_score}
              </p>
            ) : (
              <p className="text-lg font-bold text-neutral-200">vs</p>
            )}
          </div>

          {/* Away team */}
          <div className="text-left">
            <p className="text-sm sm:text-base font-bold text-neutral-900 leading-tight">
              {awayName}
            </p>
            {hasPrediction ? (
              <div className="mt-1">
                {isKnockout ? (
                  <>
                    <p className="text-xs text-neutral-400">
                      <span className="font-semibold">{match.prediction!.predicted_away_score}</span>
                      {match.predicted_away_team_name ? ' ' + match.predicted_away_team_name : ''}
                    </p>
                    {hasPsoScores && match.prediction!.predicted_away_pso != null && (
                      <p className="text-xs text-neutral-400">
                        <span className="font-semibold">{match.prediction!.predicted_away_pso}</span> PSO
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-neutral-500">
                    <span className="font-semibold text-neutral-600">
                      {match.prediction!.predicted_away_score}
                    </span>
                    {' '}Your prediction
                  </p>
                )}
              </div>
            ) : isCompleted ? (
              <p className="text-xs text-neutral-400 italic mt-1">No prediction</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      {(match.venue || pointsResult || ((isCompleted || isLive) && !hasPrediction)) && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-neutral-100">
          <span className="text-xs text-neutral-500 truncate max-w-[60%]">
            {match.venue || ''}
          </span>
          <div>
            {pointsResult ? (
              <PointsBadge result={pointsResult} />
            ) : (isCompleted || isLive) && !hasPrediction ? (
              <span className="text-xs text-neutral-500 italic">
                No prediction
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
