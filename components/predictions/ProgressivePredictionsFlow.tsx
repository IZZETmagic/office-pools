'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { RoundStatusCard } from './RoundStatusCard'
import { GroupStageForm } from './GroupStageForm'
import { KnockoutStageForm } from './KnockoutStageForm'
import {
  type Match,
  type Team,
  type Prediction,
  type PredictionMap,
  type ScoreEntry,
  isPredictionComplete,
  GROUP_LETTERS,
  calculateGroupStandings,
  ROUND_KEYS,
  ROUND_LABELS,
  getMatchesForRound,
  type RoundKey,
} from '@/lib/tournament'
import { resolveFullBracket } from '@/lib/bracketResolver'
import { resolveMatchesFromActual } from '@/lib/bracketResolver'
import type { PoolRoundState, EntryRoundSubmission, RoundStateValue } from '@/app/pools/[pool_id]/types'
import type { SaveStatus } from './PredictionsFlow'

type Props = {
  matches: Match[]
  teams: Team[]
  entryId: string
  poolId: string
  existingPredictions: Prediction[]
  psoEnabled: boolean
  predictionsLocked: boolean
  roundStates: PoolRoundState[]
  roundSubmissions: EntryRoundSubmission[]
  onUnsavedChangesRef?: React.RefObject<{ hasUnsaved: () => boolean; save: () => Promise<void> } | null>
  onStatusChange?: (status: { saveStatus: SaveStatus; lastSavedAt: string | null; predictedCount: number }) => void
}

