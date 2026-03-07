'use client'

import { useState, useCallback, useMemo, useId } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
import { GROUP_LETTERS } from '@/lib/tournament'
import { Badge } from '@/components/ui/Badge'
import type { TeamData } from '@/app/pools/[pool_id]/types'

type BPGroupRankingStepProps = {
  teams: TeamData[]
  groupRankings: Map<string, string[]>
  onRankingsChange: (rankings: Map<string, string[]>) => void
}

const POSITION_LABELS = ['1st', '2nd', '3rd', '4th'] as const

function getPositionStyle(position: number): string {
  if (position <= 1) return 'bg-success-100 text-success-800 border-success-300'
  if (position === 2) return 'bg-warning-100 text-warning-800 border-warning-300'
  return 'bg-neutral-100 text-neutral-600 border-neutral-300'
}

function getRowHighlight(position: number): string {
  if (position <= 1) return 'bg-success-50/50'
  if (position === 2) return 'bg-warning-50/50'
  return ''
}

function countryCodeToEmoji(code: string): string {
  const upper = code.toUpperCase()
  const offset = 0x1f1e6
  const a = 'A'.charCodeAt(0)
  return String.fromCodePoint(upper.charCodeAt(0) - a + offset, upper.charCodeAt(1) - a + offset)
}

type SortableTeamItemProps = {
  team: TeamData
  position: number
}

function SortableTeamItem({ team, position }: SortableTeamItemProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2.5 py-2.5 rounded-xl border transition-colors
        ${isDragging
          ? 'bg-primary-50 border-primary-300 shadow-lg opacity-90'
          : `border-transparent ${getRowHighlight(position)} hover:bg-neutral-50`
        }
        min-h-[44px] touch-manipulation select-none`}
    >
      <span
        className={`shrink-0 w-9 text-center text-[11px] font-bold py-0.5 rounded-lg border ${getPositionStyle(position)}`}
      >
        {POSITION_LABELS[position]}
      </span>

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

      <span className="flex-1 text-sm font-medium text-neutral-900 truncate">
        {team.country_name}
      </span>

      <button
        type="button"
        className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 cursor-grab active:cursor-grabbing touch-none"
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

type GroupCardProps = {
  groupLetter: string
  teamIds: string[]
  teamsMap: Map<string, TeamData>
  onReorder: (groupLetter: string, newOrder: string[]) => void
}

function GroupCard({ groupLetter, teamIds, teamsMap, onReorder }: GroupCardProps) {
  const dndId = useId()
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = teamIds.indexOf(active.id as string)
      const newIndex = teamIds.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return

      const newOrder = arrayMove(teamIds, oldIndex, newIndex)
      onReorder(groupLetter, newOrder)
    },
    [teamIds, groupLetter, onReorder]
  )

  return (
    <div className="bg-surface rounded-2xl border border-border-default shadow-sm dark:shadow-none overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-border-default bg-surface-secondary">
        <h3 className="text-sm font-bold text-neutral-900">Group {groupLetter}</h3>
      </div>

      <div className="p-1.5">
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={teamIds} strategy={verticalListSortingStrategy}>
            {teamIds.map((teamId, index) => {
              const team = teamsMap.get(teamId)
              if (!team) return null
              return (
                <SortableTeamItem
                  key={team.team_id}
                  team={team}
                  position={index}
                />
              )
            })}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}

export function BPGroupRankingStep({
  teams,
  groupRankings,
  onRankingsChange,
}: BPGroupRankingStepProps) {
  const [touchedGroups, setTouchedGroups] = useState<Set<string>>(new Set())

  const teamsMap = useMemo(() => {
    const map = new Map<string, TeamData>()
    for (const team of teams) {
      map.set(team.team_id, team)
    }
    return map
  }, [teams])

  const defaultRankingsForGroup = useCallback(
    (groupLetter: string): string[] => {
      return teams
        .filter((t) => t.group_letter === groupLetter)
        .sort((a, b) => b.fifa_ranking_points - a.fifa_ranking_points)
        .map((t) => t.team_id)
    },
    [teams]
  )

  const getGroupTeamIds = useCallback(
    (groupLetter: string): string[] => {
      return groupRankings.get(groupLetter) ?? defaultRankingsForGroup(groupLetter)
    },
    [groupRankings, defaultRankingsForGroup]
  )

  const handleReorder = useCallback(
    (groupLetter: string, newOrder: string[]) => {
      setTouchedGroups((prev) => {
        const next = new Set(prev)
        next.add(groupLetter)
        return next
      })

      const updated = new Map(groupRankings)
      for (const letter of GROUP_LETTERS) {
        if (!updated.has(letter)) {
          updated.set(letter, defaultRankingsForGroup(letter))
        }
      }
      updated.set(groupLetter, newOrder)
      onRankingsChange(updated)
    },
    [groupRankings, onRankingsChange, defaultRankingsForGroup]
  )

  const rankedCount = touchedGroups.size

  return (
    <div>
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3">
          <p className="text-sm text-neutral-600">
            <span className="font-bold text-neutral-900">{rankedCount}</span> / 12 groups ranked
          </p>
          {rankedCount === 12 && <Badge variant="green">All groups ranked</Badge>}
        </div>
        {rankedCount === 0 && (
          <p className="text-xs text-neutral-500">
            Rankings initialized from FIFA rankings &mdash; reorder to make your predictions
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {GROUP_LETTERS.map((letter) => (
          <GroupCard
            key={letter}
            groupLetter={letter}
            teamIds={getGroupTeamIds(letter)}
            teamsMap={teamsMap}
            onReorder={handleReorder}
          />
        ))}
      </div>
    </div>
  )
}
