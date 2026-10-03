'use client'

// Starting a pool for a crew, on the web — the create wizard's Crew row (Decision 3: "Name · Crew ·
// Who can join · Create"). The web twin of mobile/app/create-pool.tsx's crew state and DetailsStep.
//
//   useCreatePoolCrew — the state: my crews, the one picked, its roster (Free tier) and who gets a
//                       saved spot, and whether the Details step may move on.
//   CreatePoolCrewSection — the row itself, on the Details step. Only shown to someone in a crew:
//                       "No crew" alone is no choice at all.
//
// No crew is a real answer — share the link, and when the pool ends you're offered to keep the
// group together.

import { useState } from 'react'

import type { CrewCard, CrewDetail, RosterView } from '@/lib/crews/read'
import { plural, seatSelectionProblem } from '@/lib/crews/words'

import { useCrewFetch } from './useCrewFetch'

export function useCreatePoolCrew() {
  const { data: list } = useCrewFetch<{ crews: CrewCard[] }>('/api/crews')
  const crews = list?.crews ?? []
  const [crewId, setCrewId] = useState<string | null>(null)
  /** Who gets a saved spot. NULL until the starter changes it — then the roster's defaults apply. */
  const [seatUserIds, setSeatUserIds] = useState<string[] | null>(null)

  const id = crewId ? encodeURIComponent(crewId) : null
  const roster = useCrewFetch<RosterView>(id ? `/api/crews/${id}/roster?tier=free` : null)
  // For "already playing this?" — the crew's running pools.
  const detail = useCrewFetch<CrewDetail>(id ? `/api/crews/${id}` : null)

  const seats = seatUserIds ?? roster.data?.rows.filter((r) => r.ticked).map((r) => r.userId) ?? []
  const seatProblem = crewId ? seatSelectionProblem(seats.length, roster.data?.spots ?? null) : null
  const picked = crews.find((c) => c.crewId === crewId) ?? null

  return {
    crews,
    crewId,
    picked,
    roster: roster.data,
    rosterLoading: roster.loading,
    playingNow: detail.data?.playingNow ?? [],
    seats,
    seatProblem,
    /**
     * May the Details step move on? A crew pool needs its roster, a choice of saved spots the pool
     * can hold, and the crew's running pools read (or failed to read — the guard is a confirm, and
     * the server doesn't depend on it).
     */
    ready: !crewId || (!!roster.data && !seatProblem && !detail.loading),
    seatLine: crewId
      ? roster.data
        ? `${plural(seats.length, 'person gets', 'people get')} a saved spot`
        : roster.loading
          ? 'Loading the crew…'
          : 'Couldn’t load the crew'
      : null,
    pickCrew(next: string | null) {
      setCrewId(next)
      setSeatUserIds(null)
    },
    setSeats: setSeatUserIds,
  }
}

export type CreatePoolCrew = ReturnType<typeof useCreatePoolCrew>

export function CreatePoolCrewSection({ crew, onReview }: { crew: CreatePoolCrew; onReview: () => void }) {
  if (crew.crews.length === 0) return null
  const options = [
    ...crew.crews.map((c) => ({ id: c.crewId as string | null, title: c.name, sub: plural(c.people, 'person', 'people') })),
    { id: null, title: 'No crew', sub: 'Share a link instead' },
  ]
  return (
    <div className="space-y-2" role="radiogroup" aria-labelledby="create-crew-label">
      <p id="create-crew-label" className="text-sm font-bold text-ink">
        Crew
      </p>
      <p className="text-sm text-neutral-600">
        Pick a crew and they each get a saved spot. No crew is fine — share the link, and when the pool ends you can
        keep the group together.
      </p>
      {options.map((o) => {
        const on = crew.crewId === o.id
        return (
          <button
            key={o.id ?? 'none'}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => crew.pickCrew(o.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition ${
              on ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'
            }`}
          >
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm font-medium text-neutral-900">{o.title}</span>
              <span className="block text-xs text-neutral-500">{o.sub}</span>
            </span>
            <span
              aria-hidden
              className={`h-5 w-5 shrink-0 rounded-pill ${on ? 'border-[6px] border-primary-600' : 'border-[1.5px] border-silver'}`}
            />
          </button>
        )
      })}
      {crew.crewId && crew.seatLine ? (
        <button
          type="button"
          onClick={onReview}
          disabled={!crew.roster}
          className="w-full flex items-center gap-2 py-1 text-left disabled:cursor-default"
        >
          <span className={`flex-1 text-[13px] font-semibold ${crew.seatProblem ? 'text-danger-700' : 'text-ink'}`}>
            {crew.seatProblem ?? crew.seatLine}
          </span>
          {crew.roster ? <span className="text-[13px] font-bold text-primary-600">Review</span> : null}
        </button>
      ) : null}
    </div>
  )
}
