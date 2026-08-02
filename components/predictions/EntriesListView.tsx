'use client'

import { useState, useRef, useMemo } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ListRow } from '@/components/ui/ListRow'
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
      <div className="sm:hidden space-y-3">
        {entries.map(entry => {
          const predictedCount = getPredictedCount(entry.entry_id)
          const status = getEntryStatus(entry, predictedCount, progressiveStatusMap?.get(entry.entry_id))
          const timestamp = getTimestamp(entry)
          const isRenaming = renamingEntryId === entry.entry_id

          return (
            <ListRow
              key={entry.entry_id}
              interactive
              className="group"
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
                      className="px-3 py-1.5 rounded-control bg-mist border border-transparent t-body text-ink focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 w-full min-w-0"
                      maxLength={40}
                    />
                    <button
                      onClick={() => handleRename(entry)}
                      disabled={savingRename}
                      className="px-3 py-1.5 rounded-control t-detail font-bold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 shrink-0"
                    >
                      {savingRename ? '...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setRenamingEntryId(null)}
                      className="px-2 py-1.5 rounded-control t-detail font-bold text-muted hover:text-ink shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="t-card-title text-ink truncate">
                        {entry.entry_name}
                      </span>
                      {canRename(entry) && (
                        <button
                          onClick={e => { e.stopPropagation(); startRename(entry) }}
                          className="p-1 text-muted hover:text-ink transition-colors shrink-0"
                          title="Rename entry"
                        >
                          <Icon name="pencil" size={14} />
                        </button>
                      )}
                      {canDelete(entry) && (
                        <button
                          onClick={e => { e.stopPropagation(); onDeleteEntry(entry) }}
                          className="p-1 text-muted hover:text-danger-700 transition-colors shrink-0"
                          title="Delete entry"
                        >
                          <Icon name="trash" size={14} />
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
                      <Icon name="chevron.right" size={16} className="text-muted group-hover:text-primary-600 transition-colors shrink-0" />
                    </div>
                  </>
                )}
              </div>

              {/* Timestamp */}
              {timestamp && (
                <div className="t-body text-muted mb-2" suppressHydrationWarning>
                  {getTimestampLabel(entry)} {formatTimeAgo(timestamp)}
                </div>
              )}

              {/* Progress row: label + bar + count */}
              <div className="flex items-center gap-2">
                <span className="t-body text-muted shrink-0">Progress</span>
                <div className="flex-1 h-1.5 bg-mist rounded-pill overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      status.variant === 'green' || status.variant === 'blue'
                        ? 'bg-success-600'
                        : predictedCount > 0
                          ? 'bg-warning-500'
                          : 'bg-silver'
                    }`}
                    style={{ width: `${totalMatches > 0 ? (predictedCount / totalMatches) * 100 : 0}%`, transformOrigin: 'left', animation: 'barGrow 0.8s ease both' }}
                  />
                </div>
                <span className="t-num text-sm text-ink shrink-0">{predictedCount}/{totalMatches}</span>
              </div>
            </ListRow>
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
      <div className="hidden sm:block bg-surface rounded-card shadow-card overflow-hidden dark:shadow-none dark:border dark:border-border-default">
        <table className="w-full">
          <thead className="border-b border-border-default">
            <tr>
              <th className="px-4 md:px-6 py-3 text-left t-body font-semibold text-ink">
                Entry
              </th>
              <th className="px-4 py-3 text-center t-body font-semibold text-ink">
                Status
              </th>
              <th className="px-4 py-3 text-center t-body font-semibold text-ink">
                Progress
              </th>
              <th className="px-4 py-3 text-left t-body font-semibold text-ink">
                Last Updated
              </th>
              <th className="px-2 md:px-4 py-3 w-10">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => {
              const predictedCount = getPredictedCount(entry.entry_id)
              const status = getEntryStatus(entry, predictedCount, progressiveStatusMap?.get(entry.entry_id))
              const timestamp = getTimestamp(entry)
              const isRenaming = renamingEntryId === entry.entry_id
              const progressPct = totalMatches > 0 ? (predictedCount / totalMatches) * 100 : 0

              return (
                <tr
                  key={entry.entry_id}
                  className="border-b border-border-default last:border-b-0 hover:bg-snow transition-colors cursor-pointer group"
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
                          className="px-3 py-1.5 rounded-control bg-mist border border-transparent t-body text-ink focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600 w-48"
                          maxLength={40}
                        />
                        <button
                          onClick={() => handleRename(entry)}
                          disabled={savingRename}
                          className="px-3 py-1.5 rounded-control t-detail font-bold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
                        >
                          {savingRename ? '...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setRenamingEntryId(null)}
                          className="px-2 py-1.5 rounded-control t-detail font-bold text-muted hover:text-ink"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="t-body text-ink">{entry.entry_name}</span>
                        {canRename(entry) && (
                          <button
                            onClick={e => { e.stopPropagation(); startRename(entry) }}
                            className="p-1 text-muted hover:text-ink transition-colors"
                            title="Rename entry"
                          >
                            <Icon name="pencil" size={14} />
                          </button>
                        )}
                        {canDelete(entry) && (
                          <button
                            onClick={e => { e.stopPropagation(); onDeleteEntry(entry) }}
                            className="p-1 text-muted hover:text-danger-700 transition-colors"
                            title="Delete entry"
                          >
                            <Icon name="trash" size={14} />
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
                      <span className="t-num text-sm text-ink">{predictedCount}/{totalMatches}</span>
                      <div className="w-20 h-1.5 bg-mist rounded-pill overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            status.variant === 'green' || status.variant === 'blue'
                              ? 'bg-success-600'
                              : predictedCount > 0
                                ? 'bg-warning-500'
                                : 'bg-silver'
                          }`}
                          style={{ width: `${progressPct}%`, transformOrigin: 'left', animation: 'barGrow 0.8s ease both' }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Last Updated */}
                  <td className="px-4 py-3">
                    {timestamp ? (
                      <span className="t-body text-muted" suppressHydrationWarning>
                        {getTimestampLabel(entry)} {formatTimeAgo(timestamp)}
                      </span>
                    ) : (
                      <span className="t-body text-muted">—</span>
                    )}
                  </td>

                  {/* Chevron indicator */}
                  <td className="px-2 md:px-4 py-3">
                    <Icon name="chevron.right" size={20} className="text-muted group-hover:text-primary-600 transition-colors" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Add Entry button (desktop, below table) */}
        {canAddEntry && (
          <div className="px-4 md:px-6 py-3 border-t border-border-default bg-snow flex justify-end">
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
