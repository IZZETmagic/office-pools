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
// RLS on `league_table_predictions` is the real gate: your own always,
// everybody else's once `pools.league_table_lock_at` has passed — migration 110.
//
// ⚠ `isRevealed` is a separate PROP but not a separate FACT. 104 split the
// reveal onto its own stamp so an admin could reopen a passed deadline for
// somebody who forgot; 109 removed the reopen, 110 removed the stamp, and the
// deadline is once again the only switch. The prop keeps its name because the
// question this component asks — "may I open somebody else's table" — is not
// the question the editing screen asks. Do not reintroduce a stamp to answer it.
//
// ⚠ This component ALSO refuses before the reveal, and that is not redundant —
// but it is no longer load-bearing. Until 104, migration 078's admin policy
// ("Pool admins can view all table predictions") carried no gate at all, so an
// admin who was also playing could read every rival's table while the window
// was open — and this component was the only thing stopping them, which meant
// the API answered them in full. 104 gates the admin policy too. The check
// below now agrees with RLS rather than substituting for it.

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
  /** Have this pool's tables been revealed to everyone? Not "deadline passed". */
  isRevealed: boolean
  bandOf: (position: number) => string | null
  bandStripe: Record<string, string>
  /** Both needed to show how the total is made up — see bandBonuses. */
  topN: number
  prices: TablePrices
  onClose: () => void
}

export function TableEntryModal({
  poolId, entryId, displayName, isOwnEntry, isRevealed, bandOf, bandStripe, topN, prices, onClose,
}: Props) {
  const [rows, setRows] = useState<TableBreakdownRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Nothing is fetched for a rival before the reveal — see the header.
  const mayView = isOwnEntry || isRevealed

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
            {/* ⚠ This copy has been through both rules. 104 held the reveal
                until everyone had filed; 109 withdrew that, so the deadline is
                once again the whole story — and the copy is back to saying so.
                Keep it matching `league_reveal_table_if_ready`, not the other
                way round. */}
            <p className="text-sm font-medium text-neutral-700">
              Hidden until the deadline
            </p>
            <p className="text-xs text-neutral-500 mt-1.5 max-w-xs mx-auto">
              Every table opens at once, the moment picking closes. Until then the only
              one you can see is your own, including if you run the pool.
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
