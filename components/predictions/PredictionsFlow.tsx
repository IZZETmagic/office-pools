'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Icon } from '@/components/ui/Icon'
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
import { resolvePredictedBracket } from '@/lib/bracketResolver'
import { GroupStageForm } from './GroupStageForm'
import { KnockoutStageForm } from './KnockoutStageForm'
import { SummaryView } from './SummaryView'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useRouter } from 'next/navigation'

type Props = {
  matches: Match[]
  teams: Team[]
  entryId: string
  poolId: string
  existingPredictions: Prediction[]
  isPastDeadline: boolean
  psoEnabled: boolean
  hasSubmitted: boolean
  autoSubmitted?: boolean
  submittedAt: string | null
  lastSavedAt: string | null
  predictionsLocked: boolean
  onUnsavedChangesRef?: React.RefObject<{ hasUnsaved: () => boolean; save: () => Promise<void> } | null>
  onStatusChange?: (status: { saveStatus: SaveStatus; lastSavedAt: string | null; predictedCount: number }) => void
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

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
  entryId,
  poolId,
  existingPredictions,
  isPastDeadline,
  psoEnabled,
  hasSubmitted: initialHasSubmitted,
  autoSubmitted = false,
  submittedAt: initialSubmittedAt,
  lastSavedAt: initialLastSavedAt,
  predictionsLocked,
  onUnsavedChangesRef,
  onStatusChange,
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
  const [error, setError] = useState<string | null>(null)
  // ⚠ `hasSubmitted` and `submittedAt` are now READ-ONLY props, held as plain
  // consts rather than state. Nothing in this component can change them any
  // more: the submit action that used to set them is gone, and the flag is
  // written server-side by the save path. Keeping them as `useState` would
  // leave setters that look available and would silently desync the screen from
  // the database if anyone reached for one.
  const hasSubmitted = initialHasSubmitted
  const submittedAt = initialSubmittedAt
  const [lastSavedAt, setLastSavedAt] = useState(initialLastSavedAt)
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
  const router = useRouter()

  // Expose unsaved changes state to parent for nav warning
  useEffect(() => {
    if (onUnsavedChangesRef) {
      (onUnsavedChangesRef as React.MutableRefObject<{ hasUnsaved: () => boolean; save: () => Promise<void> } | null>).current = {
        hasUnsaved: () => pendingChanges.current,
        save: () => savePredictionsRef.current(),
      }
    }
  })

  // Track unsaved changes
  const pendingChanges = useRef(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const periodicSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSavedPredictions = useRef(new Map(predictions))

  // Ref to always call the latest savePredictions (avoids stale closures)
  const savePredictionsRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // =============================================
  // COMPUTED: PROGRESS
  // =============================================

  const totalMatches = matches.length
  const predictedCount = Array.from(predictions.values()).filter(p => isPredictionComplete(p)).length
  /**
   * "Submitted", derived.
   *
   * Every match predicted — the same `done >= total` rule the league path has
   * always used (`deriveRoundSubmissions`, lib/league/read.ts). This is what
   * the Submit button used to assert, except that it is now a fact about the
   * picks rather than a claim the member had to make about them, so it cannot
   * disagree with what is stored.
   *
   * `> 0` guards the empty pool: zero of zero is not a completed entry.
   */
  const isComplete = totalMatches > 0 && predictedCount >= totalMatches
  const progressPercent = totalMatches > 0 ? Math.round((predictedCount / totalMatches) * 100) : 0

  const hasUnsavedChanges = useMemo(() => {
    return pendingChanges.current
  }, [predictions, saveStatus])

  // Report status to parent
  useEffect(() => {
    onStatusChange?.({ saveStatus, lastSavedAt, predictedCount })
  }, [saveStatus, lastSavedAt, predictedCount, onStatusChange])

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
        savePredictionsRef.current()
      }
    }, 500)
  }, [])

  // =============================================
  // PERIODIC SAVE (every 60s safety net)
  // =============================================

  useEffect(() => {
    periodicSaveTimer.current = setInterval(() => {
      if (pendingChanges.current && !saving) {
        savePredictionsRef.current()
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
        savePredictionsRef.current()
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
        savePredictionsRef.current()
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
      const backup = localStorage.getItem(`predictions_backup_${poolId}_${entryId}`)
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
          localStorage.removeItem(`predictions_backup_${poolId}_${entryId}`)
        }
      }
    } catch {
      // Corrupted backup, discard
      localStorage.removeItem(`predictions_backup_${poolId}_${entryId}`)
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
      localStorage.removeItem(`predictions_backup_${poolId}_${entryId}`)
      setShowRecoveryModal(false)
      setRecoveryData(null)
      showToast('Predictions recovered! Saving...', 'success')
      // Trigger save of recovered data
      setTimeout(() => savePredictionsRef.current(), 500)
    }
  }

  const handleDiscardBackup = () => {
    localStorage.removeItem(`predictions_backup_${poolId}_${entryId}`)
    setShowRecoveryModal(false)
    setRecoveryData(null)
    showToast('Backup discarded', 'info')
  }

  // =============================================
  // COMPUTED: FULL BRACKET (groups, knockout, champion)
  // =============================================

  const bracket = useMemo(() => {
    return resolvePredictedBracket({ matches, predictionMap: predictions, teams })
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
    // ⚠ `hasSubmitted` deliberately absent from this guard. The flag is now set
    // by the FIRST save (POST /predictions), so keeping it here would have made
    // every entry's second save a silent no-op — the auto-save would appear to
    // run, the bar would say Saved, and nothing after the first burst would ever
    // reach the database.
    if (saving) return

    // If offline, save to localStorage immediately
    if (!navigator.onLine) {
      try {
        const backup: Record<string, ScoreEntry> = {}
        for (const [k, v] of predictions) backup[k] = v
        localStorage.setItem(`predictions_backup_${poolId}_${entryId}`, JSON.stringify({
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
          body: JSON.stringify({ entryId, predictions: predictionsPayload }),
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
            localStorage.setItem(`predictions_backup_${poolId}_${entryId}`, JSON.stringify({
              predictions: backup,
              timestamp: Date.now(),
            }))
          } catch {}
          setTimeout(() => { router.push('/login') }, 2000)
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
        try { localStorage.removeItem(`predictions_backup_${poolId}_${entryId}`) } catch {}

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
      localStorage.setItem(`predictions_backup_${poolId}_${entryId}`, JSON.stringify({
        predictions: backup,
        timestamp: Date.now(),
      }))
      showToast('Could not save to server. Predictions saved locally.', 'error', { duration: 6000 })
    } catch {}

    setSaving(false)
  }

  // Keep ref in sync so stale closures always call the latest version
  savePredictionsRef.current = savePredictions

  // =============================================
  // NO SUBMIT STEP
  // =============================================
  // `submitPredictions` and its confirmation modal were deleted 2026-08-29.
  // Picks save as they are made; the deadline is the only switch. "Submitted"
  // survives as a DERIVED state — see `isComplete` above — so the member still
  // gets told when their entry is whole, without having to assert it.
  //
  // The modal it opened is worth remembering, because it is what the change is
  // against: it warned "Once submitted, you cannot make changes." That was true
  // and it was the problem.

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

  // ⚠ `hasSubmitted` no longer closes the form — the deadline does. It now
  // means "this entry has saved picks", which is true from the first save, so
  // leaving it here would have locked members out of their own predictions the
  // moment they made one.
  const isReadOnly = predictionsLocked || isPastDeadline

  // =============================================
  // RENDER: LOCKED / SUBMITTED / DEADLINE STATES
  // =============================================

  if (isPastDeadline && !hasSubmitted) {
    return (
      <div>
        <StatusBanner
          type="locked"
          message="The prediction deadline has passed. You can no longer edit predictions."
        />
      </div>
    )
  }

  return (
    <div>
      {/* Status banners.

          ⚠ "SUBMITTED" IS DERIVED FROM THE PICKS, not from a flag and not from
          a button. `isComplete` — every match predicted and saved — is the same
          rule `deriveRoundSubmissions` (lib/league/read.ts) has always applied
          to a league matchweek, now applied here too.

          It cannot be `hasSubmitted`: that column is true from the member's
          FIRST save, so it would announce "you're done" to somebody one pick
          into sixty-four.

          And being submitted does not close anything — the banner says so,
          because the member can still change any of it until the deadline. */}
      {isComplete && !isPastDeadline && (
        <StatusBanner
          type="submitted"
          message={`All ${totalMatches} predictions are in and saved. You can still change them until the deadline.`}
        />
      )}
      {isPastDeadline && autoSubmitted && (
        <StatusBanner
          type="auto-submitted"
          message={`Your predictions were auto-submitted when the deadline passed${submittedAt ? ` on ${formatDate(submittedAt)}` : ''}. Any missing predictions will earn 0 points.`}
        />
      )}
      {/* ⚠ NO DATE ON THIS ONE. `submittedAt` now records the FIRST SAVE rather
          than the press of a submit button, so "submitted on 3 June" would name
          the day they started picking, not the day their picks closed. */}
      {isPastDeadline && !autoSubmitted && (
        <StatusBanner
          type="submitted"
          message={isComplete
            ? 'Your predictions are locked in. Good luck!'
            : `The deadline has passed. ${predictedCount} of ${totalMatches} predictions are in; the rest will earn 0 points.`}
        />
      )}

      {predictionsLocked && !hasSubmitted && (
        <StatusBanner
          type="locked"
          message="Your predictions have been locked by the pool admin."
        />
      )}

      {/* Error message */}
      {error && (
        <Alert variant="error" className="mt-4 mb-4">
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

      {/* Stage navigation pills + status */}
      <div className="mt-2 mb-6">
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
                    ? 'bg-primary-600 text-white'
                    : isComplete
                    ? 'bg-success-100 text-success-700 hover:bg-success-200'
                    : stagePredCount > 0
                    ? 'bg-warning-100 text-warning-700 hover:bg-warning-200'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
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
      <h3 className="text-2xl font-bold text-neutral-900 mb-6">
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
          // Derived completeness, NOT the `hasSubmitted` flag — that one is
          // true from the first save and would call a one-pick entry finished.
          hasSubmitted={isComplete}
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

      {/* Recovery Modal — recover unsaved predictions from localStorage */}
      {showRecoveryModal && recoveryData && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" />
          <div className="relative bg-surface sm:rounded-2xl rounded-t-2xl shadow-xl sm:max-w-md w-full p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">
              Recover Unsaved Predictions?
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
              We found predictions from{' '}
              <strong>{recoveryTimestamp ? timeAgo(new Date(recoveryTimestamp).toISOString()) : 'earlier'}</strong>
              {' '}that weren&apos;t saved to the server. Would you like to recover them?
            </p>
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-primary-800">
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
        <div className="fixed top-0 left-0 right-0 z-50 bg-warning-500 text-white text-center py-2 px-4 text-sm font-medium shadow-md">
          You&apos;re offline. Predictions will save when you reconnect.
        </div>
      )}

      {/* Sticky bottom progress bar on mobile */}
      {stageName !== 'summary' && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-neutral-200 p-3 sm:hidden z-40">
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${progressPercent === 100 ? 'bg-success-500' : 'bg-primary-600'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs text-neutral-600 whitespace-nowrap">
              {predictedCount}/{totalMatches}
            </span>
            {saveStatus === 'saving' && (
              <span className="text-[10px] text-neutral-400 whitespace-nowrap">Saving...</span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-[10px] text-success-600 whitespace-nowrap">{'\u2713'}</span>
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

function StatusBanner({ type, message }: { type: 'submitted' | 'locked' | 'auto-submitted'; message: string }) {
  const styles = {
    submitted: 'bg-success-50 border-success-200 text-success-800',
    locked: 'bg-neutral-50 border-neutral-200 text-neutral-800',
    'auto-submitted': 'bg-primary-50 border-primary-200 text-primary-800',
  }
  const icons = {
    submitted: (
      <Icon name="checkmark.circle.fill" size={20} className="text-success-600 shrink-0" />
    ),
    locked: (
      <Icon name="lock.fill" size={20} className="text-neutral-600 shrink-0" />
    ),
    'auto-submitted': (
      <Icon name="clock" size={20} className="text-primary-600 shrink-0" />
    ),
  }

  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border ${styles[type]} mb-4`}>
      {icons[type]}
      <p className="text-sm font-medium">{message}</p>
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
