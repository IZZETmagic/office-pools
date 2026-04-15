'use client'

import { useState, useRef, useMemo } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatTimeAgo } from '@/lib/format'
import type { EntryData, PredictionData } from '@/app/pools/[pool_id]/types'
import type { PoolRoundState, EntryRoundSubmission } from '@/app/pools/[pool_id]/types'

type EntriesListViewProps = {
  entries: EntryData[]
  poolId: string
  totalMatches: number
  isPastDeadline: boolean
  allPredictions: PredictionData[]
  canAddEntry: boolean
  addingEntry: boolean
  onAddEntry: () => Promise<void>
  onDeleteEntry: (entry: EntryData) => void
  onRenameEntry: (entry: EntryData, newName: string) => Promise<void>
  onEditEntry: (entry: EntryData) => void
  /** Override predicted counts per entry (used for bracket picker where predictions table isn't used) */
  entryProgressOverride?: Record<string, number>
  /** Progressive mode: round states for the pool */
  roundStates?: PoolRoundState[]
  /** Progressive mode: server-loaded round submissions for all user entries */
  allRoundSubmissions?: EntryRoundSubmission[]
  /** Progressive mode: live (client-fetched) round submissions keyed by entry_id */
  liveRoundSubmissions?: Record<string, EntryRoundSubmission[]>
  /** Entry fee amount (null = free pool, no fee badge shown) */
  entryFee?: number | null
  /** Currency code for entry fee display (e.g. 'USD') */
  entryFeeCurrency?: string
}

function getEntryStatus(
  entry: EntryData,
  predictedCount: number,
  progressiveStatus?: 'submitted' | 'draft' | null,
): { label: string; variant: 'green' | 'yellow' | 'gray' | 'blue' } {
  if (entry.auto_submitted) return { label: 'Auto-Submitted', variant: 'blue' }
  // Progressive mode: use round-level submission status
  if (progressiveStatus === 'submitted') return { label: 'Submitted', variant: 'green' }
  if (progressiveStatus === 'draft') {
    if (predictedCount > 0) return { label: 'Draft', variant: 'yellow' }
    return { label: 'Not Started', variant: 'gray' }
  }
  // Full tournament mode
  if (entry.has_submitted_predictions) return { label: 'Submitted', variant: 'green' }
  if (predictedCount > 0) return { label: 'Draft', variant: 'yellow' }
  return { label: 'Not Started', variant: 'gray' }
}

function getTimestamp(entry: EntryData): string | null {
  if (entry.has_submitted_predictions && entry.predictions_submitted_at) {
    return entry.predictions_submitted_at
  }
  return entry.predictions_last_saved_at
}

function getTimestampLabel(entry: EntryData): string {
  if (entry.has_submitted_predictions) return 'Submitted'
  return 'Saved'
}

