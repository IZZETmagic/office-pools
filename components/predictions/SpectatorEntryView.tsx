'use client'

import { useRef } from 'react'
import { Badge } from '@/components/ui/Badge'
import PredictionsFlow from './PredictionsFlow'
import type { ExistingPrediction } from '@/app/pools/[pool_id]/types'
import type { Match, Team } from '@/lib/tournament'

type SpectatorEntryViewProps = {
  ownerName: string
  entryName: string
  entryId: string
  matches: Match[]
  teams: Team[]
  poolId: string
  psoEnabled: boolean
  existingPredictions: ExistingPrediction[]
  onBack: () => void
}

/**
 * Read-only view of ANOTHER member's entry, shown after lock (Phase 3b).
 * Reuses PredictionsFlow with isPastDeadline + hasSubmitted forced true, which
 * makes every input read-only and short-circuits savePredictions — so there is
 * no way to write to an entry that isn't ours (the server would reject it too).
 */
export function SpectatorEntryView({
  ownerName,
  entryName,
  entryId,
  matches,
  teams,
  poolId,
  psoEnabled,
  existingPredictions,
  onBack,
}: SpectatorEntryViewProps) {
  // PredictionsFlow expects an unsaved-changes ref; nothing here ever mutates,
  // so it stays a no-op.
  const noopRef = useRef<{ hasUnsaved: () => boolean; save: () => Promise<void> } | null>(null)

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Entries
      </button>

      {/* Owner header — the screen otherwise assumes "you" */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <h3 className="text-lg font-semibold text-neutral-900">{ownerName}</h3>
        <span className="text-neutral-300">·</span>
        <span className="text-sm text-neutral-500">{entryName}</span>
        <Badge variant="gray">Read-only</Badge>
      </div>

      <PredictionsFlow
        key={entryId}
        matches={matches}
        teams={teams}
        entryId={entryId}
        poolId={poolId}
        existingPredictions={existingPredictions}
        isPastDeadline={true}
        psoEnabled={psoEnabled}
        hasSubmitted={true}
        autoSubmitted={false}
        submittedAt={null}
        lastSavedAt={null}
        predictionsLocked={true}
        onUnsavedChangesRef={noopRef}
        onStatusChange={() => {}}
      />
    </div>
  )
}
