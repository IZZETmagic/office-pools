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
  getKnockoutWinner,
  isStageComplete,
  isPredictionComplete,
} from '@/lib/tournament'
import { resolveFullBracket } from '@/lib/bracketResolver'
import { GroupStageForm } from './GroupStageForm'
import { KnockoutStageForm } from './KnockoutStageForm'
import { SummaryView } from './SummaryView'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type Props = {
  matches: Match[]
  teams: Team[]
  memberId: string
  poolId: string
  existingPredictions: Prediction[]
  isPastDeadline: boolean
  psoEnabled: boolean
  hasSubmitted: boolean
  submittedAt: string | null
  lastSavedAt: string | null
  predictionsLocked: boolean
  onUnsavedChangesRef?: React.RefObject<{ hasUnsaved: () => boolean; save: () => Promise<void> } | null>
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// Stage match count helpers
const STAGE_MATCH_STAGES: Record<string, string[]> = {
  group: ['group'],
  round_32: ['round_32'],
  round_16: ['round_16'],
  quarter_final: ['quarter_final'],
  semi_final: ['semi_final'],
  finals: ['third_place', 'final'],
}

export default function PredictionsFlow({
  matches,
  teams,
  memberId,
  poolId,
  existingPredictions,
  isPastDeadline,
  psoEnabled,
  hasSubmitted: initialHasSubmitted,
  submittedAt: initialSubmittedAt,
  lastSavedAt: initialLastSavedAt,
  predictionsLocked,
  onUnsavedChangesRef,
}: Props) {
  // =============================================
  // STATE
  // =============================================

  const [currentStage, setCurrentStage] = useState(0)
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSubmitted, setHasSubmitted] = useState(initialHasSubmitted)
  const [submittedAt, setSubmittedAt] = useState(initialSubmittedAt)
  const [lastSavedAt, setLastSavedAt] = useState(initialLastSavedAt)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)
  const [recoveryData, setRecoveryData] = useState<Record<string, ScoreEntry> | null>(null)
  const [recoveryTimestamp, setRecoveryTimestamp] = useState<number | null>(null)

  // Track existing prediction IDs for upsert logic
  const existingPredictionIds = useRef(
    new Map(existingPredictions.filter(p => p.prediction_id).map(p => [p.match_id, p.prediction_id!]))
  )

  const supabase = createClient()
  const { showToast } = useToast()

  // Expose unsaved changes state to parent for nav warning
  useEffect(() => {
    if (onUnsavedChangesRef) {
      (onUnsavedChangesRef as React.MutableRefObject<{ hasUnsaved: () => boolean; save: () => Promise<void> } | null>).current = {
        hasUnsaved: () => pendingChanges.current,
        save: () => savePredictions(),
      }
    }
  })

  // Track unsaved changes
  const pendingChanges = useRef(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const periodicSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSavedPredictions = useRef(new Map(predictions))

  // =============================================
  // COMPUTED: PROGRESS
  // =============================================

  const totalMatches = matches.length
  const predictedCount = Array.from(predictions.values()).filter(p => isPredictionComplete(p)).length
  const progressPercent = totalMatches > 0 ? Math.round((predictedCount / totalMatches) * 100) : 0

  const stageProgress = useMemo(() => {
    const progress: { stage: string; label: string; predicted: number; total: number }[] = []
    for (const [stageKey, matchStages] of Object.entries(STAGE_MATCH_STAGES)) {
      const stageMatches = matches.filter(m => matchStages.includes(m.stage))
      const stagePredicted = stageMatches.filter(m => isPredictionComplete(predictions.get(m.match_id))).length
      progress.push({
        stage: stageKey,
        label: STAGE_LABELS[stageKey] || stageKey,
        predicted: stagePredicted,
        total: stageMatches.length,
      })
    }
    return progress
  }, [matches, predictions])

  const hasUnsavedChanges = useMemo(() => {
    return pendingChanges.current
  }, [predictions, saveStatus])

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
    setSaveStatus('idle')

    // Debounced auto-save (500ms)
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      if (pendingChanges.current) {
        savePredictions()
      }
    }, 500)
  }, [])

  // =============================================
  // PERIODIC SAVE (every 60s safety net)
  // =============================================

  useEffect(() => {
    periodicSaveTimer.current = setInterval(() => {
      if (pendingChanges.current && !saving) {
        savePredictions()
      }
    }, 60000)

    return () => {
      if (periodicSaveTimer.current) clearInterval(periodicSaveTimer.current)
    }
  }, [saving])

  // =============================================
  // BEFOREUNLOAD WARNING
  // =============================================

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingChanges.current) {
        e.preventDefault()
        // Trigger a save attempt
        savePredictions()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      if (periodicSaveTimer.current) clearInterval(periodicSaveTimer.current)
    }
  }, [])

  // =============================================
  // OFFLINE DETECTION
  // =============================================

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      showToast('Back online. Syncing...', 'info')
      // Sync any pending changes
      if (pendingChanges.current) {
        savePredictions()
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      showToast('You\'re offline. Predictions will save when reconnected.', 'warning', { duration: 6000 })
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // =============================================
  // LOCALSTORAGE RECOVERY ON MOUNT
  // =============================================

  useEffect(() => {
    try {
      const backup = localStorage.getItem(`predictions_backup_${poolId}`)
      if (backup) {
        const parsed = JSON.parse(backup)
        // Check if it has a timestamp wrapper or is raw data
        const data = parsed.timestamp ? parsed.predictions : parsed
        const timestamp = parsed.timestamp || Date.now()
        const ageInHours = (Date.now() - timestamp) / (1000 * 60 * 60)

        if (ageInHours < 24 && data && Object.keys(data).length > 0) {
          setRecoveryData(data)
          setRecoveryTimestamp(timestamp)
          setShowRecoveryModal(true)
        } else {
          // Stale backup, discard
          localStorage.removeItem(`predictions_backup_${poolId}`)
        }
      }
    } catch {
      // Corrupted backup, discard
      localStorage.removeItem(`predictions_backup_${poolId}`)
    }
  }, [poolId])

  const handleRecoverBackup = () => {
    if (recoveryData) {
      const next = new Map(predictions)
      for (const [matchId, scores] of Object.entries(recoveryData)) {
        next.set(matchId, scores as ScoreEntry)
      }
      setPredictions(next)
      pendingChanges.current = true
      localStorage.removeItem(`predictions_backup_${poolId}`)
      setShowRecoveryModal(false)
      setRecoveryData(null)
      showToast('Predictions recovered! Saving...', 'success')
      // Trigger save of recovered data
      setTimeout(() => savePredictions(), 500)
    }
  }

  const handleDiscardBackup = () => {
    localStorage.removeItem(`predictions_backup_${poolId}`)
    setShowRecoveryModal(false)
    setRecoveryData(null)
    showToast('Backup discarded', 'info')
  }

  // =============================================
  // COMPUTED: FULL BRACKET (groups, knockout, champion)
  // =============================================

  const bracket = useMemo(() => {
    return resolveFullBracket({ matches, predictionMap: predictions, teams })
  }, [matches, predictions, teams])

  const allGroupStandings = bracket.allGroupStandings
  const knockoutTeamMap = bracket.knockoutTeamMap
  const champion = bracket.champion

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
  // SAVE PREDICTIONS (via API)
  // =============================================

  const savePredictions = async () => {
    if (saving || hasSubmitted) return

    // If offline, save to localStorage immediately
    if (!navigator.onLine) {
      try {
        const backup: Record<string, ScoreEntry> = {}
        for (const [k, v] of predictions) backup[k] = v
        localStorage.setItem(`predictions_backup_${poolId}`, JSON.stringify({
          predictions: backup,
          timestamp: Date.now(),
        }))
        showToast('Saved locally. Will sync when online.', 'warning')
      } catch {}
      return
    }

    setSaving(true)
    setSaveStatus('saving')
    setError(null)
    pendingChanges.current = false

    const predictionsPayload: {
      matchId: string
      predictionId?: string
      homeScore: number
      awayScore: number
      homePso?: number | null
      awayPso?: number | null
      winnerTeamId?: string | null
    }[] = []

    for (const [matchId, scores] of predictions) {
      // Only save predictions where at least one score has been entered
      if (scores.home == null && scores.away == null) continue
      const existingId = existingPredictionIds.current.get(matchId)
      predictionsPayload.push({
        matchId,
        predictionId: existingId,
        homeScore: scores.home ?? 0,
        awayScore: scores.away ?? 0,
        homePso: scores.homePso ?? null,
        awayPso: scores.awayPso ?? null,
        winnerTeamId: scores.winnerTeamId ?? null,
      })
    }

    // Auto-retry with exponential backoff (3 attempts)
    let lastError: string = 'Failed to save'
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)))
          setSaveStatus('saving')
        }

        const res = await fetch(`/api/pools/${poolId}/predictions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ predictions: predictionsPayload }),
        })

        // Session expiry detection
        if (res.status === 401) {
          setSaveStatus('error')
          setError('Session expired. Please log in again.')
          showToast('Session expired. Redirecting to login...', 'error', { duration: 3000 })
          // Save to localStorage before redirect
          try {
            const backup: Record<string, ScoreEntry> = {}
            for (const [k, v] of predictions) backup[k] = v
            localStorage.setItem(`predictions_backup_${poolId}`, JSON.stringify({
              predictions: backup,
              timestamp: Date.now(),
            }))
          } catch {}
          setTimeout(() => { window.location.href = '/login' }, 2000)
          setSaving(false)
          return
        }

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to save')
        }

        const data = await res.json()

        // Track newly inserted IDs
        if (data.insertedIds) {
          for (const { match_id, prediction_id } of data.insertedIds) {
            existingPredictionIds.current.set(match_id, prediction_id)
          }
        }

        setLastSavedAt(data.lastSaved)
        setSaveStatus('saved')
        lastSavedPredictions.current = new Map(predictions)

        // Clear any localStorage backup on successful save
        try { localStorage.removeItem(`predictions_backup_${poolId}`) } catch {}

        // Reset to idle after 3 seconds
        setTimeout(() => {
          setSaveStatus(prev => prev === 'saved' ? 'idle' : prev)
        }, 3000)

        setSaving(false)
        return // Success — exit retry loop
      } catch (err: any) {
        lastError = err.message || 'Failed to save'
        if (attempt < 2) {
          showToast(`Save failed. Retrying... (${attempt + 2}/3)`, 'warning')
        }
      }
    }

    // All retries exhausted — save to localStorage
    setSaveStatus('error')
    setError(lastError)

    try {
      const backup: Record<string, ScoreEntry> = {}
      for (const [k, v] of predictions) backup[k] = v
      localStorage.setItem(`predictions_backup_${poolId}`, JSON.stringify({
        predictions: backup,
        timestamp: Date.now(),
      }))
      showToast('Could not save to server. Predictions saved locally.', 'error', { duration: 6000 })
    } catch {}

    setSaving(false)
  }

  // =============================================
  // SUBMIT ALL PREDICTIONS (final)
  // =============================================

  const submitPredictions = async () => {
    setSubmitting(true)
    setError(null)

    try {
      // Save first
      await savePredictions()

      // Then submit
      const res = await fetch(`/api/pools/${poolId}/predictions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit predictions')
      }

      setHasSubmitted(true)
      setSubmittedAt(data.submittedAt)
      setShowSubmitModal(false)
    } catch (err: any) {
      setError(err.message || 'Failed to submit predictions')
    } finally {
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
  // READ-ONLY MODE CHECK
  // =============================================

  const isReadOnly = hasSubmitted || predictionsLocked || isPastDeadline

  // =============================================
  // RENDER: LOCKED / SUBMITTED / DEADLINE STATES
  // =============================================

  if (isPastDeadline && !hasSubmitted) {
    return (
      <div>
        <StatusBanner
          type="locked"
          message="The prediction deadline has passed. You can no longer submit or edit predictions."
        />
        {predictedCount > 0 && (
          <div className="mt-4">
            <ProgressBar predicted={predictedCount} total={totalMatches} stageProgress={stageProgress} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Status Banner */}
      {hasSubmitted && (
        <StatusBanner
          type="submitted"
          message={`Your predictions were submitted${submittedAt ? ` on ${formatDate(submittedAt)}` : ''}. Good luck!`}
        />
      )}

      {predictionsLocked && !hasSubmitted && (
        <StatusBanner
          type="locked"
          message="Your predictions have been locked by the pool admin."
        />
      )}

      {/* Progress Indicator */}
      <ProgressBar
        predicted={predictedCount}
        total={totalMatches}
        stageProgress={stageProgress}
        lastSavedAt={lastSavedAt}
        saveStatus={saveStatus}
        status={hasSubmitted ? 'submitted' : 'draft'}
        submittedAt={submittedAt}
      />

      {/* Error message */}
      {error && (
        <Alert variant="error" className="mt-4">
          {error}
          {saveStatus === 'error' && (
            <button
              onClick={() => { setError(null); savePredictions() }}
              className="ml-2 underline font-medium"
            >
              Retry
            </button>
          )}
        </Alert>
      )}

      {/* Stage navigation pills */}
      <div className="mt-6 mb-6">
        <div className="flex gap-1 overflow-x-auto pb-2">
          {STAGES.map((stage, idx) => {
            const isCurrent = idx === currentStage
            const stageKeys = STAGE_MATCH_STAGES[stage]
            const stageMatchCount = stageKeys ? matches.filter(m => stageKeys.includes(m.stage)).length : 0
            const stagePredCount = stageKeys ? matches.filter(m => stageKeys.includes(m.stage) && isPredictionComplete(predictions.get(m.match_id))).length : 0
            const isComplete = stageMatchCount > 0 && stagePredCount === stageMatchCount
            return (
              <button
                key={stage}
                type="button"
                onClick={() => goToStage(idx)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                  isCurrent
                    ? 'bg-blue-600 text-white'
                    : isComplete
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : stagePredCount > 0
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {STAGE_LABELS[stage]}
                {stage !== 'summary' && stageMatchCount > 0 && (
                  <span className="ml-1 opacity-70">{stagePredCount}/{stageMatchCount}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

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
          onUpdatePrediction={isReadOnly ? undefined : updatePrediction}
          readOnly={isReadOnly}
        />
      )}

      {stageName === 'round_32' && (
        <KnockoutStageForm
          stage="round_32"
          resolvedMatches={getResolvedMatchesForStage('round_32')}
          predictions={predictions}
          onUpdatePrediction={isReadOnly ? undefined : updatePrediction}
          psoEnabled={psoEnabled}
          readOnly={isReadOnly}
        />
      )}

      {stageName === 'round_16' && (
        <KnockoutStageForm
          stage="round_16"
          resolvedMatches={getResolvedMatchesForStage('round_16')}
          predictions={predictions}
          onUpdatePrediction={isReadOnly ? undefined : updatePrediction}
          psoEnabled={psoEnabled}
          readOnly={isReadOnly}
        />
      )}

      {stageName === 'quarter_final' && (
        <KnockoutStageForm
          stage="quarter_final"
          resolvedMatches={getResolvedMatchesForStage('quarter_final')}
          predictions={predictions}
          onUpdatePrediction={isReadOnly ? undefined : updatePrediction}
          psoEnabled={psoEnabled}
          readOnly={isReadOnly}
        />
      )}

      {stageName === 'semi_final' && (
        <KnockoutStageForm
          stage="semi_final"
          resolvedMatches={getResolvedMatchesForStage('semi_final')}
          predictions={predictions}
          onUpdatePrediction={isReadOnly ? undefined : updatePrediction}
          psoEnabled={psoEnabled}
          readOnly={isReadOnly}
        />
      )}

      {stageName === 'finals' && (
        <KnockoutStageForm
          stage="finals"
          resolvedMatches={getResolvedMatchesForStage('finals')}
          predictions={predictions}
          onUpdatePrediction={isReadOnly ? undefined : updatePrediction}
          psoEnabled={psoEnabled}
          readOnly={isReadOnly}
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
          onSubmit={() => setShowSubmitModal(true)}
          submitting={submitting}
          hasSubmitted={hasSubmitted}
          readOnly={isReadOnly}
        />
      )}

      {/* Navigation buttons — Back left, Proceed right */}
      {stageName !== 'summary' && (
        <div className="mt-6 sm:mt-8 flex items-center justify-between">
          <div>
            {currentStage > 0 && (
              <Button variant="outline" size="sm" onClick={goBack}>
                Back
              </Button>
            )}
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={goNext}
            disabled={!canProceed}
          >
            {canProceed
              ? `Proceed to ${STAGE_LABELS[STAGES[currentStage + 1]] || 'Summary'}`
              : `Complete all ${STAGE_LABELS[stageName]?.toLowerCase()} predictions`
            }
          </Button>
        </div>
      )}

      {/* Submit Confirmation Modal — full-screen on mobile, centered on desktop */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowSubmitModal(false)} />
          <div className="relative bg-white sm:rounded-xl rounded-t-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Submit Final Predictions?
            </h3>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800">
                Once submitted, you <strong>cannot</strong> make changes to your predictions.
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-700">
                Progress: <strong>{predictedCount} / {totalMatches}</strong> matches ({progressPercent}%)
              </p>
            </div>
            {predictedCount < totalMatches && (
              <Alert variant="error" className="mb-4">
                You have not predicted all matches. You must complete all {totalMatches} predictions before submitting.
              </Alert>
            )}
            <div className="flex gap-3">
              <Button
                variant="gray"
                onClick={() => setShowSubmitModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="green"
                onClick={submitPredictions}
                disabled={submitting || predictedCount < totalMatches}
                loading={submitting}
                loadingText="Submitting..."
                className="flex-1"
              >
                Submit Predictions
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Recovery Modal — recover unsaved predictions from localStorage */}
      {showRecoveryModal && recoveryData && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" />
          <div className="relative bg-white sm:rounded-xl rounded-t-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Recover Unsaved Predictions?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              We found predictions from{' '}
              <strong>{recoveryTimestamp ? timeAgo(new Date(recoveryTimestamp).toISOString()) : 'earlier'}</strong>
              {' '}that weren&apos;t saved to the server. Would you like to recover them?
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                <strong>{Object.keys(recoveryData).length}</strong> predictions found in local backup.
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="gray"
                onClick={handleDiscardBackup}
                className="flex-1"
              >
                Discard
              </Button>
              <Button
                variant="primary"
                onClick={handleRecoverBackup}
                className="flex-1"
              >
                Recover
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium shadow-md">
          You&apos;re offline. Predictions will save when you reconnect.
        </div>
      )}

      {/* Sticky bottom progress bar on mobile */}
      {stageName !== 'summary' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 sm:hidden z-40">
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${progressPercent === 100 ? 'bg-green-500' : 'bg-blue-600'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 whitespace-nowrap">
              {predictedCount}/{totalMatches}
            </span>
            {saveStatus === 'saving' && (
              <span className="text-[10px] text-gray-400 whitespace-nowrap">Saving...</span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-[10px] text-green-600 whitespace-nowrap">{'\u2713'}</span>
            )}
          </div>
        </div>
      )}

      {/* Bottom spacer for mobile sticky bar */}
      {stageName !== 'summary' && (
        <div className="h-12 sm:hidden" />
      )}
    </div>
  )
}

// =============================================
// STATUS BANNER COMPONENT
// =============================================

function StatusBanner({ type, message }: { type: 'submitted' | 'locked'; message: string }) {
  const styles = {
    submitted: 'bg-green-50 border-green-200 text-green-800',
    locked: 'bg-gray-50 border-gray-200 text-gray-800',
  }
  const icons = {
    submitted: (
      <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    locked: (
      <svg className="w-5 h-5 text-gray-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  }

  return (
    <div className={`flex items-center gap-3 p-4 rounded-lg border ${styles[type]} mb-4`}>
      {icons[type]}
      <p className="text-sm font-medium">{message}</p>
    </div>
  )
}

// =============================================
// PROGRESS BAR COMPONENT
// =============================================

function ProgressBar({
  predicted,
  total,
  stageProgress,
  lastSavedAt,
  saveStatus,
  status,
  submittedAt,
}: {
  predicted: number
  total: number
  stageProgress: { stage: string; label: string; predicted: number; total: number }[]
  lastSavedAt?: string | null
  saveStatus?: SaveStatus
  status?: 'draft' | 'submitted'
  submittedAt?: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const percent = total > 0 ? Math.round((predicted / total) * 100) : 0

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4">
      {/* Single row: label, status badge, progress bar, count, save status, details toggle */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
        {/* Label + status badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          <h4 className="text-xs sm:text-sm font-semibold text-gray-700">Progress</h4>
          {status === 'submitted' && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-green-100 text-green-700">
              Submitted
            </span>
          )}
          {status === 'draft' && predicted > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-amber-100 text-amber-700">
              Draft
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="flex-1 min-w-[80px]">
          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                percent === 100 ? 'bg-green-500' : 'bg-blue-600'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Count */}
        <span className="text-xs font-medium text-gray-600 whitespace-nowrap shrink-0">
          {predicted}/{total}
        </span>

        {/* Save status */}
        <span className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap shrink-0">
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'saved' && '\u2713 Saved'}
          {saveStatus === 'error' && (
            <span className="text-red-600">Failed</span>
          )}
          {(!saveStatus || saveStatus === 'idle') && lastSavedAt && `Saved ${timeAgo(lastSavedAt)}`}
          {(!saveStatus || saveStatus === 'idle') && !lastSavedAt && status !== 'submitted' && predicted > 0 && 'Unsaved'}
          {status === 'submitted' && submittedAt && `${timeAgo(submittedAt)}`}
        </span>

        {/* Details toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] sm:text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
        >
          {expanded ? 'Hide' : 'Details'}
        </button>
      </div>

      {/* Expanded: per-stage breakdown */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
          {stageProgress.map(sp => {
            const isComplete = sp.total > 0 && sp.predicted === sp.total
            const isPartial = sp.predicted > 0 && sp.predicted < sp.total
            return (
              <div key={sp.stage} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={isComplete ? 'text-green-600' : isPartial ? 'text-amber-600' : 'text-gray-400'}>
                    {isComplete ? '\u2705' : isPartial ? '\u231B' : '\u25CB'}
                  </span>
                  <span className="text-gray-700">{sp.label}</span>
                </div>
                <span className={`font-medium ${isComplete ? 'text-green-600' : 'text-gray-500'}`}>
                  {sp.predicted} / {sp.total}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// =============================================
// HELPERS
// =============================================

function timeAgo(dateStr: string) {
  const now = new Date()
  const then = new Date(dateStr)
  const diffMs = now.getTime() - then.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffSec < 10) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
