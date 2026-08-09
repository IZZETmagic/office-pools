'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { PODIUM, FORM_COLORS } from './play/demo/mockData'

/**
 * The landing page's one piece of product imagery: a leaderboard that moves.
 *
 * The page it replaced had zero images of the product — no board, no numerals,
 * no form dots — which is why it read as a brochure for something invisible.
 * A commissioner is buying the thing their group will stare at every matchday,
 * so that thing has to be on the page.
 *
 * It runs on the demo pool (app/play/demo/mockData.ts) and nothing else. A real
 * pool must never render here: the /play/[slug] pages show real boards because
 * those pools opted into being public, and a marketing page has no such opt-in.
 * The header says "sample pool" for the same reason — a visitor should never
 * have to wonder whose standings these are.
 *
 * One overtake, on a slow loop. A board that churns continuously reads as a
 * screensaver; the point is the swing, and a swing needs stillness around it.
 */

type Row = { name: string; points: number; form: string[] }

const BASE: Row[] = PODIUM.slice(0, 3).map((p) => ({
  name: p.name,
  points: p.points,
  form: (p.form ?? []).slice(0, 4),
}))

// Second state: #2 overtakes #1. Points are the demo pool's own, plus the swing.
const OVERTAKEN: Row[] = [
  { ...BASE[1], points: BASE[0].points + 7 },
  BASE[0],
  BASE[2],
]

const ROW_H = 44

export function LiveBoard() {
  const [swung, setSwung] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setSwung((v) => !v), 3600)
    return () => clearInterval(t)
  }, [])

  const order = swung ? OVERTAKEN : BASE

  return (
    <div className="w-full max-w-md rounded-card bg-surface border border-border-subtle shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <span className="t-caption text-muted">Sample pool</span>
        <span className="t-caption text-muted inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-pill bg-success-500" aria-hidden />
          Live
        </span>
      </div>

      {/* Fixed height + absolutely-placed rows: the rows slide past each other
          rather than the list reflowing, which is what makes the overtake read
          as one board moving instead of two lists swapping. */}
      <div className="relative" style={{ height: ROW_H * 3 }}>
        {BASE.map((row) => {
          const slot = order.findIndex((r) => r.name === row.name)
          const data = order[slot]
          const climbed = swung && slot === 0 && row.name !== BASE[0].name
          return (
            <div
              key={row.name}
              className={`absolute inset-x-0 flex items-center gap-3 px-4 transition-[transform,background-color] duration-500 ease-out motion-reduce:transition-none ${
                climbed ? 'bg-success-500/10' : ''
              }`}
              style={{ height: ROW_H, transform: `translateY(${slot * ROW_H}px)` }}
            >
              <span className="t-num text-sm text-muted w-4">{slot + 1}</span>
              <span className="flex-1 min-w-0 truncate text-sm font-semibold text-ink">
                {row.name}
              </span>
              {climbed ? (
                <span className="text-success-500 inline-flex items-center">
                  <Icon name="arrow.up" size={12} weight="bold" />
                </span>
              ) : (
                <span className="flex items-center gap-1" aria-hidden>
                  {row.form.map((f, i) => (
                    <span key={i} className={`w-1.5 h-1.5 rounded-pill ${FORM_COLORS[f] ?? 'bg-silver'}`} />
                  ))}
                </span>
              )}
              <span className="t-num text-sm text-ink tabular-nums">{data.points}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
