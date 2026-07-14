'use client'

import type { MemberData, PredictionData } from '@/app/pools/[pool_id]/types'

type SelectedEntry = { entryId: string; ownerName: string; entryName: string }

type EveryoneElseSectionProps = {
  members: MemberData[]
  currentUserId: string
  allPredictions: PredictionData[]
  onSelect: (entry: SelectedEntry) => void
}

/**
 * Post-lock roster of every OTHER member's entry (Phase 3b), flat and labelled
 * by owner. Only rendered once predictions are locked, so tapping through to a
 * read-only view can never leak a still-editable pick. Rendering is safe pre-lock
 * too (it shows nothing sensitive — just names), but callers gate it on lock.
 */
export function EveryoneElseSection({ members, currentUserId, allPredictions, onSelect }: EveryoneElseSectionProps) {
  const predictedByEntry = new Map<string, number>()
  for (const p of allPredictions) {
    predictedByEntry.set(p.entry_id, (predictedByEntry.get(p.entry_id) ?? 0) + 1)
  }

  const rows: Array<SelectedEntry & { points: number }> = []
  for (const m of members) {
    if (m.user_id === currentUserId) continue
    for (const e of m.entries ?? []) {
      rows.push({
        entryId: e.entry_id,
        entryName: e.entry_name,
        ownerName: m.users?.full_name || m.users?.username || 'Member',
        points: e.scored_total_points ?? 0,
      })
    }
  }
  rows.sort((a, b) => b.points - a.points || a.ownerName.localeCompare(b.ownerName))

  if (rows.length === 0) return null

  return (
    <div className="mt-8">
      <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
        Everyone&apos;s predictions
      </h3>
      <div className="space-y-2">
        {rows.map((r) => (
          <button
            key={r.entryId}
            onClick={() => onSelect({ entryId: r.entryId, ownerName: r.ownerName, entryName: r.entryName })}
            className="w-full flex items-center gap-3 rounded-xl border border-neutral-200 bg-surface p-3 text-left hover:bg-primary-50 active:bg-primary-100 transition-colors group"
          >
            <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold shrink-0">
              {initials(r.ownerName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-neutral-900 truncate">{r.entryName}</div>
              <div className="text-xs text-neutral-500 truncate">{r.ownerName}</div>
            </div>
            <svg
              className="w-4 h-4 text-neutral-400 group-hover:text-primary-500 transition-colors shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
