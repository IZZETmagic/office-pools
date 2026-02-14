'use client'

import { useState } from 'react'
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
}

export function KnockoutStageForm({ stage, resolvedMatches, predictions, onUpdatePrediction }: Props) {
  const stageLabel = STAGE_LABELS[stage] || stage
  const totalMatches = resolvedMatches.length
  const predictedMatches = resolvedMatches.filter(rm => {
    const pred = predictions.get(rm.match.match_id)
    if (!pred) return false
    // A knockout match with a draw needs PSO resolution to count as complete
    if (pred.home === pred.away) {
      const hasPso = pred.homePso != null && pred.awayPso != null && pred.homePso !== pred.awayPso
      const hasWinner = pred.winnerTeamId != null
      return hasPso || hasWinner
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
          />
        ))}
      </div>
    </div>
  )
}

// =============================================
// PSO option type
// =============================================
type PsoOption = 'exact' | 'winner' | 'skip'

// =============================================
// KNOCKOUT MATCH CARD
// =============================================

function KnockoutMatchCard({
  match,
  homeTeam,
  awayTeam,
  prediction,
  onUpdate,
}: {
  match: Match
  homeTeam: GroupStanding | null
  awayTeam: GroupStanding | null
  prediction: ScoreEntry | undefined
  onUpdate: (matchId: string, score: ScoreEntry) => void
}) {
  const homeName = homeTeam?.country_name || match.home_team_placeholder || 'TBD'
  const awayName = awayTeam?.country_name || match.away_team_placeholder || 'TBD'
  const bothResolved = homeTeam !== null && awayTeam !== null

  // Determine initial PSO option from existing prediction
  const initialPsoOption = (): PsoOption => {
    if (!prediction) return 'winner'
    if (prediction.homePso != null && prediction.awayPso != null) return 'exact'
    if (prediction.winnerTeamId != null) return 'winner'
    return 'winner'
  }
  const [psoOption, setPsoOption] = useState<PsoOption>(initialPsoOption)

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
    if (numValue !== null && (isNaN(numValue) || numValue < 0 || numValue > 10)) return

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

  const handlePsoOptionChange = (option: PsoOption) => {
    setPsoOption(option)
    const current = prediction || { home: 0, away: 0 }

    if (option === 'exact') {
      // Clear winner, keep or init PSO scores
      onUpdate(match.match_id, {
        ...current,
        winnerTeamId: null,
        homePso: current.homePso ?? null,
        awayPso: current.awayPso ?? null,
      })
    } else if (option === 'winner') {
      // Clear PSO scores, set default winner
      const defaultWinner = homeTeam?.team_id || null
      onUpdate(match.match_id, {
        ...current,
        homePso: null,
        awayPso: null,
        winnerTeamId: current.winnerTeamId || defaultWinner,
      })
    } else {
      // Skip: clear all PSO fields
      onUpdate(match.match_id, {
        ...current,
        homePso: null,
        awayPso: null,
        winnerTeamId: null,
      })
    }
  }

  const stageLabel = match.stage === 'third_place'
    ? 'Third Place'
    : match.stage === 'final'
    ? 'Final'
    : match.stage.replace(/_/g, ' ')

  // PSO validation
  const psoTied = prediction?.homePso != null && prediction?.awayPso != null && prediction.homePso === prediction.awayPso

  return (
    <Card padding="md">
      {/* Match header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <Badge variant={match.stage === 'final' ? 'green' : match.stage === 'third_place' ? 'yellow' : 'blue'}>
            {stageLabel}
          </Badge>
          <span className="text-xs text-gray-400">Match #{match.match_number}</span>
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
            <p className="text-xs text-gray-400">{match.venue}</p>
          )}
        </div>
      </div>

      {/* Full time label */}
      {isDraw && (
        <p className="text-xs text-gray-500 font-medium mb-1 text-center">Full Time</p>
      )}

      {/* Teams and score inputs */}
      <div className="flex items-center gap-3">
        {/* Home team */}
        <div className="flex-1 text-right">
          <p className={`text-base font-semibold ${bothResolved ? 'text-gray-900' : 'text-gray-400'}`}>
            {homeName}
          </p>
          {homeTeam && (
            <p className="text-xs text-gray-400">Group {homeTeam.group_letter}</p>
          )}
        </div>

        {/* Score inputs */}
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min="0"
            value={prediction?.home ?? ''}
            placeholder="-"
            disabled={!bothResolved}
            onChange={(e) => handleScoreChange('home', e.target.value)}
            className="w-14 h-10 px-1 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-bold text-lg disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <span className="text-gray-400 font-bold">-</span>
          <input
            type="number"
            min="0"
            value={prediction?.away ?? ''}
            placeholder="-"
            disabled={!bothResolved}
            onChange={(e) => handleScoreChange('away', e.target.value)}
            className="w-14 h-10 px-1 text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-bold text-lg disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>

        {/* Away team */}
        <div className="flex-1 text-left">
          <p className={`text-base font-semibold ${bothResolved ? 'text-gray-900' : 'text-gray-400'}`}>
            {awayName}
          </p>
          {awayTeam && (
            <p className="text-xs text-gray-400">Group {awayTeam.group_letter}</p>
          )}
        </div>
      </div>

      {/* PSO Section - only for draws in knockout matches */}
      {bothResolved && hasPrediction && isDraw && (
        <div className="mt-4 pt-4 border-t-2 border-dashed border-gray-200">
          <div className="bg-blue-50 rounded-lg p-4">
            {/* PSO Header */}
            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-900">Penalty Shootout</p>
              <p className="text-xs text-gray-500">Predict the penalty shootout outcome for bonus points</p>
            </div>

            {/* PSO Options */}
            <div className="space-y-3">
              {/* Option 1: Exact PSO scores */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`pso-${match.match_id}`}
                  checked={psoOption === 'exact'}
                  onChange={() => handlePsoOptionChange('exact')}
                  className="mt-1 shrink-0"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">Predict exact PSO score</p>
                  {psoOption === 'exact' && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-20 text-right truncate">{homeName}</span>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={prediction?.homePso ?? ''}
                        placeholder="-"
                        onChange={(e) => handlePsoScoreChange('homePso', e.target.value)}
                        className="w-12 h-8 px-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-bold text-sm"
                      />
                      <span className="text-gray-400 text-xs font-bold">-</span>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={prediction?.awayPso ?? ''}
                        placeholder="-"
                        onChange={(e) => handlePsoScoreChange('awayPso', e.target.value)}
                        className="w-12 h-8 px-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-bold text-sm"
                      />
                      <span className="text-xs text-gray-600 w-20 truncate">{awayName}</span>
                    </div>
                  )}
                  {psoOption === 'exact' && psoTied && (
                    <p className="text-xs text-red-600 mt-1">PSO scores cannot be equal - one team must win</p>
                  )}
                </div>
              </label>

              {/* Option 2: Just pick the winner */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`pso-${match.match_id}`}
                  checked={psoOption === 'winner'}
                  onChange={() => handlePsoOptionChange('winner')}
                  className="mt-1 shrink-0"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">Just pick the winner</p>
                  {psoOption === 'winner' && (
                    <div className="mt-2">
                      <select
                        value={prediction?.winnerTeamId || ''}
                        onChange={(e) => handleWinnerChange(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select winner...</option>
                        {homeTeam && (
                          <option value={homeTeam.team_id}>{homeName}</option>
                        )}
                        {awayTeam && (
                          <option value={awayTeam.team_id}>{awayName}</option>
                        )}
                      </select>
                    </div>
                  )}
                </div>
              </label>

              {/* Option 3: Skip PSO */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name={`pso-${match.match_id}`}
                  checked={psoOption === 'skip'}
                  onChange={() => handlePsoOptionChange('skip')}
                  className="mt-1 shrink-0"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">Skip PSO prediction</p>
                  {psoOption === 'skip' && (
                    <p className="text-xs text-amber-600 mt-1">
                      You must select a PSO winner for tied knockout matches to proceed
                    </p>
                  )}
                </div>
              </label>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