export function EntriesListView({
  entries,
  poolId,
  totalMatches,
  isPastDeadline,
  allPredictions,
  canAddEntry,
  addingEntry,
  onAddEntry,
  onDeleteEntry,
  onRenameEntry,
  onEditEntry,
  entryProgressOverride,
  roundStates,
  allRoundSubmissions,
  liveRoundSubmissions,
  entryFee,
  entryFeeCurrency,
}: EntriesListViewProps) {
  // Inline rename state (local to list view)
  const [renamingEntryId, setRenamingEntryId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [savingRename, setSavingRename] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const getPredictedCount = (entryId: string) =>
    entryProgressOverride?.[entryId] ?? allPredictions.filter(p => p.entry_id === entryId).length

  // Progressive mode: compute per-entry submission status
  // "submitted" = no open round is unsubmitted, "draft" = open round exists without submission
  const progressiveStatusMap = useMemo(() => {
    if (!roundStates?.length) return null
    const openRound = roundStates.find(rs => rs.state === 'open')
    const map = new Map<string, 'submitted' | 'draft'>()
    for (const entry of entries) {
      const subs = liveRoundSubmissions?.[entry.entry_id] ?? allRoundSubmissions?.filter(s => s.entry_id === entry.entry_id) ?? []
      if (!openRound) {
        // No open round: submitted if they have any round submissions
        map.set(entry.entry_id, subs.some(s => s.has_submitted) ? 'submitted' : 'draft')
      } else {
        // Open round exists: submitted only if they've submitted for that round
        const roundSub = subs.find(s => s.round_key === openRound.round_key)
        map.set(entry.entry_id, roundSub?.has_submitted ? 'submitted' : 'draft')
      }
    }
    return map
  }, [roundStates, entries, allRoundSubmissions, liveRoundSubmissions])

  const startRename = (entry: EntryData) => {
    setRenamingEntryId(entry.entry_id)
    setRenameDraft(entry.entry_name)
    setTimeout(() => renameInputRef.current?.focus(), 0)
  }

  const handleRename = async (entry: EntryData) => {
    const trimmed = renameDraft.trim()
    if (!trimmed || trimmed === entry.entry_name) {
      setRenamingEntryId(null)
      return
    }
    setSavingRename(true)
    try {
      await onRenameEntry(entry, trimmed)
    } finally {
      setSavingRename(false)
      setRenamingEntryId(null)
    }
  }

  const canDelete = (entry: EntryData) =>
    entries.length > 1 && !entry.has_submitted_predictions && !isPastDeadline

  const canRename = (entry: EntryData) =>
    !isPastDeadline && !entry.predictions_locked

  return (
    <div style={{ animation: 'fadeUp 0.3s ease' }}>
      {/* Mobile card view */}
      <div className="sm:hidden space-y-2">
        {entries.map(entry => {
          const predictedCount = getPredictedCount(entry.entry_id)
          const status = getEntryStatus(entry, predictedCount, progressiveStatusMap?.get(entry.entry_id))
          const timestamp = getTimestamp(entry)
          const isRenaming = renamingEntryId === entry.entry_id

          return (
            <div
              key={entry.entry_id}
              className="rounded-xl border border-neutral-200 bg-surface p-3 cursor-pointer hover:bg-primary-50 active:bg-primary-100 transition-colors group"
              onClick={() => !isRenaming && onEditEntry(entry)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (!isRenaming && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onEditEntry(entry) } }}
            >
              {/* Top row: name + rename + status */}
              <div className="flex items-center justify-between gap-2 mb-2">
                {isRenaming ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameDraft}
                      onChange={e => setRenameDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(entry)
                        if (e.key === 'Escape') setRenamingEntryId(null)
                      }}
                      className="px-2 py-1 border border-primary-300 rounded-lg text-sm font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 w-full min-w-0"
                      maxLength={40}
                    />
                    <button
                      onClick={() => handleRename(entry)}
                      disabled={savingRename}
                      className="px-2 py-1 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 shrink-0"
                    >
                      {savingRename ? '...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setRenamingEntryId(null)}
                      className="px-1 py-1 text-xs text-neutral-500 hover:text-neutral-700 shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-sm font-medium text-neutral-900 truncate">
                        {entry.entry_name}
                      </span>
                      {canRename(entry) && (
                        <button
                          onClick={e => { e.stopPropagation(); startRename(entry) }}
                          className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors shrink-0"
                          title="Rename entry"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                      {canDelete(entry) && (
                        <button
                          onClick={e => { e.stopPropagation(); onDeleteEntry(entry) }}
                          className="p-1 text-neutral-400 hover:text-danger-600 transition-colors shrink-0"
                          title="Delete entry"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {entryFee != null && entryFee > 0 && (
                        <Badge variant={entry.fee_paid ? 'green' : 'yellow'}>
                          {entry.fee_paid ? 'Paid' : 'Fee Due'}
                        </Badge>
                      )}
                      {/* Chevron indicator */}
                      <svg className="w-4 h-4 text-neutral-400 group-hover:text-primary-500 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </>
                )}
              </div>

              {/* Timestamp */}
              {timestamp && (
                <div className="text-xs text-neutral-500 mb-2" suppressHydrationWarning>
                  {getTimestampLabel(entry)} {formatTimeAgo(timestamp)}
                </div>
              )}

              {/* Progress row: label + bar + count */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-500 shrink-0">Progress</span>
                <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      status.variant === 'green' || status.variant === 'blue'
                        ? 'bg-success-500'
                        : predictedCount > 0
                          ? 'bg-warning-500'
                          : 'bg-neutral-200'
                    }`}
                    style={{ width: `${totalMatches > 0 ? (predictedCount / totalMatches) * 100 : 0}%`, transformOrigin: 'left', animation: 'barGrow 0.8s ease both' }}
                  />
                </div>
                <span className="text-xs text-neutral-700 font-medium shrink-0">{predictedCount}/{totalMatches}</span>
              </div>
            </div>
          )
        })}

        {/* Add Entry button (mobile) */}
        {canAddEntry && (
          <Button
            variant="outline"
            size="sm"
            fullWidth
            onClick={onAddEntry}
            loading={addingEntry}
            loadingText="Adding..."
          >
            + Add Entry
          </Button>
        )}
      </div>

      {/* Desktop table view */}
      <div className="hidden sm:block bg-surface rounded-xl shadow overflow-hidden dark:shadow-none dark:border dark:border-border-default">
        <table className="w-full">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-neutral-700 uppercase tracking-wider">
                Entry
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-neutral-700 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-neutral-700 uppercase tracking-wider">
                Progress
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase tracking-wider">
                Last Updated
              </th>
              <th className="px-2 md:px-4 py-3 w-10">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {entries.map(entry => {
              const predictedCount = getPredictedCount(entry.entry_id)
              const status = getEntryStatus(entry, predictedCount, progressiveStatusMap?.get(entry.entry_id))
              const timestamp = getTimestamp(entry)
              const isRenaming = renamingEntryId === entry.entry_id
              const progressPct = totalMatches > 0 ? (predictedCount / totalMatches) * 100 : 0

              return (
                <tr
                  key={entry.entry_id}
                  className="hover:bg-primary-50 active:bg-primary-100 transition-colors cursor-pointer group"
                  onClick={() => !isRenaming && onEditEntry(entry)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (!isRenaming && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onEditEntry(entry) } }}
                >
                  {/* Entry Name + Rename */}
                  <td className="px-4 md:px-6 py-3">
                    {isRenaming ? (
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameDraft}
                          onChange={e => setRenameDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRename(entry)
                            if (e.key === 'Escape') setRenamingEntryId(null)
                          }}
                          className="px-2 py-1 border border-primary-300 rounded-lg text-sm font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 w-48"
                          maxLength={40}
                        />
                        <button
                          onClick={() => handleRename(entry)}
                          disabled={savingRename}
                          className="px-2 py-1 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                        >
                          {savingRename ? '...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setRenamingEntryId(null)}
                          className="px-1 py-1 text-xs text-neutral-500 hover:text-neutral-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-neutral-900">{entry.entry_name}</span>
                        {canRename(entry) && (
                          <button
                            onClick={e => { e.stopPropagation(); startRename(entry) }}
                            className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors"
                            title="Rename entry"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        )}
                        {canDelete(entry) && (
                          <button
                            onClick={e => { e.stopPropagation(); onDeleteEntry(entry) }}
                            className="p-1 text-neutral-400 hover:text-danger-600 transition-colors"
                            title="Delete entry"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {entryFee != null && entryFee > 0 && (
                        <Badge variant={entry.fee_paid ? 'green' : 'yellow'}>
                          {entry.fee_paid ? 'Paid' : 'Fee Due'}
                        </Badge>
                      )}
                    </div>
                  </td>

                  {/* Progress */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-sm text-neutral-700">{predictedCount}/{totalMatches}</span>
                      <div className="w-20 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            status.variant === 'green' || status.variant === 'blue'
                              ? 'bg-success-500'
                              : predictedCount > 0
                                ? 'bg-warning-500'
                                : 'bg-neutral-200'
                          }`}
                          style={{ width: `${progressPct}%`, transformOrigin: 'left', animation: 'barGrow 0.8s ease both' }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Last Updated */}
                  <td className="px-4 py-3">
                    {timestamp ? (
                      <span className="text-sm text-neutral-500" suppressHydrationWarning>
                        {getTimestampLabel(entry)} {formatTimeAgo(timestamp)}
                      </span>
                    ) : (
                      <span className="text-sm text-neutral-400">—</span>
                    )}
                  </td>

                  {/* Chevron indicator */}
                  <td className="px-2 md:px-4 py-3">
                    <svg className="w-5 h-5 text-neutral-300 group-hover:text-primary-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Add Entry button (desktop, below table) */}
        {canAddEntry && (
          <div className="px-4 md:px-6 py-3 border-t border-neutral-200 bg-neutral-50 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={onAddEntry}
              loading={addingEntry}
              loadingText="Adding..."
            >
              + Add Entry
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
