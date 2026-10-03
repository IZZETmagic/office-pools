'use client'

// Profile → Crews — the web twin of mobile's My Crews (mobile/app/profile/crews/index.tsx).
//
// The groups you play with. ⭐ GROUPS, NEVER PEOPLE: each card is a crew — its faces, how long it
// has been going, what it's doing now — and there is no page of individual contacts anywhere. A
// crew is joined by playing in one of its pools, or by saying yes when its captain adds you
// (Ryan, 2026-10-02: no friends list). "New crew" is the only door that starts one from nothing.
//
// Reads GET /api/crews. ⚠ The crew tables are deny-all, so this must go through the API — a direct
// PostgREST read from the browser would return [] silently.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Icon } from '@/components/ui/Icon'
import { crewRequest } from '@/lib/crews/client'
import type { CrewCard } from '@/lib/crews/read'
import { crewStatusText, crewSummary, leaderText, meText } from '@/lib/crews/words'

import { CrewFaceStack } from './CrewFace'
import { NameCrewModal } from './NameCrewModal'
import { useCrewFetch } from './useCrewFetch'

export function MyCrewsTab({ viewerId }: { viewerId: string }) {
  const router = useRouter()
  const [attempt, setAttempt] = useState(0)
  const [naming, setNaming] = useState(false)
  const { data, error } = useCrewFetch<{ crews: CrewCard[] }>('/api/crews', attempt)
  const crews = data?.crews ?? null

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setNaming(true)}
        className="flex items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-primary-600/50 py-3.5 text-sm font-black text-primary-600 hover:bg-primary-600/5 transition-colors"
      >
        <Icon name="plus" size={14} weight="semibold" />
        New crew
      </button>

      {error ? (
        <div className="rounded-card bg-surface p-5 text-center flex flex-col items-center gap-3">
          <p className="text-sm text-muted">We couldn’t load your crews just now.</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="text-sm font-bold text-primary-600"
          >
            Try again
          </button>
        </div>
      ) : crews === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : crews.length === 0 ? (
        <p className="rounded-card bg-surface p-5 text-sm text-muted text-center">
          No crews yet. When a pool you run finishes, you’ll be offered to keep its group together — or start one here
          with New crew.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {crews.map((c) => (
            <li key={c.crewId}>
              <CrewCardRow crew={c} viewerId={viewerId} />
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-control bg-mist p-4 flex gap-2.5">
        <Icon name="person.3.fill" size={14} className="text-muted mt-0.5 shrink-0" />
        <p className="text-[12.5px] leading-[18px] text-ink">
          A crew is a group you play with. You’re in one because you played in its pools, or because you said yes when
          its captain added you. Each new season you get a saved spot — use it or don’t. We’ll remind you once. Leave
          anytime.
        </p>
      </div>

      {naming ? (
        <NameCrewModal
          title="Name your crew"
          description="You’ll be its captain. Add people next — by username or email."
          placeholder="e.g. Sunday League"
          confirmLabel="Create"
          onClose={() => setNaming(false)}
          onSubmit={async (name) => {
            const { crewId } = await crewRequest<{ crewId: string }>('/api/crews', { body: { name } })
            router.push(`/crews/${encodeURIComponent(crewId)}`)
          }}
        />
      ) : null}
    </div>
  )
}

function CrewCardRow({ crew, viewerId }: { crew: CrewCard; viewerId: string }) {
  const tone =
    crew.status.kind === 'seat'
      ? 'bg-primary-600/10 text-primary-600'
      : crew.status.kind === 'live'
        ? 'bg-success-600/10 text-success-700 dark:text-success-400'
        : 'bg-mist text-muted'
  const leader = leaderText(crew, viewerId)
  const me = meText(crew)
  return (
    <Link
      href={`/crews/${encodeURIComponent(crew.crewId)}`}
      className="block rounded-card bg-surface p-4 hover:bg-mist/40 transition-colors"
    >
      <div className="flex items-center gap-3">
        <CrewFaceStack people={crew.faces} total={crew.people} />
        <div className="flex-1 min-w-0">
          <p className="truncate text-[17px] font-black text-ink">{crew.name}</p>
          <p className="text-xs font-medium text-muted">{crewSummary(crew)}</p>
        </div>
        <Icon name="chevron.right" size={12} weight="semibold" className="text-muted" />
      </div>
      <span className={`mt-3 inline-flex max-w-full items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-bold ${tone}`}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-current" />
        <span className="truncate">{crewStatusText(crew.status)}</span>
      </span>
      {leader || me ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-ink">
          {leader ? (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="trophy.fill" size={12} className="text-warning-600" />
              {leader}
            </span>
          ) : null}
          {me ? (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="person.crop.circle" size={12} className="text-muted" />
              {me}
            </span>
          ) : null}
        </div>
      ) : null}
    </Link>
  )
}
