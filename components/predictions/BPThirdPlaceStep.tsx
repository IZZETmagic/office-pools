'use client'

import { useMemo, useCallback, useId } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TeamData } from '@/app/pools/[pool_id]/types'

type BPThirdPlaceStepProps = {
  teams: TeamData[]
  thirdPlaceTeamIds: string[]
  onRankingsChange: (rankedTeamIds: string[]) => void
}

function countryCodeToEmoji(code: string): string {
  const upper = code.toUpperCase()
  const offset = 0x1f1e6
  const a = 'A'.charCodeAt(0)
  return String.fromCodePoint(upper.charCodeAt(0) - a + offset, upper.charCodeAt(1) - a + offset)
}

// =============================================
// SORTABLE TEAM ITEM
// =============================================

type SortableThirdPlaceItemProps = {
  team: TeamData
  rank: number
}

function SortableThirdPlaceItem({ team, rank }: SortableThirdPlaceItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team.team_id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  }

  const qualifies = rank <= 8

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 sm:gap-3 px-3 py-2.5 sm:py-3 rounded-lg border transition-colors
        ${isDragging
          ? 'bg-primary-50 border-primary-300 shadow-lg scale-[1.02] opacity-90'
          : `border-transparent ${qualifies ? 'hover:bg-success-50/30' : 'hover:bg-red-50/30'} hover:border-neutral-200`
        }
        min-h-[48px] touch-manipulation select-none`}
    >
      {/* Rank number */}
      <span
        className={`shrink-0 w-7 sm:w-8 text-center text-xs sm:text-sm font-bold py-0.5 rounded-md border
          ${qualifies
            ? 'bg-success-100 text-success-800 border-success-300'
            : 'bg-red-100 text-red-700 border-red-300'
          }`}
      >
        {rank}
      </span>

      {/* Flag */}
      <span className="shrink-0 w-6 h-4 flex items-center justify-center">
        {team.flag_url ? (
          <img
            src={team.flag_url}
            alt={team.country_name}
            className="w-6 h-4 object-cover rounded-[2px]"
          />
        ) : (
          <span className="text-sm leading-none">{countryCodeToEmoji(team.country_code)}</span>
        )}
      </span>

      {/* Team name and group */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-neutral-900 truncate block">
          {team.country_name}
        </span>
        <span className="text-[11px] text-neutral-500 truncate block">
          3rd in Group {team.group_letter}
        </span>
      </div>

      {/* Status badge */}
      <span
        className={`shrink-0 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-md whitespace-nowrap
          ${qualifies
            ? 'bg-success-100 text-success-700'
            : 'bg-red-100 text-red-700'
          }`}
      >
        {qualifies ? 'QUALIFIED' : 'ELIMINATED'}
      </span>

      {/* Drag handle */}
      <button
        type="button"
        className="shrink-0 p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 cursor-grab active:cursor-grabbing touch-manipulation"
        aria-label={`Reorder ${team.country_name}`}
        {...attributes}
        {...listeners}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="3" r="1.2" />
          <circle cx="11" cy="3" r="1.2" />
          <circle cx="5" cy="8" r="1.2" />
          <circle cx="11" cy="8" r="1.2" />
          <circle cx="5" cy="13" r="1.2" />
          <circle cx="11" cy="13" r="1.2" />
        </svg>
      </button>
    </div>
  )
}

// =============================================
// MAIN COMPONENT
// =============================================

export function BPThirdPlaceStep({
  teams,
  thirdPlaceTeamIds,
  onRankingsChange,
}: BPThirdPlaceStepProps) {
  const dndId = useId()
  const teamsMap = useMemo(() => {
    const map = new Map<string, TeamData>()
    for (const team of teams) {
      map.set(team.team_id, team)
    }
    return map
  }, [teams])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = thirdPlaceTeamIds.indexOf(active.id as string)
      const newIndex = thirdPlaceTeamIds.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return

      const newOrder = arrayMove(thirdPlaceTeamIds, oldIndex, newIndex)
      onRankingsChange(newOrder)
    },
    [thirdPlaceTeamIds, onRankingsChange]
  )

  return (
    <div>
      {/* Help text */}
      <div className="mb-5 space-y-1.5">
        <p className="text-sm font-medium text-neutral-900">
          Rank the 12 third-place teams from strongest to weakest
        </p>
        <p className="text-xs text-neutral-600">
          Top 8 teams advance to the Round of 32. The bottom 4 are eliminated.
        </p>
        <p className="text-xs text-neutral-500">
          Since there are no match scores in Bracket Picker mode, you decide which third-place teams are strongest.
        </p>
      </div>

      {/* Sortable list */}
      <div className="bg-surface rounded-xl border border-border-default shadow-sm dark:shadow-none overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-border-default bg-surface-secondary flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-900">Third-Place Rankings</h3>
          <span className="text-xs text-neutral-500">
            {thirdPlaceTeamIds.length} teams
          </span>
        </div>

        <div className="p-1.5 sm:p-2">
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={thirdPlaceTeamIds}
              strategy={verticalListSortingStrategy}
            >
              {thirdPlaceTeamIds.map((teamId, index) => {
                const team = teamsMap.get(teamId)
                if (!team) return null

                const rank = index + 1

                return (
                  <div key={team.team_id}>
                    <SortableThirdPlaceItem team={team} rank={rank} />

                    {/* Qualification cutoff line between position 8 and 9 */}
                    {rank === 8 && (
                      <div className="flex items-center gap-2 px-2 py-1.5 my-1">
                        <div className="flex-1 h-px bg-red-300" />
                        <span className="shrink-0 text-[10px] sm:text-xs font-semibold text-red-500 uppercase tracking-wide">
                          Qualification Line
                        </span>
                        <div className="flex-1 h-px bg-red-300" />
                      </div>
                    )}
                  </div>
                )
              })}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  )
}
