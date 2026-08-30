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
  /**
   * League pools only, and passed for one reason: the flow picks its control
   * from this. Without it a Results pool rendered the SCORES form here, so
   * spectating a pool where nobody can type a scoreline offered two score
   * boxes per fixture.
   *
   * ⚠ No `existingOutcomes` beside it, ever. That prop carries the VIEWER's own
   * Results picks — the page loads them for the default entry only — and
   * feeding them to a view of somebody else's entry would show your picks under
   * their name. See the note in the body about what is genuinely missing here.
   */
  leagueDepth?: 'results' | 'scores' | null
  onBack: () => void
}

/**
 * Read-only view of ANOTHER member's progressive entry (Phase 3b). Reuses
 * ProgressivePredictionsFlow with predictionsLocked forced true → isReadOnly is
 * always true, so no input is editable and savePredictions short-circuits. Only
 * the rounds already locked pool-wide are present in existingPredictions (the
 * SSR reveal filter strips the rest), so unlocked rounds simply render empty.
 *
 * ⚠ KNOWN GAP, PRE-EXISTING AND NOT CLOSED HERE: `existingPredictions` is fed
 * from the pool-wide read in lib/poolData.ts, which selects from `predictions`.
 * A league pick is in `league_predictions`, so for a league pool this arrives
 * empty and every other member's matchweek renders as though they picked
 * nothing. Closing it needs a pool-wide league read, not a prop.
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
  leagueDepth = null,
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
        leagueDepth={leagueDepth}
        onUnsavedChangesRef={noopRef}
        onStatusChange={() => {}}
      />
    </SpectatorFrame>
  )
}
