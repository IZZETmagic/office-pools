'use client'

// Roster review — who gets a saved spot in the pool being created (Decision 2, as amended). The web
// twin of mobile's RosterReviewSheet.
//
// Done by whoever starts the pool, because any member can. Everyone is ticked except people we have
// a reason for, and the reason is SHOWN: "Didn't play last season", "Hasn't opened SportPool in 6
// months". Nobody unticked is told — they stay in the crew and can still join with the link.
//
// ⚠ SAVED SPOTS NEVER EXCEED WHAT THE POOL HOLDS (decision 7). A new pool is Free (10, so 9 spots
// besides the starter). Done is disabled while too many are ticked: a saved spot is a promise, and
// the eleventh person must never find out at the door. The server refuses the same thing.
//
// Mount it only while open — its ticks start from `initial` and never re-sync.

import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import type { RosterView } from '@/lib/crews/read'
import { personName, plural, seatSelectionProblem } from '@/lib/crews/words'

import { CrewFace } from './CrewFace'

export function RosterReviewModal({
  crewName,
  roster,
  initial,
  onClose,
  onDone,
}: {
  crewName: string
  roster: RosterView
  initial: string[]
  onClose: () => void
  onDone: (chosen: string[]) => void
}) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initial))
  const spots = roster.spots
  const problem = seatSelectionProblem(chosen.size, spots)

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    // ⚠ Rendered through a portal by the create wizard: its panel keeps a transform after the
    // slide-up, and a fixed overlay inside a transformed box is pinned to the box, not the screen.
    <Modal isOpen onClose={onClose} size="sm" titleId="roster-title">
      <div className="px-5 sm:px-6 pt-4 pb-6 flex flex-col gap-4 overflow-y-auto">
        <div className="flex flex-col gap-1">
          <h2 id="roster-title" className="t-card-title text-ink">
            Who gets a saved spot
          </h2>
          <p className="t-body text-muted">
            {crewName} · {plural(roster.rows.length + 1, 'person', 'people')}
          </p>
        </div>

        {spots !== null ? (
          <div className={`flex items-center gap-2 p-3 rounded-control ${problem ? 'bg-danger-50 dark:bg-danger-500/15' : 'bg-primary-600/10'}`}>
            <p className={`flex-1 text-[13px] leading-[18px] font-medium ${problem ? 'text-danger-700' : 'text-ink'}`}>
              {problem ??
                `A Free pool holds ${spots + 1}, so ${spots} can have a saved spot. Anyone else can still join with the link while there’s room.`}
            </p>
            <span className={`text-sm font-black tabular-nums ${problem ? 'text-danger-700' : 'text-success-700'}`}>
              {chosen.size} of {spots}
            </span>
          </div>
        ) : null}

        {roster.rows.length === 0 ? (
          <p className="t-body text-muted">
            It’s just you in this crew so far — add people from the crew page, or share the pool’s link once it’s made.
          </p>
        ) : (
          <ul className="rounded-control border border-border-default divide-y divide-border-subtle overflow-hidden">
            {roster.rows.map((r) => {
              const on = chosen.has(r.userId)
              return (
                <li key={r.userId}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={personName(r)}
                    onClick={() => toggle(r.userId)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-mist/50 transition-colors"
                  >
                    <Icon
                      name={on ? 'checkmark.circle.fill' : 'circle'}
                      size={22}
                      className={on ? 'text-primary-600' : 'text-silver'}
                    />
                    <CrewFace person={r} size={32} />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-sm font-bold text-ink">{personName(r)}</span>
                      {r.reasons.length ? (
                        <span className="block text-[11.5px] font-medium text-warning-700">{r.reasons.join(' · ')}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <p className="text-xs leading-[17px] text-muted">
          Nobody unticked is told — they stay in the crew. Everyone ticked gets a saved spot and one reminder from
          SportPool before picks lock.
        </p>

        <Button disabled={!!problem} onClick={() => onDone([...chosen])}>
          Done
        </Button>
      </div>
    </Modal>
  )
}
