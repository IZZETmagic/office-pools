'use client'

import { calculatePoints, checkKnockoutTeamsMatch, type PointsResult, type PoolSettings } from './points'
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
  home_team: { country_name: string; country_code: string; flag_url: string | null } | null
  away_team: { country_name: string; country_code: string; flag_url: string | null } | null
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
  predicted_home_team_id: string | null
  predicted_away_team_id: string | null
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

function countryCodeToEmoji(code: string): string {
  if (!code) return ''
  const upper = code.toUpperCase()
  const offset = 0x1f1e6
  const a = 'A'.charCodeAt(0)
  return String.fromCodePoint(upper.charCodeAt(0) - a + offset, upper.charCodeAt(1) - a + offset)
}

function getLeftBorderColor(result: PointsResult | null, isUpcoming: boolean): string {
  if (!result) return isUpcoming ? 'border-l-warning-400' : 'border-l-neutral-300 dark:border-l-neutral-600'
  switch (result.type) {
    case 'exact':
      return 'border-l-success-500'
    case 'winner_gd':
    case 'winner':
      return 'border-l-primary-500'
    case 'miss':
      return 'border-l-danger-500'
  }
}

function getCardBorder(result: PointsResult | null): string {
  if (result?.type === 'exact') {
    return 'border-success-300 dark:border-success-700'
  }
  return 'border-border-default'
}

