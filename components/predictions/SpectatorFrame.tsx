'use client'

import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'

/**
 * Shared chrome for viewing ANOTHER member's entry read-only after lock
 * (Phase 3b): a back link + an owner header (the prediction screens otherwise
 * assume "you"), wrapping a read-only flow.
 */
export function SpectatorFrame({
  ownerName,
  entryName,
  onBack,
  children,
}: {
  ownerName: string
  entryName: string
  onBack: () => void
  children: ReactNode
}) {
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

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <h3 className="text-lg font-semibold text-neutral-900">{ownerName}</h3>
        <span className="text-neutral-300">·</span>
        <span className="text-sm text-neutral-500">{entryName}</span>
        <Badge variant="gray">Read-only</Badge>
      </div>

      {children}
    </div>
  )
}
