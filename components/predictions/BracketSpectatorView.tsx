'use client'

import { useEffect, useState } from 'react'
import BracketPickerFlow from './BracketPickerFlow'
import { SpectatorFrame } from './SpectatorFrame'
import type {
  TeamData,
  MatchData,
  SettingsData,
  BPGroupRanking,
  BPThirdPlaceRanking,
  BPKnockoutPick,
} from '@/app/pools/[pool_id]/types'

type BracketSpectatorViewProps = {
  ownerName: string
  entryName: string
  entryId: string
  poolId: string
  teams: TeamData[]
  matches: MatchData[]
  settings: SettingsData
  predictionDeadline: string | null
  onBack: () => void
}

type Picks = {
  groupRankings: BPGroupRanking[]
  thirdPlaceRankings: BPThirdPlaceRanking[]
  knockoutPicks: BPKnockoutPick[]
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; picks: Picks }

/**
 * Read-only view of ANOTHER member's bracket_picker entry (Phase 3b). Unlike the
 * score modes, a member's bracket picks are NOT in the client's allPredictions
 * (the bracket_picker_* tables are RLS-scoped per-viewer), so we fetch them from
 * the reveal-gated view route. BracketPickerFlow is forced read-only via
 * isSubmitted + isLocked (isReadOnly short-circuits every save path).
 */
export function BracketSpectatorView({
  ownerName,
  entryName,
  entryId,
  poolId,
  teams,
  matches,
  settings,
  predictionDeadline,
  onBack,
}: BracketSpectatorViewProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    // Fresh mount per entry (backing out unmounts this view), so the initial
    // 'loading' state already applies — no reset needed here.
    let cancelled = false
    fetch(`/api/pools/${poolId}/entries/${entryId}/predictions`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? `Request failed (${res.status})`)
        }
        return res.json()
      })
      .then((data: { bracketPicks?: Partial<Picks> }) => {
        if (cancelled) return
        setState({
          status: 'ready',
          picks: {
            groupRankings: data.bracketPicks?.groupRankings ?? [],
            thirdPlaceRankings: data.bracketPicks?.thirdPlaceRankings ?? [],
            knockoutPicks: data.bracketPicks?.knockoutPicks ?? [],
          },
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({ status: 'error', error: err instanceof Error ? err.message : 'Failed to load' })
      })
    return () => {
      cancelled = true
    }
  }, [poolId, entryId])

  return (
    <SpectatorFrame ownerName={ownerName} entryName={entryName} onBack={onBack}>
      {state.status === 'loading' ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : state.status === 'error' ? (
        <p className="text-sm text-danger-600 py-8 text-center">{state.error}</p>
      ) : (
        <BracketPickerFlow
          key={entryId}
          poolId={poolId}
          entryId={entryId}
          teams={teams}
          matches={matches}
          settings={settings}
          predictionDeadline={predictionDeadline}
          isSubmitted={true}
          isLocked={true}
          existingGroupRankings={state.picks.groupRankings}
          existingThirdPlaceRankings={state.picks.thirdPlaceRankings}
          existingKnockoutPicks={state.picks.knockoutPicks}
          onSaveStatusChange={() => {}}
          onSubmit={() => {}}
        />
      )}
    </SpectatorFrame>
  )
}