export default function ProgressivePredictionsFlow({
  matches,
  teams,
  entryId,
  poolId,
  existingPredictions,
  psoEnabled,
  predictionsLocked,
  roundStates,
  roundSubmissions,
  onUnsavedChangesRef,
  onStatusChange,
}: Props) {
  const { showToast } = useToast()

  // Round state maps for quick lookup
  const roundStateMap = useMemo(() => {
    const map = new Map<string, PoolRoundState>()
    for (const rs of roundStates) map.set(rs.round_key, rs)
    return map
  }, [roundStates])

  const roundSubmissionMap = useMemo(() => {
    const map = new Map<string, EntryRoundSubmission>()
    for (const sub of roundSubmissions) map.set(sub.round_key, sub)
    return map
  }, [roundSubmissions])

  // Find the current active round (first open round, or first non-completed round)
  const initialRound = useMemo(() => {
    const openRound = roundStates.find(rs => rs.state === 'open')
    if (openRound) return openRound.round_key as RoundKey
    const inProgressRound = roundStates.find(rs => rs.state === 'in_progress')
    if (inProgressRound) return inProgressRound.round_key as RoundKey
    // Default to the last completed round or first round
    const completedRounds = roundStates.filter(rs => rs.state === 'completed')
    if (completedRounds.length > 0) return completedRounds[completedRounds.length - 1].round_key as RoundKey
    return 'group' as RoundKey
  }, [roundStates])

  const [selectedRound, setSelectedRound] = useState<RoundKey>(initialRound)

  // Prediction state
  const [predictions, setPredictions] = useState<PredictionMap>(() => {
    const map = new Map<string, ScoreEntry>()
    for (const p of existingPredictions) {
      map.set(p.match_id, {
        home: p.predicted_home_score,
        away: p.predicted_away_score,
        homePso: p.predicted_home_pso,
        awayPso: p.predicted_away_pso,
        winnerTeamId: p.predicted_winner_team_id,
      })
    }
    return map
  })

  // Track existing prediction IDs for upsert
  const existingPredictionIds = useRef(new Map<string, string>())
  useEffect(() => {
    const map = new Map<string, string>()
    for (const p of existingPredictions) {
      if (p.prediction_id) map.set(p.match_id, p.prediction_id)
    }
    existingPredictionIds.current = map
  }, [existingPredictions])

  // Save state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const saving = saveStatus === 'saving'

  const pendingChanges = useRef(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const periodicSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const savePredictionsRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Selected round state
  const currentRoundState = roundStateMap.get(selectedRound)
  const currentSubmission = roundSubmissionMap.get(selectedRound)
  const roundMatches = useMemo(() => getMatchesForRound(matches, selectedRound), [matches, selectedRound])

  const isRoundOpen = currentRoundState?.state === 'open'
  const isRoundPastDeadline = currentRoundState?.deadline
    ? new Date(currentRoundState.deadline) < new Date()
    : false
  const isRoundSubmitted = currentSubmission?.has_submitted === true
  const isReadOnly = predictionsLocked || !isRoundOpen || isRoundPastDeadline || isRoundSubmitted

  // Match & round stats
  const roundMatchCount = roundMatches.length
  const completedRoundMatchCount = roundMatches.filter(m => (m as any).is_completed).length
  const predictedRoundCount = roundMatches.filter(m => isPredictionComplete(predictions.get(m.match_id))).length

  // Bracket resolution for group stage (needed by GroupStageForm for standings display)
  const allGroupStandings = useMemo(() => {
    if (selectedRound !== 'group') return new Map()
    const standings = new Map()
    for (const letter of GROUP_LETTERS) {
      const gMatches = matches.filter(m => m.stage === 'group' && m.group_letter === letter)
      standings.set(letter, calculateGroupStandings(letter, gMatches, predictions, teams))
    }
    return standings
  }, [selectedRound, matches, predictions, teams])

  // Resolved knockout matches for progressive mode (from actual match data)
  const resolvedKnockoutMatches = useMemo(() => {
    if (selectedRound === 'group') return []
    const resolved = resolveMatchesFromActual(matches, teams, selectedRound)
    return roundMatches
      .sort((a, b) => a.match_number - b.match_number)
      .map(match => ({
        match,
        homeTeam: resolved.get(match.match_number)?.home ?? null,
        awayTeam: resolved.get(match.match_number)?.away ?? null,
      }))
  }, [selectedRound, matches, teams, roundMatches])

  // Total predicted count across all rounds
  const totalPredictedCount = useMemo(() => {
    let count = 0
    for (const m of matches) {
      if (isPredictionComplete(predictions.get(m.match_id))) count++
    }
    return count
  }, [matches, predictions])

  // =====================
  // SAVE LOGIC
  // =====================
  const backupKey = `predictions_progressive_${poolId}_${entryId}`

  const savePredictions = useCallback(async () => {
    if (saving || isReadOnly) return
    pendingChanges.current = false
    setSaveStatus('saving')
    setError(null)

    // Build payload for current round's predictions only
    const predictionsPayload: any[] = []
    for (const match of roundMatches) {
      const scores = predictions.get(match.match_id)
      if (!scores || (scores.home == null && scores.away == null)) continue
      const existingId = existingPredictionIds.current.get(match.match_id)
      predictionsPayload.push({
        matchId: match.match_id,
        predictionId: existingId,
        homeScore: scores.home ?? 0,
        awayScore: scores.away ?? 0,
        homePso: scores.homePso ?? null,
        awayPso: scores.awayPso ?? null,
        winnerTeamId: scores.winnerTeamId ?? null,
      })
    }

    if (predictionsPayload.length === 0) {
      setSaveStatus('idle')
      return
    }

    // Check offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        const backup: Record<string, ScoreEntry> = {}
        for (const [k, v] of predictions) backup[k] = v
        localStorage.setItem(backupKey, JSON.stringify({ predictions: backup, timestamp: Date.now() }))
        showToast('Saved locally. Will sync when online.', 'warning')
      } catch {}
      setSaveStatus('idle')
      return
    }

    try {
      const res = await fetch(`/api/pools/${poolId}/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId,
          roundKey: selectedRound,
          predictions: predictionsPayload,
        }),
      })

      if (res.status === 401) {
        // Session expired - backup and redirect
        try {
          const backup: Record<string, ScoreEntry> = {}
          for (const [k, v] of predictions) backup[k] = v
          localStorage.setItem(backupKey, JSON.stringify({ predictions: backup, timestamp: Date.now() }))
        } catch {}
        window.location.href = '/login?reason=session_expired'
        return
      }

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save')
      }

      if (data.insertedIds) {
        for (const { match_id, prediction_id } of data.insertedIds) {
          existingPredictionIds.current.set(match_id, prediction_id)
        }
      }

      setLastSavedAt(data.lastSaved)
      setSaveStatus('saved')

      // Clear backup
      try { localStorage.removeItem(backupKey) } catch {}
    } catch (err: any) {
      setSaveStatus('error')
      setError(err.message || 'Failed to save predictions')
    }
  }, [saving, isReadOnly, roundMatches, predictions, poolId, entryId, selectedRound, backupKey, showToast])

  // Keep ref in sync
  savePredictionsRef.current = savePredictions

  // =====================
  // AUTO-SAVE TIMERS
  // =====================
  const updatePrediction = useCallback((matchId: string, score: ScoreEntry) => {
    setPredictions(prev => {
      const next = new Map(prev)
      next.set(matchId, score)
      return next
    })
    pendingChanges.current = true
    setSaveStatus('idle')

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      if (pendingChanges.current) savePredictionsRef.current()
    }, 500)
  }, [])

  // Periodic save (60s safety net)
  useEffect(() => {
    periodicSaveTimer.current = setInterval(() => {
      if (pendingChanges.current && !saving) savePredictionsRef.current()
    }, 60000)
    return () => { if (periodicSaveTimer.current) clearInterval(periodicSaveTimer.current) }
  }, [saving])

  // beforeunload warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingChanges.current) {
        e.preventDefault()
        savePredictionsRef.current()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Expose unsaved changes ref to parent
  useEffect(() => {
    if (onUnsavedChangesRef) {
      (onUnsavedChangesRef as React.MutableRefObject<any>).current = {
        hasUnsaved: () => pendingChanges.current,
        save: () => savePredictionsRef.current(),
      }
    }
  })

  // Report status to parent
  useEffect(() => {
    onStatusChange?.({ saveStatus, lastSavedAt, predictedCount: totalPredictedCount })
  }, [saveStatus, lastSavedAt, totalPredictedCount, onStatusChange])

  // =====================
  // SUBMIT (per-round)
  // =====================
  const submitRound = async () => {
    setSubmitting(true)
    setError(null)

    try {
      // Save first
      await savePredictions()

      const res = await fetch(`/api/pools/${poolId}/predictions/round`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, roundKey: selectedRound }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit predictions')
      }

      // Update local submission state
      roundSubmissionMap.set(selectedRound, {
        id: '',
        entry_id: entryId,
        round_key: selectedRound,
        has_submitted: true,
        submitted_at: data.submittedAt,
        auto_submitted: false,
        prediction_count: data.predictedCount,
        created_at: data.submittedAt,
        updated_at: data.submittedAt,
      })

      setShowSubmitModal(false)
      showToast(`${ROUND_LABELS[selectedRound]} predictions submitted!`, 'success')
    } catch (err: any) {
      setError(err.message || 'Failed to submit predictions')
    } finally {
      setSubmitting(false)
    }
  }

  // =====================
  // RENDER
  // =====================
  const roundName = ROUND_LABELS[selectedRound]
  const isAllRoundPredicted = predictedRoundCount === roundMatchCount && roundMatchCount > 0

  return (
    <div className="space-y-4">
      {/* Round selector pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {ROUND_KEYS.map(key => {
          const rs = roundStateMap.get(key)
          const state = rs?.state ?? 'locked'
          const isSelected = key === selectedRound
          const sub = roundSubmissionMap.get(key)

          let pillColor = 'bg-neutral-100 text-neutral-400'
          if (state === 'open') pillColor = 'bg-blue-50 text-blue-700 border-blue-200'
          if (state === 'in_progress') pillColor = 'bg-amber-50 text-amber-700 border-amber-200'
          if (state === 'completed') pillColor = 'bg-green-50 text-green-700 border-green-200'

          if (isSelected) {
            pillColor = 'bg-primary-600 text-white border-primary-600'
          }

          return (
            <button
              key={key}
              onClick={() => setSelectedRound(key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${pillColor} ${
                state === 'locked' && !isSelected ? 'opacity-50 cursor-default' : 'cursor-pointer'
              }`}
            >
              {ROUND_LABELS[key]}
              {sub?.has_submitted && !isSelected && (
                <svg className="inline-block w-3 h-3 ml-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          )
        })}
      </div>

      {/* Round status card */}
      <RoundStatusCard
        roundState={currentRoundState ?? {
          id: '', pool_id: poolId, round_key: selectedRound,
          state: 'locked' as RoundStateValue, deadline: null,
          opened_at: null, closed_at: null, completed_at: null,
          opened_by: null, created_at: '', updated_at: '',
        }}
        submission={currentSubmission ?? null}
        matchCount={roundMatchCount}
        completedMatchCount={completedRoundMatchCount}
      />

      {/* Error */}
      {error && <Alert variant="error">{error}</Alert>}

      {/* Save status bar */}
      {isRoundOpen && !isRoundPastDeadline && !isRoundSubmitted && (
        <div className="flex items-center justify-between text-xs text-neutral-500 px-1">
          <span>
            {predictedRoundCount} / {roundMatchCount} matches predicted
          </span>
          <span>
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'saved' && lastSavedAt && `Saved ${new Date(lastSavedAt).toLocaleTimeString()}`}
            {saveStatus === 'error' && <span className="text-red-600">Save failed</span>}
          </span>
        </div>
      )}

      {/* Prediction form for current round */}
      {currentRoundState?.state === 'locked' ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">
            <svg className="w-12 h-12 mx-auto text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <p className="text-neutral-500 text-sm">
            {roundName} predictions are not yet available.
          </p>
          <p className="text-neutral-400 text-xs mt-1">
            Available after the previous round completes.
          </p>
        </div>
      ) : (
        <>
          {/* Group Stage Form */}
          {selectedRound === 'group' && (
            <GroupStageForm
              matches={matches}
              teams={teams}
              predictions={predictions}
              allGroupStandings={allGroupStandings}
              onUpdatePrediction={isReadOnly ? undefined : updatePrediction}
              readOnly={isReadOnly}
            />
          )}

          {/* Knockout Stage Forms */}
          {selectedRound !== 'group' && (
            <KnockoutStageForm
              stage={selectedRound}
              resolvedMatches={resolvedKnockoutMatches}
              predictions={predictions}
              onUpdatePrediction={isReadOnly ? undefined : updatePrediction}
              psoEnabled={psoEnabled}
              readOnly={isReadOnly}
            />
          )}

          {/* Submit button for current round */}
          {isRoundOpen && !isRoundPastDeadline && !isRoundSubmitted && (
            <div className="sticky bottom-0 bg-surface/95 backdrop-blur-sm border-t border-border-default py-3 px-1 -mx-1">
              <Button
                variant="green"
                onClick={() => setShowSubmitModal(true)}
                disabled={!isAllRoundPredicted || submitting}
                className="w-full"
              >
                {isAllRoundPredicted
                  ? `Submit ${roundName} Predictions`
                  : `${predictedRoundCount}/${roundMatchCount} matches predicted`
                }
              </Button>
            </div>
          )}
        </>
      )}

      {/* Submit confirmation modal */}
      {showSubmitModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSubmitModal(false) }}
        >
          <div className="bg-surface rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-bold text-neutral-900">Submit {roundName}?</h3>
            <p className="text-sm text-neutral-600">
              You&apos;re about to submit your predictions for <strong>{roundMatchCount}</strong> {roundName} matches.
              Once submitted, you cannot change them.
            </p>
            {error && <Alert variant="error">{error}</Alert>}
            <div className="flex gap-3">
              <Button
                variant="gray"
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="green"
                onClick={submitRound}
                disabled={submitting}
                loading={submitting}
                loadingText="Submitting..."
                className="flex-1"
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
