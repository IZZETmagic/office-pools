'use client'

// =============================================================
// THE SHOWDOWN BAND — the duel as the head of the page
// =============================================================
// Plan: drafts/2026-08-31_showdown_one_page_plan.md §1.
//
// Ryan, 2026-08-31: *"this is the flagship pool mode so I want it to be flashy
// AND simple"* — eight tabs become four sections, and the duel stops being one
// of them. This is what replaces the tab: a sticky band at the top of the page
// that collapses as you scroll and never leaves.
//
// ## ⚠ IT TAKES DuelPanel'S PROPS, EXACTLY
//
// Every value here is already computed by `DuelsTab` for the card this stands
// in for. Nothing is derived again: not the score, not the strip, not who is
// leading. A band that worked out its own numbers would be a second opinion
// about the same duel, which is the divergence the scoring architecture rule
// exists to prevent — and this project has already shipped that bug twice
// (`buildDuelTable`'s fallback, and the reveal-rule mirror in read.ts).
//
// ## ⚠ THE CARD IS NOT DELETED
//
// `DuelPanel` still renders, unchanged, in tab mode. This is an alternative
// presentation chosen by a prop, not a replacement — so the two-week-old layout
// is one query parameter away for as long as the rework is unproven.
//
// ## Why the scroll listener writes CSS instead of React state
//
// `--p` runs 0 → 1 over the first 150px and every size in `.sd-band`
// interpolates off it. Holding that in `useState` would re-render a subtree
// carrying the whole duel on every scroll frame. One property on one element
// costs nothing and the browser handles it.
// =============================================================

import { useEffect, useRef } from 'react'

import { Avatar, type AvatarPerson } from '@/components/ui/Avatar'
import { avatarColor } from '@/lib/design/avatarGradient'

/**
 * ⚠ PRESENTATIONAL, DELIBERATELY. The band decides nothing — not which
 * matchweek, not whether a duel is sealed, not what the headline says. It is
 * handed a headline and two people and lays them out at whatever size the
 * scroll position calls for.
 *
 * That is what lets `DuelsTab` drive all three states with the components it
 * already has: `Countdown` for a sealed week, the running score for a live one,
 * the final score once it is decided. A band that chose between those would be
 * a third place that knows the duel lifecycle, and there are already two.
 */
