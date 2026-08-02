'use client'

import { checkKnockoutTeamsMatch, type PointsResult, type PoolSettings } from './points'
import { PointsBadge } from './PointsBadge'
import { STAGE_LABELS } from '@/lib/tournament'
import { LocalTime } from '@/components/LocalTime'
import { getLiveClock, getMatchStatusBadge } from '@/lib/matchStatus'
import type { MatchScoreData } from '../types'

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
  status_detail: string | null
  original_match_date: string | null
  live_minute: number | null
  live_period: string | null
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

function formatDate(d: Date): string {
  const month = d.toLocaleString('en-US', { month: 'short' })
  const day = d.getDate()
  const hour = d.getHours()
  const minute = d.getMinutes().toString().padStart(2, '0')
  const period = hour >= 12 ? 'PM' : 'AM'
  const h = hour % 12 || 12
  return `${month} ${day}, ${h}:${minute} ${period}`
}

/**
  * ISO-3166 alpha-2 only. `teams.country_code` holds 3-letter FIFA codes
  * (ALG, AUT, BIH), and taking their first two letters yields the wrong
  * nation — Albania for Algeria, Burundi for Bosnia — so anything that is not
  * exactly two characters returns empty and the caller falls back to flag_url.
  */
function countryCodeToEmoji(code: string): string {
  if (!code) return ''
  const upper = code.toUpperCase()
  if (upper.length !== 2) return ''
  const offset = 0x1f1e6
  const a = 'A'.charCodeAt(0)
  return String.fromCodePoint(upper.charCodeAt(0) - a + offset, upper.charCodeAt(1) - a + offset)
}

