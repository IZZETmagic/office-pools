'use client'

// A pool's crew, on the web pool page (decision 5, 2026-10-02) — mirrors mobile's PoolCrewLine.
//
//   PoolCrewCard   — Info tab, everyone: "Part of Bermuda Office", and before the first lock
//                    "9 in · 3 spots saved". A COUNT — never whose: watching a named list of who
//                    hasn't turned up is exactly what the held seat exists to prevent.
//   PoolSpotsSaved — Members tab (admin-only already): who is still pending, by name. The server
//                    sends the names to the pool's admin only (lib/crews/read.readPoolCrew).
//
// Both render NOTHING for a pool with no crew, or when the API can't answer — so every existing
// pool looks exactly as it did.
//
// ⚠ Asks the server every time rather than reading `crew_id` off the page's pool row: that row is
// cached (lib/poolData, 45s), and a pool saved as a crew a moment ago would show nothing.

import Link from 'next/link'

import { Icon } from '@/components/ui/Icon'
import type { PoolCrewView } from '@/lib/crews/read'
import { personName } from '@/lib/crews/words'

import { CrewFace } from './CrewFace'
import { useCrewFetch } from './useCrewFetch'

function usePoolCrew(poolId: string): PoolCrewView | null {
  // Decoration: a failure shows nothing, which is exactly what a crewless pool shows.
  return useCrewFetch<PoolCrewView>(`/api/pools/${encodeURIComponent(poolId)}/crew`).data
}

export function PoolCrewCard({ poolId }: { poolId: string }) {
  const data = usePoolCrew(poolId)
  if (!data?.crew) return null
  return (
    <Link
      href={`/crews/${encodeURIComponent(data.crew.crewId)}`}
      className="block rounded-card bg-surface shadow-card dark:shadow-none dark:border dark:border-border-default p-4 hover:bg-mist/40 transition-colors"
    >
      <span className="flex items-center gap-2">
        <Icon name="person.3.fill" size={14} className="text-primary-600 shrink-0" />
        <span className="flex-1 min-w-0 truncate text-[14.5px] font-bold text-ink">Part of {data.crew.name}</span>
        <Icon name="chevron.right" size={12} weight="semibold" className="text-muted" />
      </span>
      {data.saved > 0 ? (
        <span className="mt-1 block text-[13px] font-semibold text-muted">
          <span className="font-black text-success-700 dark:text-success-400">{data.inPool} in</span> · {data.saved}{' '}
          {data.saved === 1 ? 'spot' : 'spots'} saved until picks lock
        </span>
      ) : null}
    </Link>
  )
}

export function PoolSpotsSaved({ poolId }: { poolId: string }) {
  const data = usePoolCrew(poolId)
  const pending = data?.pending
  if (!data?.crew || !pending || pending.length === 0) return null
  return (
    <div className="mb-4 rounded-card bg-surface shadow-card dark:shadow-none dark:border dark:border-border-default p-4 flex flex-col gap-2.5">
      <p className="text-[10px] font-black tracking-[0.6px] text-muted">SPOTS SAVED · {pending.length}</p>
      <ul className="divide-y divide-border-subtle">
        {pending.map((p) => (
          <li key={p.userId} className="flex items-center gap-3 py-2">
            <CrewFace person={p} size={28} />
            <span className="flex-1 min-w-0 truncate text-sm font-bold text-ink">{personName(p)}</span>
            <span className="text-xs font-bold text-muted">Waiting</span>
          </li>
        ))}
      </ul>
      <p className="text-[11.5px] leading-4 text-muted">
        Only you see these names, as the pool’s admin. We send the one reminder — nobody has to chase.
      </p>
    </div>
  )
}
