'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Icon } from '@/components/ui/Icon'
import { PODIUM } from './play/demo/mockData'

/**
 * The landing page's one piece of product imagery: a goal goes in, and the
 * table moves because of it.
 *
 * The board on its own only showed that standings exist. What sells this
 * product is the causality — a thing happens in a match you are already
 * watching, and thirty seconds later someone you know has gone past you. So the
 * sequence runs goal → reorder, in that order, with a beat between them. The
 * beat is the whole point; play them simultaneously and it reads as a list
 * sorting itself.
 *
 * To be clear about what this is NOT: it is a marketing demonstration of why
 * the table moves, not an argument for a match ticker in the product. That
 * decision stands — the app tracks consequences, not the ball.
 *
 * It runs on the demo pool (app/play/demo/mockData.ts) and nothing else. A real
 * pool must never render here: the /play/[slug] pages show real boards because
 * those pools opted into being public, and a marketing page has no such opt-in.
 * The header says "sample pool" so nobody wonders whose standings these are.
 */

type Row = { name: string; points: number }

const BASE: Row[] = PODIUM.slice(0, 3).map((p) => ({ name: p.name, points: p.points }))

// JohnnyB called this one, so the goal is what puts him top. The points he
// gains are the swing; everyone else holds station.
const AFTER: Row[] = [
  { name: BASE[1].name, points: BASE[0].points + 7 },
  { name: BASE[0].name, points: BASE[0].points },
  { name: BASE[2].name, points: BASE[2].points },
]

const ROW_H = 44

/** rest → goal lands → table reacts → back to rest. */
type Phase = 'rest' | 'goal' | 'moved'
const NEXT: Record<Phase, Phase> = { rest: 'goal', goal: 'moved', moved: 'rest' }
const HOLD: Record<Phase, number> = { rest: 2200, goal: 1100, moved: 3400 }

const REDUCED = '(prefers-reduced-motion: reduce)'

/**
 * Subscribed rather than read once in an effect. Setting state synchronously
 * inside an effect cascades renders (and the linter rightly rejects it), and a
 * plain useState initialiser would break SSR since `window` doesn't exist
 * there. The server snapshot says "motion is fine" — the timer simply doesn't
 * start until hydration, by which point this reports the truth.
 */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(REDUCED)
      mq.addEventListener('change', notify)
      return () => mq.removeEventListener('change', notify)
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  )
}

export function LiveBoard() {
  const still = usePrefersReducedMotion()
  const [phase, setPhase] = useState<Phase>('rest')

  useEffect(() => {
    if (still) return
    const t = setTimeout(() => setPhase((p) => NEXT[p]), HOLD[phase])
    return () => clearTimeout(t)
  }, [phase, still])

  // Reduced motion gets the end of the story rather than none of it: the goal
  // has landed and the table has already moved, with nothing animating.
  const shown: Phase = still ? 'moved' : phase
  const moved = shown === 'moved'
  const order = moved ? AFTER : BASE
  const showGoal = shown !== 'rest'

  return (
    <div className="w-full max-w-md">
      {/* The match strip is always present — it just changes state. An earlier
          version faded the goal in from nothing, which left a hole above the
          board for the two seconds it was resting. Showing the fixture at rest
          fills that space AND tells more of the story: a match is running,
          then it turns, then the table follows. */}
      <div
        className={`mb-3 flex items-center gap-2.5 rounded-chip px-3.5 py-2.5 transition-colors duration-300 motion-reduce:transition-none ${
          showGoal
            ? 'bg-accent-400 text-ink shadow-card'
            : 'bg-surface/70 text-muted border border-border-subtle'
        }`}
      >
        {showGoal ? (
          <>
            <Icon name="sportscourt" size={16} weight="bold" />
            <span className="t-caption">Goal</span>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-pill bg-success-500" aria-hidden />
            <span className="t-caption">62&apos;</span>
          </>
        )}
        <span className={`flex-1 min-w-0 truncate text-sm ${showGoal ? 'font-bold' : 'font-semibold text-ink'}`}>
          Man United <span className="t-num">{showGoal ? '1–0' : '0–0'}</span> Arsenal
        </span>
      </div>

      <div className="rounded-card bg-surface border border-border-subtle shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <span className="t-caption text-muted">Sample pool</span>
          <span className="t-caption text-muted inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-pill bg-success-500" aria-hidden />
            Live
          </span>
        </div>

        {/* Fixed height with absolutely-placed rows: the rows slide past each
            other rather than the list reflowing, which is what makes this read
            as one table moving instead of two lists swapping. */}
        <div className="relative" style={{ height: ROW_H * 3 }}>
          {BASE.map((row) => {
            const slot = order.findIndex((r) => r.name === row.name)
            const data = order[slot]
            const climbed = moved && slot === 0 && row.name !== BASE[0].name
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
                {climbed && (
                  <span className="text-success-500 inline-flex items-center" aria-hidden>
                    <Icon name="arrow.up" size={12} weight="bold" />
                  </span>
                )}
                <span className="t-num text-sm text-ink">{data.points}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* The caption carries the argument for anyone who arrives mid-loop or
          can't see the animation at all. */}
      <p className="mt-3 t-detail text-muted text-center">
        {still
          ? 'A goal goes in, and the table moves.'
          : 'Every goal reshuffles the table — usually while everyone is still watching.'}
      </p>
    </div>
  )
}
