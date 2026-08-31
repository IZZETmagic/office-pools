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
import type { DuelRow } from '@/lib/league/duels'

type Side = { entry: string; accuracy: number | null; points: number | null }

export type ShowdownBandProps = {
  m: { duel: DuelRow; you: Side; them: Side | null; matchweek: number }
  state: 'playing' | 'picking'
  name: (e: string | null) => string
  person: (e: string | null) => AvatarPerson | null
  /** Running score, or null before anything has been scored. */
  live: { you: number; them: number } | null
  /** Fixtures in this matchweek with no score row yet. */
  remaining: number | null
  /** A ball is in play RIGHT NOW — not merely "the matchweek is in progress". */
  liveNow: boolean
  /** One entry per fixture: who is taking it, and whether it is being played. */
  strip: Array<{ outcome: 'you' | 'them' | 'same' | 'neither' | 'pending'; live: boolean }>
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
  m, state, name, person, live, remaining, liveNow, strip, rank, points,
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

  const youColour = avatarColor(m.you.entry)
  // ⚠ SLATE, not a colour, while the opponent is unknown. An absent person has
  // no identity colour, and inventing one would mean the reveal changes a
  // colour the member had already learned.
  const themColour = m.them ? avatarColor(m.them.entry) : 'var(--sp-slate)'
  const sealed = m.them === null

  const meta = (e: string | null) => {
    const r = rank?.(e) ?? null
    const p = points?.(e) ?? null
    if (r === null && p === null) return null
    return [r !== null ? ordinal(r) : null, p !== null ? `${p.toLocaleString()} pts` : null]
      .filter(Boolean).join(' · ')
  }

  // The headline number: the running score once anything is scored, and the
  // matchweek's own state before that. Never recomputed — `live` is what
  // DuelsTab already worked out for the card.
  const scored = live !== null
  // ⚠ A VALUE, NOT A COMPONENT. Declaring `const Big = () => …` inside the
  // body and rendering `{big}` makes React treat it as a new component type
  // on every render, which remounts its subtree and loses any state in it.
  const big = scored
    ? (
      <>
        <span>{live.you}</span>
        <span className="text-white/30 mx-2.5">–</span>
        <span>{live.them}</span>
      </>
    )
    : <span className="text-white/45">{state === 'picking' ? 'Not started' : '—'}</span>

  const sub = liveNow
    ? null
    : remaining !== null && remaining > 0
      ? `${remaining} ${remaining === 1 ? 'game' : 'games'} still to play`
      : scored ? 'All games played' : null

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
      {/* ── phone: the pieces travel ─────────────────────────── */}
      <div className="sd-m">
        <p className="sd-mw t-caption text-white/50">Matchweek {m.matchweek}</p>
        <p className="sd-big t-display text-white">{big}</p>
        {sub && <p className="sd-sub t-detail text-white/45">{sub}</p>}
        {liveNow && (
          <p className="sd-sub t-detail">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-danger-500/15 text-danger-500 px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-danger-500 motion-safe:animate-pulse" aria-hidden="true" />
              Live
            </span>
          </p>
        )}

        <Face p={person(m.you.entry)} colour={youColour} className="sd-face sd-face-you" />
        {sealed
          ? <Face p={null} colour={themColour} className="sd-face sd-face-them" unknown />
          : <Face p={person(m.them!.entry)} colour={themColour} className="sd-face sd-face-them" />}
        {sealed && <p className="sd-vee t-display text-accent-400 text-lg select-none">V</p>}

        <div className="sd-who sd-who-you">
          <p className="t-display text-white text-sm truncate">{name(m.you.entry)}</p>
          {meta(m.you.entry) && <p className="t-num text-[10px] text-white/40 mt-0.5">{meta(m.you.entry)}</p>}
        </div>
        <div className="sd-who sd-who-them">
          <p className="t-display text-white text-sm truncate">
            {sealed ? 'Sealed' : name(m.them!.entry)}
          </p>
          {!sealed && meta(m.them!.entry) && (
            <p className="t-num text-[10px] text-white/40 mt-0.5">{meta(m.them!.entry)}</p>
          )}
        </div>
      </div>

      {/* ── md and up: nothing is hidden, everything eases down ── */}
      <div className="sd-d">
        <div className="sd-side">
          <Face p={person(m.you.entry)} colour={youColour} className="sd-face-d" />
          <span className="min-w-0">
            <span className="sd-nm t-display text-white block truncate">{name(m.you.entry)}</span>
            {meta(m.you.entry) && <span className="sd-pts t-num text-white/40 block">{meta(m.you.entry)}</span>}
          </span>
        </div>

        <div className="sd-mid">
          <p className="sd-mw-d t-caption text-white/50">Matchweek {m.matchweek}</p>
          <p className="sd-big-d t-display text-white">{big}</p>
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
            : <Face p={person(m.them!.entry)} colour={themColour} className="sd-face-d" />}
          <span className="min-w-0">
            <span className="sd-nm t-display text-white block truncate">
              {sealed ? 'Sealed' : name(m.them!.entry)}
            </span>
            {!sealed && meta(m.them!.entry) && (
              <span className="sd-pts t-num text-white/40 block">{meta(m.them!.entry)}</span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
