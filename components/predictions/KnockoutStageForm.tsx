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
  onUpdatePrediction: (matchId: string, score: ScoreEntry) => void
  psoEnabled: boolean
}

export function KnockoutStageForm({ stage, resolvedMatches, predictions, onUpdatePrediction, psoEnabled }: Props) {
  const stageLabel = STAGE_LABELS[stage] || stage
  const totalMatches = resolvedMatches.length
  const predictedMatches = resolvedMatches.filter(rm => {
    const pred = predictions.get(rm.match.match_id)
    if (!pred) return false
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
        <p className="text-sm text-gray-600">
          <span className="font-bold text-gray-900">{predictedMatches}</span> of{' '}
          <span className="font-bold text-gray-900">{totalMatches}</span> matches predicted
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
}: {
  match: Match
  homeTeam: GroupStanding | null
  awayTeam: GroupStanding | null
  prediction: ScoreEntry | undefined
  onUpdate: (matchId: string, score: ScoreEntry) => void
  psoEnabled: boolean
}) {
  const homeName = homeTeam?.country_name || match.home_team_placeholder || 'TBD'
  const awayName = awayTeam?.country_name || match.away_team_placeholder || 'TBD'
  const bothResolved = homeTeam !== null && awayTeam !== null

  const isDraw = prediction != null && prediction.home === prediction.away
  const hasPrediction = prediction != null

  const handleScoreChange = (team: 'home' | 'away', value: string) => {
    const numValue = value === '' ? 0 : parseInt(value)
    if (isNaN(numValue) || numValue < 0) return

    const current = prediction || { home: 0, away: 0 }
    const newScore: ScoreEntry = {
      ...current,
      [team]: numValue,
    }

    // If scores are no longer a draw, clear PSO fields
    const newHome = team === 'home' ? numValue : current.home
    const newAway = team === 'away' ? numValue : current.away
    if (newHome !== newAway) {
      newScore.homePso = null
      newScore.awayPso = null
      newScore.winnerTeamId = null
    }

    onUpdate(match.match_id, newScore)
  }

  const handlePsoScoreChange = (team: 'homePso' | 'awayPso', value: string) => {
    const numValue = value === '' ? null : parseInt(value)
    if (numValue !== null && (isNaN(numValue) || numValue < 0 || numValue > 20)) return

    const current = prediction || { home: 0, away: 0 }
    onUpdate(match.match_id, {
      ...current,
      [team]: numValue,
      winnerTeamId: null, // Clear winner when entering exact scores
    })
  }

  const handleWinnerChange = (winnerId: string) => {
    const current = prediction || { home: 0, away: 0 }
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

  return (
    <Card padding="md">
      {/* Match header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <Badge variant={match.stage === 'final' ? 'green' : match.stage === 'third_place' ? 'yellow' : 'blue'}>
            {stageLabel}
          </Badge>
          <span className="text-xs text-gray-500">Match #{match.match_number}</span>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">
            {new Date(match.match_date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
          {match.venue && (
            <p className="text-xs text-gray-500">{match.venue}</p>
          )}
        </div>
      </div>

      {/* Full time label */}
      {isDraw && (
        <p className="text-xs text-gray-600 font-medium mb-1 text-center">Full Time</p>
      )}

      {/* Teams and score inputs */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Home team */}
        <div className="flex-1 text-right min-w-0">
          <p className={`text-sm sm:text-base font-semibold truncate ${bothResolved ? 'text-gray-900' : 'text-gray-500'}`}>
            {homeName}
          </p>
          {homeTeam && (
            <p className="text-xs text-gray-500">Group {homeTeam.group_letter}</p>
          )}
        </div>

        {/* Score inputs */}
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={prediction?.home ?? ''}
            placeholder="-"
            disabled={!bothResolved}
            onChange={(e) => handleScoreChange('home', e.target.value)}
            className="w-11 sm:w-14 h-10 px-1 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-bold text-base sm:text-lg disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <span className="text-gray-500 font-bold">-</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={prediction?.away ?? ''}
            placeholder="-"
            disabled={!bothResolved}
            onChange={(e) => handleScoreChange('away', e.target.value)}
            className="w-11 sm:w-14 h-10 px-1 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-bold text-base sm:text-lg disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>

        {/* Away team */}
        <div className="flex-1 text-left min-w-0">
          <p className={`text-sm sm:text-base font-semibold truncate ${bothResolved ? 'text-gray-900' : 'text-gray-500'}`}>
            {awayName}
          </p>
          {awayTeam && (
            <p className="text-xs text-gray-500">Group {awayTeam.group_letter}</p>
          )}
        </div>
      </div>

      {/* PSO Section - only for draws in knockout matches */}
      {bothResolved && hasPrediction && isDraw && (
        <div className="mt-4 pt-4 border-t-2 border-dashed border-gray-200">
          <div className="bg-blue-50 rounded-lg p-4">
            {psoEnabled ? (
              /* PSO ENABLED: Show exact score inputs (required) */
              <>
                <div className="mb-3">
                  <p className="text-sm font-semibold text-gray-900">Penalty Shootout Score</p>
                  <p className="text-xs text-gray-600">Predict the exact penalty shootout score</p>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 justify-center">
                  <span className="text-xs text-gray-600 w-16 sm:w-20 text-right truncate">{homeName}</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    inputMode="numeric"
                    value={prediction?.homePso ?? ''}
                    placeholder="-"
                    onChange={(e) => handlePsoScoreChange('homePso', e.target.value)}
                    className="w-10 sm:w-12 h-8 px-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-bold text-sm"
                  />
                  <span className="text-gray-500 text-xs font-bold">-</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    inputMode="numeric"
                    value={prediction?.awayPso ?? ''}
                    placeholder="-"
                    onChange={(e) => handlePsoScoreChange('awayPso', e.target.value)}
                    className="w-10 sm:w-12 h-8 px-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-bold text-sm"
                  />
                  <span className="text-xs text-gray-600 w-16 sm:w-20 truncate">{awayName}</span>
                </div>
                {psoTied && (
                  <p className="text-xs text-red-600 mt-2 text-center">PSO scores cannot be equal - one team must win</p>
                )}
                {(prediction?.homePso == null || prediction?.awayPso == null) && (
                  <p className="text-xs text-amber-600 mt-2 text-center">PSO score is required for tied knockout matches</p>
                )}
              </>
            ) : (
              /* PSO DISABLED: Show simple winner selection */
              <>
                <div className="mb-3">
                  <p className="text-sm font-semibold text-gray-900">If this match goes to penalties, who wins?</p>
                </div>
                <div className="flex gap-4 justify-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`pso-winner-${match.match_id}`}
                      checked={prediction?.winnerTeamId === homeTeam?.team_id}
                      onChange={() => homeTeam && handleWinnerChange(homeTeam.team_id)}
                      className="shrink-0"
                    />
                    <span className="text-sm font-medium text-gray-800">{homeName}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={`pso-winner-${match.match_id}`}
                      checked={prediction?.winnerTeamId === awayTeam?.team_id}
                      onChange={() => awayTeam && handleWinnerChange(awayTeam.team_id)}
                      className="shrink-0"
                    />
                    <span className="text-sm font-medium text-gray-800">{awayName}</span>
                  </label>
                </div>
                {!prediction?.winnerTeamId && (
                  <p className="text-xs text-amber-600 mt-2 text-center">Please select a winner for tied knockout matches</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
