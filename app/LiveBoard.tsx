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

type Row = { name: string; points: number; form: string[] }

/**
 * The demo data ships its own colour map, but it's stock Tailwind
 * (`bg-amber-400` and friends). The product's leaderboard colours form by
 * prediction tier, so map onto those tokens instead — the dots here should be
 * the ones people actually meet inside a pool.
 */
const DOT: Record<string, string> = {
  exact: 'bg-tier-exact',
  gd: 'bg-tier-winner-gd',
  correct: 'bg-tier-winner',
  miss: 'bg-tier-miss',
}

/**
 * Named to echo the headline above it: everyone's got an opinion, and these
 * three are the people with the strongest ones and the worst record.
 *
 * Deliberately not POOL_INFO.name from the demo data ("The Anchor's World Cup
 * Pool") — that ties the landing page to both a sponsor and a finished
 * tournament, and a hardcoded tournament in the hero is exactly what this
 * rebuild was undoing.
 *
 * Others that worked, if this one wears thin: "Hot Takes FC", "The Punditry",
 * "Group Chat FC", "We Know Ball". Keep it warm — the product's stated purpose
 * is no bad feelings, so the joke is about everyone being confidently wrong,
 * never about a loser.
 */
const POOL_NAME = 'Armchair Experts'

const FORM_LEN = 4

const BASE: Row[] = PODIUM.slice(0, 3).map((p) => ({
  name: p.name,
  points: p.points,
  form: (p.form ?? []).slice(-FORM_LEN),
}))

// JohnnyB called this one, so the goal is what puts him top. It lands on his
// form too — a gold "exact" dot arrives and the oldest rolls off — which is
// what explains the points. Everyone else holds station.
const AFTER: Row[] = [
  {
    ...BASE[1],
    points: BASE[0].points + 7,
    form: [...BASE[1].form.slice(1), 'exact'],
  },
  BASE[0],
  BASE[2],
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
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle">
          <span className="flex items-center gap-2 min-w-0">
            <span className="t-caption text-ink truncate">{POOL_NAME}</span>
            {/* The name is the joke; this is the disclosure. "Sample pool" did
                both jobs and was dull at each — but dropping the marker
                entirely would leave a visitor wondering whose standings these
                are, which is the one thing this header must not do. */}
            <span className="t-detail uppercase tracking-wider text-muted bg-mist rounded-pill px-2 py-0.5 shrink-0">
              Demo
            </span>
          </span>
          <span className="t-caption text-muted inline-flex items-center gap-1.5 shrink-0">
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
            // Derived by comparing where the row started to where it sits now,
            // rather than special-casing the climber. That way the row being
            // overtaken shows its drop too — a swing has two halves, and only
            // showing the winner's tells half the story.
            const move = BASE.findIndex((r) => r.name === row.name) - slot
            return (
              <div
                key={row.name}
                className={`absolute inset-x-0 flex items-center gap-2.5 px-4 transition-[transform,background-color] duration-500 ease-out motion-reduce:transition-none ${
                  move > 0 ? 'bg-success-500/10' : ''
                }`}
                style={{ height: ROW_H, transform: `translateY(${slot * ROW_H}px)` }}
              >
                <span className="t-num text-sm text-muted w-4">{slot + 1}</span>

                {/* Its own fixed-width column beside the rank. Reserving the
                    space means nothing on the row shifts sideways when a
                    chevron appears — the only thing that should be moving at
                    that moment is the row itself. */}
                <span className="w-3 shrink-0 flex justify-center" aria-hidden>
                  {move !== 0 && (
                    <Icon
                      name={move > 0 ? 'arrow.up' : 'arrow.down'}
                      size={11}
                      weight="bold"
                      className={move > 0 ? 'text-success-500' : 'text-danger-500'}
                    />
                  )}
                </span>

                <span className="flex-1 min-w-0 truncate text-sm font-semibold text-ink">
                  {row.name}
                </span>

                {/* Decorative: the tier each colour encodes is explained inside
                    the app, and reading four colours aloud would tell a
                    screen-reader user nothing useful. The label is the part
                    worth having — a bare row of dots is a puzzle. */}
                <span className="hidden sm:flex items-center gap-1.5" aria-hidden>
                  <span className="t-caption text-muted">Form</span>
                  <span className="flex items-center gap-1">
                    {data.form.map((f, i) => (
                      <span
                        key={`${f}-${i}`}
                        className={`w-1.5 h-1.5 rounded-pill ${DOT[f] ?? 'bg-tier-miss'}`}
                      />
                    ))}
                  </span>
                </span>

                <span className="t-num text-sm text-ink w-9 text-right">{data.points}</span>
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
