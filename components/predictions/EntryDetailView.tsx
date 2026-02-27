'use client'

import { useCallback, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatTimeAgo } from '@/lib/format'
import PredictionsFlow, { type SaveStatus } from './PredictionsFlow'
import type { EntryData, ExistingPrediction } from '@/app/pools/[pool_id]/types'
import type { Match, Team } from '@/lib/tournament'

type EntryDetailViewProps = {
  entry: EntryData
  onBack: () => void
  // PredictionsFlow props
  matches: Match[]
  teams: Team[]
  poolId: string
  existingPredictions: ExistingPrediction[]
  isPastDeadline: boolean
  psoEnabled: boolean
  predictionsLocked: boolean
  onUnsavedChangesRef: React.RefObject<{ hasUnsaved: () => boolean; save: () => Promise<void> } | null>
  onStatusChange: (status: { saveStatus: SaveStatus; lastSavedAt: string | null; predictedCount: number }) => void
}

export function EntryDetailView({
  entry,
  onBack,
  matches,
  teams,
  poolId,
  existingPredictions,
  isPastDeadline,
  psoEnabled,
  predictionsLocked,
  onUnsavedChangesRef,
  onStatusChange,
}: EntryDetailViewProps) {
  const [predictionStatus, setPredictionStatus] = useState<{
    saveStatus: SaveStatus
    lastSavedAt: string | null
    predictedCount: number
  }>({ saveStatus: 'idle', lastSavedAt: entry.predictions_last_saved_at, predictedCount: 0 })

  const handleStatusChange = useCallback((status: { saveStatus: SaveStatus; lastSavedAt: string | null; predictedCount: number }) => {
    setPredictionStatus(status)
    onStatusChange(status)
  }, [onStatusChange])

  const hasSubmitted = entry.has_submitted_predictions
  const autoSubmitted = entry.auto_submitted
  const statusVariant = autoSubmitted ? 'blue' as const : hasSubmitted ? 'green' as const : predictionStatus.predictedCount > 0 ? 'yellow' as const : 'gray' as const
  const statusLabel = autoSubmitted ? 'Auto-Submitted' : hasSubmitted ? 'Submitted' : predictionStatus.predictedCount > 0 ? 'Draft' : 'Not Started'

  return (
    <div>
      {/* Back navigation */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Entries
      </button>

      {/* Entry header */}
      <div className="flex items-center gap-2 mb-6">
        <h3 className="text-lg font-semibold text-neutral-900">{entry.entry_name}</h3>
        <Badge variant={statusVariant}>{statusLabel}</Badge>

        {/* Save status (right-aligned) */}
        <span className="ml-auto text-xs text-neutral-400" suppressHydrationWarning>
          {predictionStatus.saveStatus === 'saving' && 'Saving...'}
          {predictionStatus.saveStatus === 'saved' && '\u2713 Saved'}
          {predictionStatus.saveStatus === 'error' && <span className="text-danger-600">Failed</span>}
          {predictionStatus.saveStatus === 'idle' && predictionStatus.lastSavedAt && !hasSubmitted && `Saved ${formatTimeAgo(predictionStatus.lastSavedAt)}`}
          {hasSubmitted && entry.predictions_submitted_at && formatTimeAgo(entry.predictions_submitted_at)}
        </span>
      </div>

      {/* PredictionsFlow */}
      <PredictionsFlow
        key={entry.entry_id}
        matches={matches}
        teams={teams}
        entryId={entry.entry_id}
        poolId={poolId}
        existingPredictions={existingPredictions}
        isPastDeadline={isPastDeadline}
        psoEnabled={psoEnabled}
        hasSubmitted={hasSubmitted}
        autoSubmitted={autoSubmitted}
        submittedAt={entry.predictions_submitted_at}
        lastSavedAt={entry.predictions_last_saved_at}
        predictionsLocked={predictionsLocked}
        onUnsavedChangesRef={onUnsavedChangesRef}
        onStatusChange={handleStatusChange}
      />
    </div>
  )
}
