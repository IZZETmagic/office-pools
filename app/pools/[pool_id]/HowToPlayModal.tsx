'use client'

import { Modal } from '@/components/ui/Modal'
import { HowToPlayTab } from './HowToPlayTab'

type HowToPlayModalProps = {
  poolName: string
  maxEntries: number
  isPastDeadline: boolean
  predictionMode: 'full_tournament' | 'progressive' | 'bracket_picker'
  onClose: () => void
}

export function HowToPlayModal({
  poolName,
  maxEntries,
  isPastDeadline,
  predictionMode,
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
        <HowToPlayTab
          poolName={poolName}
          maxEntries={maxEntries}
          isPastDeadline={isPastDeadline}
          predictionMode={predictionMode}
        />
      </div>
    </Modal>
  )
}
