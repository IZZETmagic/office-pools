'use client'

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
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-to-play-title"
    >
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-lg w-full max-h-[85vh] flex flex-col dark:shadow-none dark:border dark:border-border-default animate-modal-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-neutral-100 dark:border-border-default shrink-0">
          <h2 id="how-to-play-title" className="text-lg font-bold text-neutral-900">
            How to Play
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          <HowToPlayTab
            poolName={poolName}
            maxEntries={maxEntries}
            isPastDeadline={isPastDeadline}
            predictionMode={predictionMode}
          />
        </div>
      </div>
    </div>
  )
}