function getLeftBorderColor(result: PointsResult | null, isUpcoming: boolean): string {
  if (!result) return isUpcoming ? 'border-l-warning-400' : 'border-l-silver'
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

/**
 * Points come from stored match_scores, never recomputed here — see the scoring
 * architecture rule. Shared by the card and the table row so the two can never
 * disagree about what a match was worth.
 */
function derivePointsResult(storedScore: MatchScoreData | null | undefined): PointsResult | null {
  if (!storedScore) return null
  return {
    points: storedScore.total_points,
    basePoints: storedScore.base_points,
    multiplier: storedScore.multiplier,
    label: storedScore.score_type,
    type: storedScore.score_type,
    pso: storedScore.pso_points > 0
      ? { psoPoints: storedScore.pso_points, psoType: storedScore.score_type }
      : undefined,
  }
}

// =============================================
// COMPONENT
// =============================================
export function MatchCard({
  match,
  poolSettings,
  predictionMode,
  index = 0,
  storedScore,
}: {
  match: ResultMatch
  poolSettings: PoolSettings
  predictionMode: 'full_tournament' | 'progressive' | 'bracket_picker'
  index?: number
  storedScore?: MatchScoreData | null
}) {
  const isCompleted = match.status === 'completed'
  const isLive = match.status === 'live'
  const isUpcoming = !isCompleted && !isLive
  const hasActualScores =
    match.home_score_ft !== null && match.away_score_ft !== null
  const hasPrediction = match.prediction !== null

  const hasPsoScores =
    match.home_score_pso !== null && match.away_score_pso !== null

  // Live clock ("45'" / HT / ET / PENS) and exception-status badge
  // (Delayed / Postponed / Suspended / …), shared with mobile via lib/matchStatus.
  const liveClock = getLiveClock({
    status: match.status,
    livePeriod: match.live_period,
    liveMinute: match.live_minute,
  })
  const statusBadge = getMatchStatusBadge({
    status: match.status,
    statusDetail: match.status_detail,
    originalMatchDate: match.original_match_date,
  })

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

  const pointsResult = derivePointsResult(storedScore)

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
      className={`border-l-[3px] ${getLeftBorderColor(pointsResult, isUpcoming)} transition-colors hover:bg-snow animate-fade-up`}
      style={{ animationDelay: `${index * 0.03}s` }}
    >
      {/* ── Top Row: Stage label + Badge/Points ── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="t-body text-muted">
          {getStageLabel(match.stage, match.group_letter)} · Match #{match.match_number}
        </span>
        <div>
          {pointsResult ? (
            <PointsBadge result={pointsResult} />
          ) : statusBadge ? (
            <span
              className={`t-caption px-2 py-0.5 rounded-pill ${
                statusBadge.tone === 'red'
                  ? 'bg-danger-600/12 text-danger-600'
                  : 'bg-warning-500/12 text-warning-600'
              }`}
            >
              {statusBadge.label}
            </span>
          ) : isLive ? (
            <span className="inline-flex items-center gap-1 t-caption px-2 py-0.5 rounded-pill bg-danger-600/12 text-danger-600">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-pill bg-danger-400 opacity-75" />
                <span className="relative inline-flex rounded-pill h-1.5 w-1.5 bg-danger-500" />
              </span>
              {liveClock ?? 'LIVE'}
            </span>
          ) : isUpcoming ? (
            <span className="t-caption px-2 py-0.5 rounded-pill bg-warning-500/12 text-warning-600">
              Pending
            </span>
          ) : (isCompleted && !hasPrediction) ? (
            <span className="text-[10px] italic text-muted">No prediction</span>
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
            ) : countryCodeToEmoji(homeCode) ? (
              <span className="text-sm leading-none shrink-0">{countryCodeToEmoji(homeCode)}</span>
            ) : null}
            <span className="t-card-title text-ink truncate">
              {homeName}
            </span>
          </div>

          {/* Score */}
          <div className="text-center">
            {hasActualScores ? (
              <div>
                <div className="inline-flex items-center gap-1 bg-mist rounded-chip px-3 py-1">
                  <span className="t-num t-num-extrabold text-lg text-ink">
                    {match.home_score_ft}
                  </span>
                  <span className="t-num t-num-extrabold text-lg text-muted">-</span>
                  <span className="t-num t-num-extrabold text-lg text-ink">
                    {match.away_score_ft}
                  </span>
                </div>
                {hasPsoScores && (
                  <p className="t-detail font-bold text-accent-600 mt-0.5">
                    PSO: {match.home_score_pso} - {match.away_score_pso}
                  </p>
                )}
              </div>
            ) : (
              <span className="t-body text-muted">vs</span>
            )}
          </div>

          {/* Away team */}
          <div className="flex items-center justify-end gap-2 min-w-0">
            <span className="t-card-title text-ink truncate">
              {awayName}
            </span>
            {awayFlagUrl ? (
              <img src={awayFlagUrl} alt={awayName} className="w-6 h-4 rounded-[2px] object-cover shrink-0" />
            ) : countryCodeToEmoji(awayCode) ? (
              <span className="text-sm leading-none shrink-0">{countryCodeToEmoji(awayCode)}</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Bottom Row: Prediction + Date ── */}
      <div className="flex items-center justify-between px-4 pb-3 pt-1">
        <div className="t-body text-muted min-w-0">
          {hasPrediction && showBracketTeams ? (
            <span>
              Your prediction:{' '}
              <span className="font-bold text-muted">
                {match.predicted_home_team_name || '?'}
              </span>
              {' '}
              <span className="t-num text-muted">
                {predictionDisplay}
              </span>
              {' '}
              <span className="font-bold text-muted">
                {match.predicted_away_team_name || '?'}
              </span>
              {hasPsoScores &&
                match.prediction!.predicted_home_pso != null &&
                match.prediction!.predicted_away_pso != null && (
                  <span className="text-muted">
                    {' '}(PSO: {match.prediction!.predicted_home_pso}-{match.prediction!.predicted_away_pso})
                  </span>
                )}
            </span>
          ) : !hasPrediction && showBracketTeams ? (
            <span>
              Your bracket:{' '}
              <span className="font-bold text-muted">
                {match.predicted_home_team_name || '?'} vs {match.predicted_away_team_name || '?'}
              </span>
            </span>
          ) : hasPrediction ? (
            <span>
              Your prediction:{' '}
              <span className="t-num text-muted">
                {predictionDisplay}
              </span>
              {hasPsoScores &&
                match.prediction!.predicted_home_pso != null &&
                match.prediction!.predicted_away_pso != null && (
                  <span className="text-muted">
                    {' '}(PSO: {match.prediction!.predicted_home_pso}-{match.prediction!.predicted_away_pso})
                  </span>
                )}
            </span>
          ) : (isCompleted || isLive) ? (
            <span className="italic">No prediction</span>
          ) : null}
        </div>
        <span className="t-body text-muted whitespace-nowrap ml-2">
          <LocalTime iso={match.match_date} format={formatDate} />
        </span>
      </div>
    </div>
  )
}

// =============================================
// TABLE ROW (desktop)
// =============================================
/**
 * The same match as a table row. Shares every helper with MatchCard above —
 * stage label, flags, points derivation — so the two presentations cannot drift
 * on what they say, only on how much room they say it in.
 *
 * The card stays for mobile web, where six columns do not fit.
 */
export function MatchTableRow({
  match,
  predictionMode,
  storedScore,
}: {
  match: ResultMatch
  predictionMode: 'full_tournament' | 'progressive' | 'bracket_picker'
  storedScore?: MatchScoreData | null
}) {
  const isCompleted = match.status === 'completed'
  const isLive = match.status === 'live'
  const isUpcoming = !isCompleted && !isLive
  const hasActualScores = match.home_score_ft !== null && match.away_score_ft !== null
  const hasPsoScores = match.home_score_pso !== null && match.away_score_pso !== null
  const hasPrediction = match.prediction !== null
  const pointsResult = derivePointsResult(storedScore)
  const statusBadge = getMatchStatusBadge({
    status: match.status,
    statusDetail: match.status_detail,
    originalMatchDate: match.original_match_date,
  })

  const homeName = match.home_team?.country_name || match.home_team_placeholder || 'TBD'
  const awayName = match.away_team?.country_name || match.away_team_placeholder || 'TBD'
  const homeCode = match.home_team?.country_code ?? ''
  const awayCode = match.away_team?.country_code ?? ''
  const homeFlagUrl = match.home_team?.flag_url ?? null
  const awayFlagUrl = match.away_team?.flag_url ?? null

  // Knockout matches in a full-tournament pool are predicted from the bracket,
  // so who you had in the fixture matters as much as the score you gave it.
  const showBracketTeams =
    predictionMode === 'full_tournament' &&
    match.stage !== 'group' &&
    (match.predicted_home_team_name != null || match.predicted_away_team_name != null)

  return (
    <tr className="border-b border-border-default last:border-b-0 hover:bg-snow transition-colors">
      {/* The outcome accent survives the move to a table as a left edge on the
          first cell — same colour vocabulary as the mobile card. */}
      <td className={`px-4 py-3 border-l-[3px] ${getLeftBorderColor(pointsResult, isUpcoming)}`}>
        <span className="t-body text-muted whitespace-nowrap">
          {getStageLabel(match.stage, match.group_letter)} · #{match.match_number}
        </span>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2 min-w-0">
          <span className="t-body text-ink truncate text-right">{homeName}</span>
          {/* flag_url is authoritative — it carries the real ISO-2. The emoji
              is only a fallback for teams that have no image. */}
          {homeFlagUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={homeFlagUrl} alt="" className="w-6 h-4 rounded-[2px] object-cover shrink-0" />
          ) : countryCodeToEmoji(homeCode) ? (
            <span className="text-sm leading-none shrink-0">{countryCodeToEmoji(homeCode)}</span>
          ) : null}
        </div>
        {showBracketTeams && (
          <div className="t-detail text-muted text-right truncate">
            {match.predicted_home_team_name || '?'}
          </div>
        )}
      </td>

      <td className="px-2 py-3 text-center whitespace-nowrap">
        {hasActualScores ? (
          <span className="t-num t-num-extrabold text-base text-ink block">
            {match.home_score_ft} - {match.away_score_ft}
          </span>
        ) : (
          <span className="t-body text-muted block">vs</span>
        )}
        {hasPsoScores && (
          <span className="t-detail font-bold text-accent-600 block">
            PSO {match.home_score_pso}-{match.away_score_pso}
          </span>
        )}
        {/* The prediction sits directly under the actual score in the muted
            tone, so the column reads actual-over-predicted at a glance. */}
        {hasPrediction ? (
          <span className="t-num t-num-medium text-xs text-muted block">
            {match.prediction!.predicted_home_score} - {match.prediction!.predicted_away_score}
            {match.prediction!.predicted_home_pso != null &&
              match.prediction!.predicted_away_pso != null && (
                <> ({match.prediction!.predicted_home_pso}-{match.prediction!.predicted_away_pso})</>
              )}
          </span>
        ) : (
          <span className="t-detail text-muted block">no pick</span>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {awayFlagUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={awayFlagUrl} alt="" className="w-6 h-4 rounded-[2px] object-cover shrink-0" />
          ) : countryCodeToEmoji(awayCode) ? (
            <span className="text-sm leading-none shrink-0">{countryCodeToEmoji(awayCode)}</span>
          ) : null}
          <span className="t-body text-ink truncate">{awayName}</span>
        </div>
        {showBracketTeams && (
          <div className="t-detail text-muted truncate">
            {match.predicted_away_team_name || '?'}
          </div>
        )}
      </td>

      <td className="px-4 py-3">
        <div className="flex justify-center">
          {pointsResult ? (
            <PointsBadge result={pointsResult} />
          ) : statusBadge ? (
            <span
              className={`t-caption px-2 py-0.5 rounded-pill ${
                statusBadge.tone === 'red'
                  ? 'bg-danger-600/12 text-danger-600'
                  : 'bg-warning-500/12 text-warning-600'
              }`}
            >
              {statusBadge.label}
            </span>
          ) : isLive ? (
            <span className="inline-flex items-center gap-1 t-caption px-2 py-0.5 rounded-pill bg-danger-600/12 text-danger-600">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-pill bg-danger-400 opacity-75" />
                <span className="relative inline-flex rounded-pill h-1.5 w-1.5 bg-danger-500" />
              </span>
              {getLiveClock({ status: match.status, livePeriod: match.live_period, liveMinute: match.live_minute }) ?? 'LIVE'}
            </span>
          ) : null}
        </div>
      </td>

      <td className="px-4 py-3 text-right">
        <span className="t-body text-muted whitespace-nowrap">
          <LocalTime iso={match.match_date} format={formatDate} />
        </span>
      </td>
    </tr>
  )
}