// =============================================
// COMPONENT
// =============================================
export function MatchCard({
  match,
  poolSettings,
  predictionMode,
  index = 0,
}: {
  match: ResultMatch
  poolSettings: PoolSettings
  predictionMode: 'full_tournament' | 'progressive' | 'bracket_picker'
  index?: number
}) {
  const isCompleted = match.status === 'completed'
  const isLive = match.status === 'live'
  const isUpcoming = !isCompleted && !isLive
  const hasActualScores =
    match.home_score_ft !== null && match.away_score_ft !== null
  const hasPrediction = match.prediction !== null

  const hasPsoScores =
    match.home_score_pso !== null && match.away_score_pso !== null

  // Knockout bracket prediction display (full_tournament only)
  const isKnockout = match.stage !== 'group'
  const showBracketTeams = predictionMode === 'full_tournament' && isKnockout &&
    (match.predicted_home_team_name != null || match.predicted_away_team_name != null)

  // Check if predicted teams match actual teams (only when both are known)
  const hasActualTeams = match.home_team_id != null && match.away_team_id != null
  const knockoutTeamsCorrect = showBracketTeams && hasActualTeams
    ? checkKnockoutTeamsMatch(
        match.stage,
        match.home_team_id,
        match.away_team_id,
        match.predicted_home_team_id,
        match.predicted_away_team_id,
      )
    : null // null = can't determine yet (upcoming / TBD teams)

  // Calculate points for completed and live matches with actual scores and a prediction
  let pointsResult: PointsResult | null = null
  if ((isCompleted || isLive) && hasActualScores && hasPrediction) {
    const teamsMatch = checkKnockoutTeamsMatch(
      match.stage,
      match.home_team_id,
      match.away_team_id,
      match.predicted_home_team_id,
      match.predicted_away_team_id,
    )
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
        : undefined,
      teamsMatch,
    )
  }

  const homeName =
    match.home_team?.country_name || match.home_team_placeholder || 'TBD'
  const awayName =
    match.away_team?.country_name || match.away_team_placeholder || 'TBD'
  const homeFlagUrl = match.home_team?.flag_url ?? null
  const awayFlagUrl = match.away_team?.flag_url ?? null
  const homeCode = match.home_team?.country_code ?? ''
  const awayCode = match.away_team?.country_code ?? ''

  // Build prediction display string
  let predictionDisplay: string | null = null
  if (hasPrediction) {
    predictionDisplay = `${match.prediction!.predicted_home_score} - ${match.prediction!.predicted_away_score}`
  }

  return (
    <div
      className={`rounded-[14px] bg-surface border ${getCardBorder(pointsResult)} border-l-[3px] ${getLeftBorderColor(pointsResult, isUpcoming)} overflow-hidden animate-fade-up`}
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      {/* ── Top Row: Stage label + Badge/Points ── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {getStageLabel(match.stage, match.group_letter)} · Match #{match.match_number}
        </span>
        <div>
          {pointsResult ? (
            <PointsBadge result={pointsResult} />
          ) : isLive ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-danger-500" />
              </span>
              LIVE
            </span>
          ) : isUpcoming ? (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400">
              Pending
            </span>
          ) : (isCompleted && !hasPrediction) ? (
            <span className="text-[10px] italic text-neutral-400 dark:text-neutral-500">No prediction</span>
          ) : null}
        </div>
      </div>

      {/* ── Middle Row: Teams + Score ── */}
      <div className="px-4 py-2">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {/* Home team */}
          <div className="flex items-center gap-2 min-w-0">
            {homeFlagUrl ? (
              <img src={homeFlagUrl} alt={homeName} className="w-6 h-4 rounded-[2px] object-cover shrink-0" />
            ) : homeCode ? (
              <span className="text-sm leading-none shrink-0">{countryCodeToEmoji(homeCode)}</span>
            ) : null}
            <span className="text-sm font-semibold text-neutral-800 dark:text-white truncate">
              {homeName}
            </span>
          </div>

          {/* Score */}
          <div className="text-center">
            {hasActualScores ? (
              <div>
                <div className="inline-flex items-center gap-1 bg-neutral-100 dark:bg-neutral-400 rounded-lg px-3 py-1">
                  <span className="text-lg font-extrabold text-neutral-900 dark:text-neutral-800 tabular-nums">
                    {match.home_score_ft}
                  </span>
                  <span className="text-lg font-extrabold text-neutral-400 dark:text-neutral-800">-</span>
                  <span className="text-lg font-extrabold text-neutral-900 dark:text-neutral-800 tabular-nums">
                    {match.away_score_ft}
                  </span>
                </div>
                {hasPsoScores && (
                  <p className="text-[10px] font-semibold text-accent-500 mt-0.5">
                    PSO: {match.home_score_pso} - {match.away_score_pso}
                  </p>
                )}
              </div>
            ) : (
              <span className="text-sm font-medium text-neutral-300 dark:text-neutral-600">vs</span>
            )}
          </div>

          {/* Away team */}
          <div className="flex items-center justify-end gap-2 min-w-0">
            <span className="text-sm font-semibold text-neutral-800 dark:text-white truncate">
              {awayName}
            </span>
            {awayFlagUrl ? (
              <img src={awayFlagUrl} alt={awayName} className="w-6 h-4 rounded-[2px] object-cover shrink-0" />
            ) : awayCode ? (
              <span className="text-sm leading-none shrink-0">{countryCodeToEmoji(awayCode)}</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Bottom Row: Prediction + Date ── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border-default">
        <div className="text-xs text-neutral-400 dark:text-neutral-500 min-w-0">
          {hasPrediction && showBracketTeams ? (
            <span>
              Your prediction:{' '}
              <span className="font-semibold text-neutral-600 dark:text-neutral-300">
                {match.predicted_home_team_name || '?'}
              </span>
              {' '}
              <span className="font-semibold tabular-nums text-neutral-600 dark:text-neutral-300">
                {predictionDisplay}
              </span>
              {' '}
              <span className="font-semibold text-neutral-600 dark:text-neutral-300">
                {match.predicted_away_team_name || '?'}
              </span>
              {hasPsoScores &&
                match.prediction!.predicted_home_pso != null &&
                match.prediction!.predicted_away_pso != null && (
                  <span className="text-neutral-400 dark:text-neutral-500">
                    {' '}(PSO: {match.prediction!.predicted_home_pso}-{match.prediction!.predicted_away_pso})
                  </span>
                )}
            </span>
          ) : !hasPrediction && showBracketTeams ? (
            <span>
              Your bracket:{' '}
              <span className="font-semibold text-neutral-600 dark:text-neutral-300">
                {match.predicted_home_team_name || '?'} vs {match.predicted_away_team_name || '?'}
              </span>
            </span>
          ) : hasPrediction ? (
            <span>
              Your prediction:{' '}
              <span className="font-semibold tabular-nums text-neutral-600 dark:text-neutral-300">
                {predictionDisplay}
              </span>
              {hasPsoScores &&
                match.prediction!.predicted_home_pso != null &&
                match.prediction!.predicted_away_pso != null && (
                  <span className="text-neutral-400 dark:text-neutral-500">
                    {' '}(PSO: {match.prediction!.predicted_home_pso}-{match.prediction!.predicted_away_pso})
                  </span>
                )}
            </span>
          ) : (isCompleted || isLive) ? (
            <span className="italic">No prediction</span>
          ) : null}
        </div>
        <span className="text-xs text-neutral-400 dark:text-neutral-500 whitespace-nowrap ml-2">
          {formatDate(match.match_date)}
        </span>
      </div>
    </div>
  )
}
