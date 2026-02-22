'use client'

import {
  Match,
  PredictionMap,
  ScoreEntry,
  GroupStanding,
  STAGE_LABELS,
} from '@/lib/tournament'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'

type ResolvedMatch = {
  match: Match
  homeTeam: GroupStanding | null
  awayTeam: GroupStanding | null
}

type Props = {
  stage: string
  resolvedMatches: ResolvedMatch[]
  predictions: PredictionMap
  onUpdatePrediction?: (matchId: string, score: ScoreEntry) => void
  psoEnabled: boolean
  readOnly?: boolean
}

export function KnockoutStageForm({ stage, resolvedMatches, predictions, onUpdatePrediction, psoEnabled, readOnly }: Props) {
  const stageLabel = STAGE_LABELS[stage] || stage
  const totalMatches = resolvedMatches.length
  const predictedMatches = resolvedMatches.filter(rm => {
    const pred = predictions.get(rm.match.match_id)
    if (!pred || pred.home == null || pred.away == null) return false
    // A knockout match with a draw needs PSO resolution to count as complete
    if (pred.home === pred.away) {
      if (psoEnabled) {
        return pred.homePso != null && pred.awayPso != null && pred.homePso !== pred.awayPso
      } else {
        return pred.winnerTeamId != null
      }
    }
    return true
  }).length

  return (
    <div>
      {/* Progress counter */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          <span className="font-bold text-neutral-900">{predictedMatches}</span> of{' '}
          <span className="font-bold text-neutral-900">{totalMatches}</span> matches predicted
        </p>
        {predictedMatches === totalMatches && totalMatches > 0 && (
          <Badge variant="green">All {stageLabel.toLowerCase()} matches predicted</Badge>
        )}
      </div>

      {/* Matches */}
      <div className="space-y-3">
        {resolvedMatches.map(({ match, homeTeam, awayTeam }) => (
          <KnockoutMatchCard
            key={match.match_id}
            match={match}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            prediction={predictions.get(match.match_id)}
            onUpdate={onUpdatePrediction}
            psoEnabled={psoEnabled}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  )
}

// =============================================
// KNOCKOUT MATCH CARD
// =============================================

function KnockoutMatchCard({
  match,
  homeTeam,
  awayTeam,
  prediction,
  onUpdate,
  psoEnabled,
  readOnly,
}: {
  match: Match
  homeTeam: GroupStanding | null
  awayTeam: GroupStanding | null
  prediction: ScoreEntry | undefined
  onUpdate?: (matchId: string, score: ScoreEntry) => void
  psoEnabled: boolean
  readOnly?: boolean
}) {
  const homeName = homeTeam?.country_name || match.home_team_placeholder || 'TBD'
  const awayName = awayTeam?.country_name || match.away_team_placeholder || 'TBD'
  const bothResolved = homeTeam !== null && awayTeam !== null

  const isDraw = prediction != null && prediction.home != null && prediction.away != null && prediction.home === prediction.away
  const hasPrediction = prediction != null && prediction.home != null && prediction.away != null

  const handleScoreChange = (team: 'home' | 'away', value: string) => {
    if (readOnly || !onUpdate) return
    const numValue = value === '' ? null : parseInt(value)
    if (numValue !== null && (isNaN(numValue) || numValue < 0)) return

    const current = prediction || { home: null, away: null }
    const newScore: ScoreEntry = {
      ...current,
      [team]: numValue,
    }

    // If scores are no longer a draw, clear PSO fields
    const newHome = team === 'home' ? numValue : current.home
    const newAway = team === 'away' ? numValue : current.away
    if (newHome != null && newAway != null && newHome !== newAway) {
      newScore.homePso = null
      newScore.awayPso = null
      newScore.winnerTeamId = null
    }

    onUpdate(match.match_id, newScore)
  }

  const handlePsoScoreChange = (team: 'homePso' | 'awayPso', value: string) => {
    if (readOnly || !onUpdate) return
    const numValue = value === '' ? null : parseInt(value)
    if (numValue !== null && (isNaN(numValue) || numValue < 0 || numValue > 20)) return

    const current = prediction || { home: null, away: null }
    onUpdate(match.match_id, {
      ...current,
      [team]: numValue,
      winnerTeamId: null,
    })
  }

  const handleWinnerChange = (winnerId: string) => {
    if (readOnly || !onUpdate) return
    const current = prediction || { home: null, away: null }
    onUpdate(match.match_id, {
      ...current,
      homePso: null,
      awayPso: null,
      winnerTeamId: winnerId,
    })
  }

  const stageLabel = match.stage === 'third_place'
    ? 'Third Place'
    : match.stage === 'final'
    ? 'Final'
    : match.stage.replace(/_/g, ' ')

  // PSO validation: scores can't be tied
  const psoTied = prediction?.homePso != null && prediction?.awayPso != null && prediction.homePso === prediction.awayPso

  // Format date/time in AST (UTC-4)
  const matchDate = new Date(match.match_date)
  const dateStr = matchDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'Atlantic/Bermuda',
  })
  const timeStr = matchDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Atlantic/Bermuda',
    timeZoneName: 'short',
  })

  // Split venue into stadium and city
  const venueParts = match.venue?.split(', ') || []
  const stadium = venueParts[0] || ''
  const city = venueParts.slice(1).join(', ') || ''

  return (
    <Card padding="md">
      {/* Single row: Match#, Date/Time, Home, Score, Away, City/Stadium */}
      <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap">
        <span className="text-[10px] sm:text-xs text-neutral-400 shrink-0 mr-0.5 sm:mr-2">#{match.match_number}</span>
        <div className="hidden sm:block shrink-0 w-[108px] text-xs text-neutral-500 leading-tight">
          <span className="font-medium text-neutral-700">{dateStr}</span>
          <br />
          <span>{timeStr}</span>
        </div>

        {/* Home team */}
        <div className="flex-1 basis-0 text-right min-w-0">
          <p className={`text-[11px] sm:text-sm font-semibold truncate ${bothResolved ? 'text-neutral-900' : 'text-neutral-500'}`}>
            {homeName}
          </p>
          {homeTeam && <p className="text-[10px] text-neutral-400 hidden sm:block">Group {homeTeam.group_letter}</p>}
        </div>

        {/* Score inputs */}
        <div className="flex items-center gap-0.5 shrink-0">
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={prediction?.home ?? ''}
            placeholder="-"
            disabled={!bothResolved || readOnly}
            onChange={(e) => handleScoreChange('home', e.target.value)}
            className="w-9 sm:w-11 h-8 sm:h-9 px-0.5 text-center border border-neutral-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent text-neutral-900 font-bold text-sm disabled:bg-neutral-100 disabled:cursor-not-allowed"
          />
          <span className="text-neutral-400 font-bold text-[10px]">v</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={prediction?.away ?? ''}
            placeholder="-"
            disabled={!bothResolved || readOnly}
            onChange={(e) => handleScoreChange('away', e.target.value)}
            className="w-9 sm:w-11 h-8 sm:h-9 px-0.5 text-center border border-neutral-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent text-neutral-900 font-bold text-sm disabled:bg-neutral-100 disabled:cursor-not-allowed"
          />
        </div>

        {/* Away team */}
        <div className="flex-1 basis-0 text-left min-w-0">
          <p className={`text-[11px] sm:text-sm font-semibold truncate ${bothResolved ? 'text-neutral-900' : 'text-neutral-500'}`}>
            {awayName}
          </p>
          {awayTeam && <p className="text-[10px] text-neutral-400 hidden sm:block">Group {awayTeam.group_letter}</p>}
        </div>

        <div className="hidden sm:block shrink-0 w-[100px] text-xs text-neutral-500 text-right leading-tight">
          <span className="font-medium text-neutral-700 truncate block">{city}</span>
          <span className="truncate block">{stadium}</span>
        </div>
      </div>

      {/* Full time label */}
      {isDraw && (
        <p className="text-xs text-neutral-600 font-medium mt-2 mb-1 text-center">Full Time</p>
      )}

      {/* PSO Section - only for draws in knockout matches */}
      {bothResolved && hasPrediction && isDraw && (
        <div className="mt-4 pt-4 border-t-2 border-dashed border-neutral-200">
          <div className="bg-primary-50 rounded-lg p-4">
            {psoEnabled ? (
              /* PSO ENABLED: Show exact score inputs (required) */
              <>
                <div className="mb-3">
                  <p className="text-sm font-semibold text-neutral-900">Penalty Shootout Score</p>
                  <p className="text-xs text-neutral-600">Predict the exact penalty shootout score</p>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 justify-center">
                  <span className="text-xs text-neutral-600 w-16 sm:w-20 text-right truncate">{homeName}</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    inputMode="numeric"
                    value={prediction?.homePso ?? ''}
                    placeholder="-"
                    disabled={readOnly}
                    onChange={(e) => handlePsoScoreChange('homePso', e.target.value)}
                    className="w-10 sm:w-12 h-8 px-1 text-center border border-neutral-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent text-neutral-900 font-bold text-sm disabled:bg-neutral-100 disabled:cursor-not-allowed"
                  />
                  <span className="text-neutral-500 text-xs font-bold">-</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    inputMode="numeric"
                    value={prediction?.awayPso ?? ''}
                    placeholder="-"
                    disabled={readOnly}
                    onChange={(e) => handlePsoScoreChange('awayPso', e.target.value)}
                    className="w-10 sm:w-12 h-8 px-1 text-center border border-neutral-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent text-neutral-900 font-bold text-sm disabled:bg-neutral-100 disabled:cursor-not-allowed"
                  />
                  <span className="text-xs text-neutral-600 w-16 sm:w-20 truncate">{awayName}</span>
                </div>
                {psoTied && (
                  <p className="text-xs text-danger-600 mt-2 text-center">PSO scores cannot be equal - one team must win</p>
                )}
                {(prediction?.homePso == null || prediction?.awayPso == null) && (
                  <p className="text-xs text-warning-600 mt-2 text-center">PSO score is required for tied knockout matches</p>
                )}
              </>
            ) : (
              /* PSO DISABLED: Show simple winner selection */
              <>
                <div className="mb-3">
                  <p className="text-sm font-semibold text-neutral-900">If this match goes to penalties, who wins?</p>
                </div>
                <div className="flex gap-4 justify-center">
                  <label className={`flex items-center gap-2 ${readOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="radio"
                      name={`pso-winner-${match.match_id}`}
                      checked={prediction?.winnerTeamId === homeTeam?.team_id}
                      disabled={readOnly}
                      onChange={() => homeTeam && handleWinnerChange(homeTeam.team_id)}
                      className="shrink-0"
                    />
                    <span className="text-sm font-medium text-neutral-800">{homeName}</span>
                  </label>
                  <label className={`flex items-center gap-2 ${readOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input
                      type="radio"
                      name={`pso-winner-${match.match_id}`}
                      checked={prediction?.winnerTeamId === awayTeam?.team_id}
                      disabled={readOnly}
                      onChange={() => awayTeam && handleWinnerChange(awayTeam.team_id)}
                      className="shrink-0"
                    />
                    <span className="text-sm font-medium text-neutral-800">{awayName}</span>
                  </label>
                </div>
                {!prediction?.winnerTeamId && (
                  <p className="text-xs text-warning-600 mt-2 text-center">Please select a winner for tied knockout matches</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
