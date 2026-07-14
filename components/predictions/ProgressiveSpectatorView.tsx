'use client'

import { useRef } from 'react'
import ProgressivePredictionsFlow from './ProgressivePredictionsFlow'
import { SpectatorFrame } from './SpectatorFrame'
import type { ExistingPrediction, PoolRoundState } from '@/app/pools/[pool_id]/types'
import type { Match, Team } from '@/lib/tournament'

type ProgressiveSpectatorViewProps = {
  ownerName: string
  entryName: string
  entryId: string
  matches: Match[]
  teams: Team[]
  poolId: string
  psoEnabled: boolean
  /** Other member's picks — already gated to revealed rounds by the SSR filter. */
  existingPredictions: ExistingPrediction[]
  roundStates: PoolRoundState[]
  onBack: () => void
}

/**
 * Read-only view of ANOTHER member's progressive entry (Phase 3b). Reuses
 * ProgressivePredictionsFlow with predictionsLocked forced true → isReadOnly is
 * always true, so no input is editable and savePredictions short-circuits. Only
 * the rounds already locked pool-wide are present in existingPredictions (the
 * SSR reveal filter strips the rest), so unlocked rounds simply render empty.
 */
export function ProgressiveSpectatorView({
  ownerName,
  entryName,
  entryId,
  matches,
  teams,
  poolId,
  psoEnabled,
  existingPredictions,
  roundStates,
  onBack,
}: ProgressiveSpectatorViewProps) {
  const noopRef = useRef<{ hasUnsaved: () => boolean; save: () => Promise<void> } | null>(null)

  return (
    <SpectatorFrame ownerName={ownerName} entryName={entryName} onBack={onBack}>
      <ProgressivePredictionsFlow
        key={entryId}
        matches={matches}
        teams={teams}
        entryId={entryId}
        poolId={poolId}
        existingPredictions={existingPredictions}
        psoEnabled={psoEnabled}
        predictionsLocked={true}
        roundStates={roundStates}
        roundSubmissions={[]}
        onUnsavedChangesRef={noopRef}
        onStatusChange={() => {}}
      />
    </SpectatorFrame>
  )
}
