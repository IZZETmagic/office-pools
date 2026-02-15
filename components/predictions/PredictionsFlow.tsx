'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Match,
  Team,
  Prediction,
  PredictionMap,
  ScoreEntry,
  GroupStanding,
  STAGES,
  STAGE_LABELS,
  GROUP_LETTERS,
  calculateGroupStandings,
  resolveAllR32Matches,
  getKnockoutWinner,
  getKnockoutLoser,
  isStageComplete,
} from '@/lib/tournament'
import { GroupStageForm } from './GroupStageForm'
import { KnockoutStageForm } from './KnockoutStageForm'
import { SummaryView } from './SummaryView'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'

type Props = {
  matches: Match[]
  teams: Team[]
  memberId: string
  existingPredictions: Prediction[]
  isPastDeadline: boolean
  psoEnabled: boolean
}

export default function PredictionsFlow({
  matches,
  teams,
  memberId,
  existingPredictions,
  isPastDeadline,
  psoEnabled,
}: Props) {
  // =============================================
  // STATE
  // =============================================

  const [currentStage, setCurrentStage] = useState(0) // index into STAGES
  const [predictions, setPredictions] = useState<PredictionMap>(() => {
    const map = new Map<string, ScoreEntry>()
    for (const p of existingPredictions) {
      map.set(p.match_id, {
        home: p.predicted_home_score,
        away: p.predicted_away_score,
        homePso: p.predicted_home_pso ?? null,
        awayPso: p.predicted_away_pso ?? null,
        winnerTeamId: p.predicted_winner_team_id ?? null,
      })
    }
    return map
  })

  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Track existing prediction IDs for upsert logic
  const existingPredictionIds = useRef(
    new Map(existingPredictions.filter(p => p.prediction_id).map(p => [p.match_id, p.prediction_id!]))
  )

  const supabase = createClient()

  // Auto-save timer
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingChanges = useRef(false)

  // =============================================
  // PREDICTION UPDATE HANDLER
  // =============================================

  const updatePrediction = useCallback((matchId: string, score: ScoreEntry) => {
    setPredictions(prev => {
      const next = new Map(prev)
      next.set(matchId, score)
      return next
    })
    pendingChanges.current = true

    // Reset auto-save timer
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      if (pendingChanges.current) {
        savePredictions()
      }
    }, 30000)
  }, [])

  // =============================================
  // COMPUTED: GROUP STANDINGS
  // =============================================

  const allGroupStandings = useMemo(() => {
    const standings = new Map<string, GroupStanding[]>()
    for (const letter of GROUP_LETTERS) {
      const gMatches = matches.filter(m => m.stage === 'group' && m.group_letter === letter)
      standings.set(letter, calculateGroupStandings(letter, gMatches, predictions, teams))
    }
    return standings
  }, [matches, predictions, teams])

  // =============================================
  // COMPUTED: R32 RESOLUTIONS
  // =============================================

  const r32Resolutions = useMemo(() => {
    return resolveAllR32Matches(allGroupStandings)
  }, [allGroupStandings])

  // =============================================
  // COMPUTED: FULL KNOCKOUT BRACKET
  // =============================================

  // Build a map of match_number -> { homeTeam, awayTeam } for all knockout matches
  const knockoutTeamMap = useMemo(() => {
    const map = new Map<number, { home: GroupStanding | null; away: GroupStanding | null }>()

    // R32: from group results
    for (const [matchNum, teams] of r32Resolutions) {
      map.set(matchNum, teams)
    }

    // Helper to get match by number
    const getMatch = (num: number) => matches.find(m => m.match_number === num)

    // R16 (matches 89-96): winners of R32 matches
    // The matches table has home_team_placeholder like "Winner Match 73"
    const r16Matches = matches.filter(m => m.stage === 'round_16').sort((a, b) => a.match_number - b.match_number)
    for (const m of r16Matches) {
      const homeMatchNum = extractMatchNumber(m.home_team_placeholder)
      const awayMatchNum = extractMatchNumber(m.away_team_placeholder)

      const homeSource = homeMatchNum ? map.get(homeMatchNum) : null
      const awaySource = awayMatchNum ? map.get(awayMatchNum) : null

      const homeSourceMatch = homeMatchNum ? getMatch(homeMatchNum) : null
      const awaySourceMatch = awayMatchNum ? getMatch(awayMatchNum) : null

      const home = homeSourceMatch && homeSource
        ? getKnockoutWinner(homeSourceMatch.match_id, predictions, homeSource.home, homeSource.away)
        : null
      const away = awaySourceMatch && awaySource
        ? getKnockoutWinner(awaySourceMatch.match_id, predictions, awaySource.home, awaySource.away)
        : null

      map.set(m.match_number, { home, away })
    }

    // QF (matches 97-100)
    const qfMatches = matches.filter(m => m.stage === 'quarter_final').sort((a, b) => a.match_number - b.match_number)
    for (const m of qfMatches) {
      const homeMatchNum = extractMatchNumber(m.home_team_placeholder)
      const awayMatchNum = extractMatchNumber(m.away_team_placeholder)

      const homeSource = homeMatchNum ? map.get(homeMatchNum) : null
      const awaySource = awayMatchNum ? map.get(awayMatchNum) : null

      const homeSourceMatch = homeMatchNum ? getMatch(homeMatchNum) : null
      const awaySourceMatch = awayMatchNum ? getMatch(awayMatchNum) : null

      const home = homeSourceMatch && homeSource
        ? getKnockoutWinner(homeSourceMatch.match_id, predictions, homeSource.home, homeSource.away)
        : null
      const away = awaySourceMatch && awaySource
        ? getKnockoutWinner(awaySourceMatch.match_id, predictions, awaySource.home, awaySource.away)
        : null

      map.set(m.match_number, { home, away })
    }

    // SF (matches 101-102)
    const sfMatches = matches.filter(m => m.stage === 'semi_final').sort((a, b) => a.match_number - b.match_number)
    for (const m of sfMatches) {
      const homeMatchNum = extractMatchNumber(m.home_team_placeholder)
      const awayMatchNum = extractMatchNumber(m.away_team_placeholder)

      const homeSource = homeMatchNum ? map.get(homeMatchNum) : null
      const awaySource = awayMatchNum ? map.get(awayMatchNum) : null

      const homeSourceMatch = homeMatchNum ? getMatch(homeMatchNum) : null
      const awaySourceMatch = awayMatchNum ? getMatch(awayMatchNum) : null

      const home = homeSourceMatch && homeSource
        ? getKnockoutWinner(homeSourceMatch.match_id, predictions, homeSource.home, homeSource.away)
        : null
      const away = awaySourceMatch && awaySource
        ? getKnockoutWinner(awaySourceMatch.match_id, predictions, awaySource.home, awaySource.away)
        : null

      map.set(m.match_number, { home, away })
    }

    // Third place: losers of semi-finals
    const thirdMatch = matches.find(m => m.stage === 'third_place')
    if (thirdMatch) {
      const homeMatchNum = extractMatchNumber(thirdMatch.home_team_placeholder)
      const awayMatchNum = extractMatchNumber(thirdMatch.away_team_placeholder)

      const homeSource = homeMatchNum ? map.get(homeMatchNum) : null
      const awaySource = awayMatchNum ? map.get(awayMatchNum) : null

      const homeSourceMatch = homeMatchNum ? getMatch(homeMatchNum) : null
      const awaySourceMatch = awayMatchNum ? getMatch(awayMatchNum) : null

      const home = homeSourceMatch && homeSource
        ? getKnockoutLoser(homeSourceMatch.match_id, predictions, homeSource.home, homeSource.away)
        : null
      const away = awaySourceMatch && awaySource
        ? getKnockoutLoser(awaySourceMatch.match_id, predictions, awaySource.home, awaySource.away)
        : null

      map.set(thirdMatch.match_number, { home, away })
    }

    // Final: winners of semi-finals
    const finalMatch = matches.find(m => m.stage === 'final')
    if (finalMatch) {
      const homeMatchNum = extractMatchNumber(finalMatch.home_team_placeholder)
      const awayMatchNum = extractMatchNumber(finalMatch.away_team_placeholder)

      const homeSource = homeMatchNum ? map.get(homeMatchNum) : null
      const awaySource = awayMatchNum ? map.get(awayMatchNum) : null

      const homeSourceMatch = homeMatchNum ? getMatch(homeMatchNum) : null
      const awaySourceMatch = awayMatchNum ? getMatch(awayMatchNum) : null

      const home = homeSourceMatch && homeSource
        ? getKnockoutWinner(homeSourceMatch.match_id, predictions, homeSource.home, homeSource.away)
        : null
      const away = awaySourceMatch && awaySource
        ? getKnockoutWinner(awaySourceMatch.match_id, predictions, awaySource.home, awaySource.away)
        : null

      map.set(finalMatch.match_number, { home, away })
    }

    return map
  }, [matches, predictions, r32Resolutions, allGroupStandings])

  // =============================================
  // COMPUTED: CHAMPION
  // =============================================

  const champion = useMemo(() => {
    const finalMatch = matches.find(m => m.stage === 'final')
    if (!finalMatch) return null
    const finalTeams = knockoutTeamMap.get(finalMatch.match_number)
    if (!finalTeams) return null
    return getKnockoutWinner(finalMatch.match_id, predictions, finalTeams.home, finalTeams.away)
  }, [matches, predictions, knockoutTeamMap])

  // =============================================
  // BUILD RESOLVED MATCHES FOR EACH KNOCKOUT STAGE
  // =============================================

  const getResolvedMatchesForStage = useCallback((stage: string) => {
    const stageMatches = stage === 'finals'
      ? matches.filter(m => m.stage === 'third_place' || m.stage === 'final')
      : matches.filter(m => m.stage === stage)

    return stageMatches
      .sort((a, b) => a.match_number - b.match_number)
      .map(match => {
        const resolved = knockoutTeamMap.get(match.match_number)
        return {
          match,
          homeTeam: resolved?.home ?? null,
          awayTeam: resolved?.away ?? null,
        }
      })
  }, [matches, knockoutTeamMap])

  // Build knockout resolutions for summary view
  const knockoutResolutionsForSummary = useMemo(() => {
    const result = new Map<string, { match: Match; homeTeam: GroupStanding | null; awayTeam: GroupStanding | null; winner: GroupStanding | null }>()
    const knockoutMatches = matches.filter(m => m.stage !== 'group')
    for (const match of knockoutMatches) {
      const resolved = knockoutTeamMap.get(match.match_number)
      const home = resolved?.home ?? null
      const away = resolved?.away ?? null
      const winner = getKnockoutWinner(match.match_id, predictions, home, away)
      result.set(match.match_id, { match, homeTeam: home, awayTeam: away, winner })
    }
    return result
  }, [matches, predictions, knockoutTeamMap])

  // =============================================
  // SAVE PREDICTIONS
  // =============================================

  const savePredictions = async () => {
    setSaving(true)
    setError(null)
    pendingChanges.current = false

    try {
      const toInsert: {
        member_id: string
        match_id: string
        predicted_home_score: number
        predicted_away_score: number
        predicted_home_pso: number | null
        predicted_away_pso: number | null
        predicted_winner_team_id: string | null
      }[] = []
      const toUpdate: {
        prediction_id: string
        predicted_home_score: number
        predicted_away_score: number
        predicted_home_pso: number | null
        predicted_away_pso: number | null
        predicted_winner_team_id: string | null
      }[] = []

      for (const [matchId, scores] of predictions) {
        const existingId = existingPredictionIds.current.get(matchId)
        if (existingId) {
          toUpdate.push({
            prediction_id: existingId,
            predicted_home_score: scores.home,
            predicted_away_score: scores.away,
            predicted_home_pso: scores.homePso ?? null,
            predicted_away_pso: scores.awayPso ?? null,
            predicted_winner_team_id: scores.winnerTeamId ?? null,
          })
        } else {
          toInsert.push({
            member_id: memberId,
            match_id: matchId,
            predicted_home_score: scores.home,
            predicted_away_score: scores.away,
            predicted_home_pso: scores.homePso ?? null,
            predicted_away_pso: scores.awayPso ?? null,
            predicted_winner_team_id: scores.winnerTeamId ?? null,
          })
        }
      }

      if (toInsert.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('predictions')
          .insert(toInsert)
          .select('match_id, prediction_id')

        if (insertError) throw insertError

        // Update local tracking
        if (inserted) {
          for (const row of inserted) {
            existingPredictionIds.current.set(row.match_id, row.prediction_id)
          }
        }
      }

      for (const pred of toUpdate) {
        const { error: updateError } = await supabase
          .from('predictions')
          .update({
            predicted_home_score: pred.predicted_home_score,
            predicted_away_score: pred.predicted_away_score,
            predicted_home_pso: pred.predicted_home_pso,
            predicted_away_pso: pred.predicted_away_pso,
            predicted_winner_team_id: pred.predicted_winner_team_id,
          })
          .eq('prediction_id', pred.prediction_id)

        if (updateError) throw updateError
      }

      setSaving(false)
    } catch (err: any) {
      setError(err.message || 'Failed to save predictions')
      setSaving(false)
    }
  }

  // =============================================
  // SUBMIT ALL PREDICTIONS (final)
  // =============================================

  const submitPredictions = async () => {
    setSubmitting(true)
    setError(null)

    try {
      await savePredictions()
      setSuccess('Predictions submitted successfully!')
      setSubmitting(false)
    } catch (err: any) {
      setError(err.message || 'Failed to submit predictions')
      setSubmitting(false)
    }
  }

  // =============================================
  // NAVIGATION
  // =============================================

  const stageName = STAGES[currentStage]
  const canProceed = (() => {
    switch (stageName) {
      case 'group':
        return isStageComplete(matches, predictions, 'group')
      case 'round_32':
        return isStageComplete(matches, predictions, 'round_32')
      case 'round_16':
        return isStageComplete(matches, predictions, 'round_16')
      case 'quarter_final':
        return isStageComplete(matches, predictions, 'quarter_final')
      case 'semi_final':
        return isStageComplete(matches, predictions, 'semi_final')
      case 'finals': {
        const thirdOk = isStageComplete(matches, predictions, 'third_place')
        const finalOk = isStageComplete(matches, predictions, 'final')
        return thirdOk && finalOk
      }
      default:
        return true
    }
  })()

  const goNext = () => {
    if (currentStage < STAGES.length - 1) {
      savePredictions()
      setCurrentStage(currentStage + 1)
      window.scrollTo(0, 0)
    }
  }

  const goBack = () => {
    if (currentStage > 0) {
      setCurrentStage(currentStage - 1)
      window.scrollTo(0, 0)
    }
  }

  const goToStage = (idx: number) => {
    setCurrentStage(idx)
    window.scrollTo(0, 0)
  }

  // =============================================
  // RENDER
  // =============================================

  if (isPastDeadline) {
    return (
      <Alert variant="error">
        The prediction deadline has passed. You can no longer submit or edit predictions.
      </Alert>
    )
  }

  return (
    <div>
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-600">
            Stage {currentStage + 1} of {STAGES.length}
          </p>
          {saving && (
            <p className="text-xs text-blue-600">Saving...</p>
          )}
        </div>

        {/* Stage pills */}
        <div className="flex gap-1 overflow-x-auto pb-2">
          {STAGES.map((stage, idx) => {
            const isCurrent = idx === currentStage
            const isCompleted = idx < currentStage
            return (
              <button
                key={stage}
                type="button"
                onClick={() => goToStage(idx)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                  isCurrent
                    ? 'bg-blue-600 text-white'
                    : isCompleted
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {STAGE_LABELS[stage]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Error / Success messages */}
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {/* Stage title */}
      <h3 className="text-2xl font-bold text-gray-900 mb-6">
        {STAGE_LABELS[stageName]}
      </h3>

      {/* Stage content */}
      {stageName === 'group' && (
        <GroupStageForm
          matches={matches}
          teams={teams}
          predictions={predictions}
          allGroupStandings={allGroupStandings}
          onUpdatePrediction={updatePrediction}
        />
      )}

      {stageName === 'round_32' && (
        <KnockoutStageForm
          stage="round_32"
          resolvedMatches={getResolvedMatchesForStage('round_32')}
          predictions={predictions}
          onUpdatePrediction={updatePrediction}
          psoEnabled={psoEnabled}
        />
      )}

      {stageName === 'round_16' && (
        <KnockoutStageForm
          stage="round_16"
          resolvedMatches={getResolvedMatchesForStage('round_16')}
          predictions={predictions}
          onUpdatePrediction={updatePrediction}
          psoEnabled={psoEnabled}
        />
      )}

      {stageName === 'quarter_final' && (
        <KnockoutStageForm
          stage="quarter_final"
          resolvedMatches={getResolvedMatchesForStage('quarter_final')}
          predictions={predictions}
          onUpdatePrediction={updatePrediction}
          psoEnabled={psoEnabled}
        />
      )}

      {stageName === 'semi_final' && (
        <KnockoutStageForm
          stage="semi_final"
          resolvedMatches={getResolvedMatchesForStage('semi_final')}
          predictions={predictions}
          onUpdatePrediction={updatePrediction}
          psoEnabled={psoEnabled}
        />
      )}

      {stageName === 'finals' && (
        <KnockoutStageForm
          stage="finals"
          resolvedMatches={getResolvedMatchesForStage('finals')}
          predictions={predictions}
          onUpdatePrediction={updatePrediction}
          psoEnabled={psoEnabled}
        />
      )}

      {stageName === 'summary' && (
        <SummaryView
          matches={matches}
          teams={teams}
          predictions={predictions}
          knockoutResolutions={knockoutResolutionsForSummary}
          champion={champion}
          onEditStage={goToStage}
          onSubmit={submitPredictions}
          submitting={submitting}
        />
      )}

      {/* Navigation buttons */}
      {stageName !== 'summary' && (
        <div className="mt-6 sm:mt-8 flex gap-2 sm:gap-3">
          {currentStage > 0 && (
            <Button variant="outline" size="lg" onClick={goBack}>
              Back
            </Button>
          )}
          <Button
            variant="primary"
            size="lg"
            onClick={goNext}
            disabled={!canProceed}
            className="flex-1 text-sm sm:text-base"
          >
            {canProceed
              ? `Proceed to ${STAGE_LABELS[STAGES[currentStage + 1]] || 'Summary'}`
              : `Complete all ${STAGE_LABELS[stageName]?.toLowerCase()} predictions`
            }
          </Button>
        </div>
      )}
    </div>
  )
}

// =============================================
// HELPERS
// =============================================

function extractMatchNumber(placeholder: string | null): number | null {
  if (!placeholder) return null
  // Match patterns like "Winner Match 73", "Loser Match 101", "W73", etc.
  const match = placeholder.match(/(?:Match\s*)?(\d+)/i)
  return match ? parseInt(match[1]) : null
}
