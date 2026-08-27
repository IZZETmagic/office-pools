'use client'

// =============================================================
// Somebody else's table, and how it is scoring
// =============================================================
// Table mode had no transparency at all: a member could see their own
// prediction and the leaderboard total, and nothing in between. Not what a
// rival predicted once the deadline had passed, not how anybody's points were
// arrived at — including their own, from the leaderboard. In a mode whose whole
// content is one ordered list, "you finished 4th with 820" with no way to see
// why is the product asking to be trusted rather than showing its work.
//
// ## Who may see what, decided twice
//
// RLS on `league_table_predictions` (migration 078) is the real gate: your own
// always, everybody else's only once `league_table_lock_at` has passed.
//
// ⚠ This component ALSO refuses before the lock, and that is not redundant.
// Migration 078's admin policy — "Pool admins can view all table predictions" —
// carries no lock check, so an admin who is also playing would otherwise open
// this and read every rival's table while the window was still open. RLS is
// protecting the data; this is protecting the competition.

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { TableBreakdownView } from './TableBreakdownView'
import type { TableBreakdownRow } from '@/lib/league/table'
import type { TablePrices } from './TableBreakdownView'

type Props = {
  poolId: string
  entryId: string
  /** Shown in the title, and as the first column heading on a rival's table. */
  displayName: string
  isOwnEntry: boolean
  /** Has the pool's table deadline passed? */
  isLocked: boolean
  bandOf: (position: number) => string | null
  bandStripe: Record<string, string>
  /** Both needed to show how the total is made up — see bandBonuses. */
  topN: number
  prices: TablePrices
  onClose: () => void
}

export function TableEntryModal({
  poolId, entryId, displayName, isOwnEntry, isLocked, bandOf, bandStripe, topN, prices, onClose,
}: Props) {
  const [rows, setRows] = useState<TableBreakdownRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Nothing is fetched for a rival before the lock — see the header. The
  // request would very likely succeed for an admin, which is the point.
  const mayView = isOwnEntry || isLocked

  useEffect(() => {
    if (!mayView) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/pools/${poolId}/table-prediction?entryId=${encodeURIComponent(entryId)}`,
        )
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(json.error ?? 'That table could not be loaded.')
          return
        }
        setRows((json.breakdown ?? []) as TableBreakdownRow[])
      } catch {
        if (!cancelled) setError('That table could not be loaded — check your connection.')
      }
    })()
    return () => { cancelled = true }
  }, [poolId, entryId, mayView])

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isOwnEntry ? 'Your table' : `${displayName}’s table`}
      titleId="table-entry-title"
      size="md"
    >
      <div className="overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
        {!mayView ? (
          <div className="text-center py-8">
            <Icon name="lock.fill" size={32} className="mx-auto text-neutral-300 mb-3" />
            <p className="text-sm font-medium text-neutral-700">
              Hidden until the deadline
            </p>
            <p className="text-xs text-neutral-500 mt-1.5 max-w-xs mx-auto">
              Everyone&apos;s table opens up the moment picking closes. Until then the
              only one you can see is your own — including if you run the pool.
            </p>
          </div>
        ) : error ? (
          <p className="text-sm text-danger-600 py-6 text-center">{error}</p>
        ) : rows === null ? (
          <p className="text-sm text-neutral-500 py-6 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm font-medium text-neutral-700">
              {isOwnEntry ? 'You didn’t predict the table' : `${displayName} didn’t predict the table`}
            </p>
            <p className="text-xs text-neutral-500 mt-1.5">
              It scores nothing, and everything else in the pool counts as normal.
            </p>
          </div>
        ) : (
          <TableBreakdownView
            breakdown={rows}
            topN={topN}
            prices={prices}
            bandOf={bandOf}
            bandStripe={bandStripe}
            ownerLabel={isOwnEntry ? 'You' : displayName.split(' ')[0]}
          />
        )}
      </div>
    </Modal>
  )
}