export type ShowdownBandProps = {
  /**
   * The app header, drawn INSIDE the band over the gradient.
   *
   * ⚠ The band and the header are ONE object — that is the whole point. Left
   * as two, the header is an opaque bar the band slides underneath, and the
   * collapse looks like content being clipped rather than a head of page
   * getting shorter.
   */
  header?: React.ReactNode
  matchweek: number
  /** The viewer's entry. */
  youEntry: string
  /** The opponent, or null while the draw is still sealed. */
  themEntry: string | null
  name: (e: string | null) => string
  person: (e: string | null) => AvatarPerson | null
  /** The big number, or the countdown, or whatever this state calls for. */
  headline: React.ReactNode
  /** One quiet line under it. */
  sub?: string | null
  /** A ball is in play RIGHT NOW — not merely "the matchweek is in progress". */
  liveNow?: boolean
  /** One entry per fixture: who is taking it, and whether it is being played. */
  strip?: Array<{ outcome: 'you' | 'them' | 'same' | 'neither' | 'pending'; live: boolean }>
  /** Season rank, for the line under each name. Null while unranked. */
  rank?: (e: string | null) => number | null
  /** Season points, same. */
  points?: (e: string | null) => number | null
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** One member's face, at whatever size the band is currently showing. */
function Face({
  p, colour, className, unknown = false,
}: {
  p: AvatarPerson | null
  colour: string
  className: string
  unknown?: boolean
}) {
  return (
    <span
      className={`${className} rounded-full shrink-0 grid place-items-center overflow-hidden`}
      style={unknown
        ? { border: '2px dashed rgba(255,255,255,0.28)' }
        : { boxShadow: `0 0 0 3px color-mix(in srgb, ${colour} 42%, transparent)` }}
    >
      {unknown
        ? <span className="t-display text-white/40 text-lg" aria-hidden="true">?</span>
        : p
          ? <Avatar person={p} size={72} className="w-full h-full" />
          : <span className="block w-full h-full bg-white/10" aria-hidden="true" />}
    </span>
  )
}

export function ShowdownBand({
  header, matchweek, youEntry, themEntry, name, person, headline, sub,
  liveNow = false, strip = [], rank, points,
}: ShowdownBandProps) {
  const bandRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = bandRef.current
    if (!el) return
    let frame = 0
    const onScroll = () => {
      if (frame) return
      // One write per animation frame, not one per scroll event: a trackpad
      // fires far more of the latter than the screen can show.
      frame = requestAnimationFrame(() => {
        frame = 0
        el.style.setProperty('--p', Math.min(1, Math.max(0, window.scrollY / 150)).toFixed(3))
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  const youColour = avatarColor(youEntry)
  // ⚠ SLATE, not a colour, while the opponent is unknown. An absent person has
  // no identity colour, and inventing one would mean the reveal changes a
  // colour the member had already learned.
  const themColour = themEntry ? avatarColor(themEntry) : 'var(--sp-slate)'
  const sealed = themEntry === null

  const meta = (e: string | null) => {
    const r = rank?.(e) ?? null
    const p = points?.(e) ?? null
    if (r === null && p === null) return null
    return [r !== null ? ordinal(r) : null, p !== null ? `${p.toLocaleString()} pts` : null]
      .filter(Boolean).join(' · ')
  }


  return (
    <div
      ref={bandRef}
      className="sd-band"
      style={{
        '--p': 0,
        background:
          `radial-gradient(110% 100% at 10% 0%, color-mix(in srgb, ${youColour} 26%, transparent) 0%, transparent 60%),`
          + `radial-gradient(110% 100% at 90% 0%, color-mix(in srgb, ${themColour} 22%, transparent) 0%, transparent 60%),`
          + 'linear-gradient(180deg, #131A2C 0%, var(--sp-midnight) 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      } as React.CSSProperties}
    >
      {header && <div className="relative z-10">{header}</div>}

      {/* ── phone: the pieces travel ─────────────────────────── */}
      <div className="sd-m">
        <p className="sd-mw t-caption text-white/50">Matchweek {matchweek}</p>
        <p className="sd-big t-display text-white">{headline}</p>
        {sub && <p className="sd-sub t-detail text-white/45">{sub}</p>}
        {liveNow && (
          <p className="sd-sub t-detail">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-danger-500/15 text-danger-500 px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-danger-500 motion-safe:animate-pulse" aria-hidden="true" />
              Live
            </span>
          </p>
        )}

        <Face p={person(youEntry)} colour={youColour} className="sd-face sd-face-you" />
        {sealed
          ? <Face p={null} colour={themColour} className="sd-face sd-face-them" unknown />
          : <Face p={person(themEntry!)} colour={themColour} className="sd-face sd-face-them" />}
        {sealed && <p className="sd-vee t-display text-accent-400 text-lg select-none">V</p>}

        <div className="sd-who sd-who-you">
          <p className="t-display text-white text-sm truncate">{name(youEntry)}</p>
          {meta(youEntry) && <p className="t-num text-[10px] text-white/40 mt-0.5">{meta(youEntry)}</p>}
        </div>
        <div className="sd-who sd-who-them">
          <p className="t-display text-white text-sm truncate">
            {sealed ? 'Sealed' : name(themEntry!)}
          </p>
          {!sealed && meta(themEntry!) && (
            <p className="t-num text-[10px] text-white/40 mt-0.5">{meta(themEntry!)}</p>
          )}
        </div>
      </div>

      {/* ── md and up: nothing is hidden, everything eases down ── */}
      <div className="sd-d">
        <div className="sd-side">
          <Face p={person(youEntry)} colour={youColour} className="sd-face-d" />
          <span className="min-w-0">
            <span className="sd-nm t-display text-white block truncate">{name(youEntry)}</span>
            {meta(youEntry) && <span className="sd-pts t-num text-white/40 block">{meta(youEntry)}</span>}
          </span>
        </div>

        <div className="sd-mid">
          <p className="sd-mw-d t-caption text-white/50">Matchweek {matchweek}</p>
          <p className="sd-big-d t-display text-white">{headline}</p>
          {sub && <p className="sd-sub-d t-detail text-white/45">{sub}</p>}
          {liveNow && (
            <p className="sd-sub-d t-detail">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-danger-500/15 text-danger-500 px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-danger-500 motion-safe:animate-pulse" aria-hidden="true" />
                Live
              </span>
            </p>
          )}
          {strip.length > 0 && !sealed && (
            <div className="sd-strip-d flex items-stretch gap-1 h-1.5" aria-hidden="true">
              {strip.map(({ outcome: o, live: isLive }, i) => (
                <span
                  key={i}
                  className={`flex-1 rounded-full ${isLive ? 'duel-chip-live' : ''} ${
                    o === 'same' || o === 'neither' ? 'bg-white/15'
                      : o === 'pending' ? 'border border-dashed border-white/25' : ''}`}
                  style={o === 'you' ? { background: youColour }
                    : o === 'them' ? { background: themColour } : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <div className="sd-side flex-row-reverse text-right">
          {sealed
            ? <Face p={null} colour={themColour} className="sd-face-d" unknown />
            : <Face p={person(themEntry!)} colour={themColour} className="sd-face-d" />}
          <span className="min-w-0">
            <span className="sd-nm t-display text-white block truncate">
              {sealed ? 'Sealed' : name(themEntry!)}
            </span>
            {!sealed && meta(themEntry!) && (
              <span className="sd-pts t-num text-white/40 block">{meta(themEntry!)}</span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
