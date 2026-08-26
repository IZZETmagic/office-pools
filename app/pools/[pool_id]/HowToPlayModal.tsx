'use client'

import { Modal } from '@/components/ui/Modal'
import { HowToPlayTab } from './HowToPlayTab'
import { LeagueHowToPlayTab } from './LeagueHowToPlayTab'
import type { LeagueMode, LeagueDepth } from '@/lib/leagueModeInfo'

type HowToPlayModalProps = {
  poolName: string
  maxEntries: number
  isPastDeadline: boolean
  predictionMode: 'full_tournament' | 'progressive' | 'bracket_picker'
  /**
   * Non-null for a league pool, and the reason this modal branches at all.
   *
   * ⚠ This opens BY ITSELF on a member's first visit, so whatever it says is
   * the first thing they read about the pool they just joined. Until this
   * branch existed it told every Premier League member they were in a FIFA
   * World Cup pool with 12 groups and a Round of 32.
   */
  leagueMode?: LeagueMode | null
  leagueDepth?: LeagueDepth
  onClose: () => void
}

export function HowToPlayModal({
  poolName,
  maxEntries,
  isPastDeadline,
  predictionMode,
  leagueMode = null,
  leagueDepth = null,
  onClose,
}: HowToPlayModalProps) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="How to Play"
      titleId="how-to-play-title"
      size="md"
    >
      {/* Scrollable content */}
      <div className="overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
        {leagueMode ? (
          <LeagueHowToPlayTab
            poolName={poolName}
            maxEntries={maxEntries}
            mode={leagueMode}
            depth={leagueDepth}
          />
        ) : (
          <HowToPlayTab
            poolName={poolName}
            maxEntries={maxEntries}
            isPastDeadline={isPastDeadline}
            predictionMode={predictionMode}
          />
        )}
      </div>
    </Modal>
  )
}
