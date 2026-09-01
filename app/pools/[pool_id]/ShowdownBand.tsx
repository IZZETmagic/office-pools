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

import { useEffect, useRef, useState } from 'react'

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

/**
 * ⚠ THE PHONE BAND'S VERTICAL GEOMETRY LIVES HERE, NOT IN globals.css.
 *
 * Two reasons, one practical and one that outlasts it. The practical one: this
 * checkout's dev server keeps serving stale CSS while picking up TSX every
 * time, so a stylesheet edit is a change you cannot be sure anyone will see.
 * The lasting one: these numbers only make sense together. The clock has to
 * land on the same centre line as the faces, and the matchweek has to clear the
 * clock — split across two files, that relationship is invisible and the next
 * person tunes one number and breaks two.
 *
 * Each value is `expanded - travel * --p`. Expanded is the layout Ryan approved
 * and is not being changed; only the collapsed end moves.
 *
 * Collapsed, the block is 100px and everything is arranged around the faces:
 *   faces  36px at top 32  -> centre 50
 *   clock  22px at top 39  -> centre 50   (same line, which is the ask)
 *   label  12px at top 14  -> 13px of air beneath it before the clock
 */
/**
 * How much height the band gives up between open and collapsed.
 *
 * ⚠ IT IS ALSO THE SCROLL DISTANCE THE COLLAPSE TAKES, and that equality is
 * the whole interaction. Ryan: "the page content should push the collapsing of
 * the hero until where it was collapsing before, THEN scroll behind it."
 *
 * The band is pinned at the top, so during the collapse the content below rises
 * at the scroll rate while the band's bottom edge rises at the COLLAPSE rate.
 * Set those equal and the content's top edge stays welded to the band's bottom
 * — the content appears to push the band shut. Make the collapse faster, as it
 * was at 150px against 220px of height, and the band outruns the content, which
 * then slides underneath it instead. Slower, and a gap opens.
 *
 * So this is one number used twice on purpose. Splitting it into a height and a
 * separate scroll distance is what made it wrong in the first place.
 */
const COLLAPSE_PX = 220
/** The duel block open, before any of COLLAPSE_PX has been given up. */
const HERO = 320

const M = {
  block: { height: `calc(320px - ${COLLAPSE_PX}px * var(--p))` },
  mw:    { top: 'calc(20px - 6px * var(--p))', fontSize: 'calc(15px - 3px * var(--p))' },
  big:   { top: 'calc(50px - 11px * var(--p))', fontSize: 'calc(40px - 18px * var(--p))' },
  face:  { top: 'calc(146px - 114px * var(--p))',
           width: 'calc(72px - 36px * var(--p))', height: 'calc(72px - 36px * var(--p))' },
  faceL: { left:  'calc(38px - 22px * var(--p))' },
  faceR: { right: 'calc(38px - 22px * var(--p))' },
} as const

const MW_SIZE_D = { fontSize: 'calc(16px - 4px * var(--p))' }

/** See the note at the usage site: off-token on purpose, and only here. */
const BAND_RADIUS = '44px'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** One member's face, at whatever size the band is currently showing. */
function Face({
  p, colour, className, style, unknown = false,
}: {
  p: AvatarPerson | null
  colour: string
  className: string
  style?: React.CSSProperties
  unknown?: boolean
}) {
  return (
    <span
      className={`${className} rounded-full shrink-0 grid place-items-center overflow-hidden`}
      style={unknown
        ? { ...style, border: '2px dashed rgba(255,255,255,0.28)' }
        /* ⚠ The ring thins as the face shrinks. A fixed 3px is a hairline on a
           72px circle and a stripe on a 32px one — a ring is a proportion of
           what it rings. */
        : { ...style,
            boxShadow: `0 0 0 calc(3px - 1px * var(--p)) color-mix(in srgb, ${colour} 42%, transparent)` }}
    >
      {unknown
        ? <span className="t-num t-num-black text-white/40"
                style={{ fontSize: 'calc(22px - 10px * var(--p))' }} aria-hidden="true">?</span>
        : p
          /* ⚠ `'100%'` AND AN EXPLICIT FONT SIZE. The parent's width is a
             `calc()` on `--p`, so the avatar has to be told to fill rather than
             given a number — a number pinned it at 72px inside a 32px box and
             clipped the circle off-centre on the way down. */
          ? <Avatar person={p} size="100%" fontSize="calc(26px - 13px * var(--p))" />
          : <span className="block w-full h-full bg-white/10" aria-hidden="true" />}
    </span>
  )
}

export function ShowdownBand({
  header, matchweek, youEntry, themEntry, name, person, headline, sub,
  liveNow = false, strip = [], rank, points,
}: ShowdownBandProps) {
  const bandRef = useRef<HTMLDivElement>(null)
  /**
   * The header row's height, measured — it feeds the spacer, so guessing it
   * would leave a gap or an overlap under the band. AppHeader is `py-3` on a
   * phone and `py-4` from `sm`, so it is not one number.
   */
  const [barH, setBarH] = useState(56)

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
        // ⚠ DIVIDED BY THE HEIGHT IT LOSES, not by a round number. See
        // COLLAPSE_PX: this equality is what makes the content push the band
        // rather than slide under it.
        el.style.setProperty(
          '--p', Math.min(1, Math.max(0, window.scrollY / COLLAPSE_PX)).toFixed(3))
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    /**
     * ⚠ THE BAND PUBLISHES ITS OWN HEIGHT, so nothing else has to guess it.
     *
     * The sticky rail on the duel page has to sit BELOW the collapsed band, and
     * it was doing that with a hardcoded `top-[124px]` — a number I estimated
     * from the type sizes and got wrong, so the table slid up against the band
     * with no gap. The band is the only thing that knows how tall it is.
     *
     * ⚠ A ResizeObserver, NOT a read in the scroll handler. `offsetHeight`
     * inside the rAF would force a synchronous layout immediately after
     * writing `--p` — a read-after-write on every frame, which is exactly the
     * stall that made the collapse feel like a drawer. The observer's callback
     * runs after layout, so `contentRect` is already known and costs nothing.
     */
    const publish = (h: number) =>
      document.documentElement.style.setProperty('--sd-band-h', `${Math.round(h)}px`)
    publish(el.getBoundingClientRect().height)
    const ro = new ResizeObserver(([entry]) => publish(entry.contentRect.height))
    ro.observe(el)

    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
      ro.disconnect()
      document.documentElement.style.removeProperty('--sd-band-h')
    }
  }, [])

  /**
   * ⚠ THE COLOUR COMES FROM THE PERSON, NOT THE ENTRY.
   *
   * `avatarColor` hashes a USER id — its parameter says so — into ten palette
   * slots. Handed an ENTRY id it returns a perfectly valid colour for the wrong
   * key, which is how a blue avatar ended up inside a red ring: the face is
   * drawn by `<Avatar>` off `person.user_id`, and the ring was drawn off
   * something else entirely. Two ids, two hashes, no reason for them to agree.
   *
   * Every other site already does it this way — the duel card (×4) and the
   * recap sheet — so this was the odd one out rather than a new rule.
   */
  const colourOf = (e: string | null) => {
    const p = person(e)
    return p ? avatarColor(p.user_id) : 'rgba(255,255,255,0.20)'
  }
  const youColour = colourOf(youEntry)
  // ⚠ SLATE, not a colour, while the opponent is unknown. An absent person has
  // no identity colour, and inventing one would mean the reveal changes a
  // colour the member had already learned.
  const themColour = themEntry ? colourOf(themEntry) : 'var(--sp-slate)'
  const sealed = themEntry === null

  const meta = (e: string | null) => {
    const r = rank?.(e) ?? null
    const p = points?.(e) ?? null
    if (r === null && p === null) return null
    return [r !== null ? ordinal(r) : null, p !== null ? `${p.toLocaleString()} pts` : null]
      .filter(Boolean).join(' · ')
  }


  return (
    <>
    {/* ⚠ THE SPACER IS WHAT MAKES THE CONTENT PUSH THE BAND.
        Measured, not reasoned. While the band was `position: sticky` it stayed
        IN FLOW, so every pixel of height it gave up as it collapsed was handed
        straight back to the page — the content below rose from the shrink AND
        from the scroll, at twice the rate, and slid underneath. No collapse
        speed fixes that; the gap came out at exactly -scrollY at every step.

        A constant-height spacer holds the flow while the band is taken out of
        it, so the content rises at the scroll rate alone and the band's bottom
        edge rises at the collapse rate. Set those equal (see COLLAPSE_PX) and
        the two are welded together:

          scrollY    0  bandBottom 376  contentTop 376   gap 0.0
          scrollY  110  bandBottom 266  contentTop 266   gap 0.0
          scrollY  220  bandBottom 156  contentTop 156   gap 0.0
          scrollY  500  bandBottom 156  contentTop -124  behind ✓

        ⚠ `fixed`, NOT `sticky`. Sticky in a fixed-height spacer would unstick
        the moment the spacer scrolled past — the band would leave the screen
        instead of staying, which is the one thing it must never do. */}
    <div style={{ height: barH + HERO }} aria-hidden="true" />
    <div
      ref={bandRef}
      className="sd-band"
      style={{
        // ⚠ Overrides `sd-band`'s sticky + full-bleed margins inline, because
        // the served stylesheet still carries them and a fixed element with
        // negative margins sits off-screen. Fixed already spans the viewport.
        position: 'fixed', top: 0, left: 0, right: 0,
        marginLeft: 0, marginRight: 0, paddingLeft: 0, paddingRight: 0,
        '--p': 0,
        background:
          `radial-gradient(110% 100% at 10% 0%, color-mix(in srgb, ${youColour} 26%, transparent) 0%, transparent 60%),`
          + `radial-gradient(110% 100% at 90% 0%, color-mix(in srgb, ${themColour} 22%, transparent) 0%, transparent 60%),`
          + 'linear-gradient(180deg, #131A2C 0%, var(--sp-midnight) 100%)',
        /* ⚠ ON THE ELEMENT, not in globals.css. Ryan, 2026-08-31: the bottom
           corners should be rounded, "like welcoming in the bottom page". It
           belongs to this element and nothing else, and keeping it here means
           it travels with the component rather than depending on a stylesheet
           rebuild — which is worth something in a checkout where Turbopack has
           repeatedly served stale CSS while picking up TSX fine.

           ⚠ OFF-TOKEN, DELIBERATELY, AND THE ONLY PLACE IN THE APP THAT IS.
           The ladder ran 24px (radii.lg, "a card") then 32px (radii.xl, the
           bottom sheet's corners) and Ryan asked for more at each step. 32 is
           the largest radius the system defines, so this leaves the set rather
           than pretending a bigger token exists.

           It is defensible exactly once: the band is the only screen-width
           surface in the product, and radii that read as generous on a 340px
           card read as timid across 1200px. A radius is a proportion of the
           thing it is on, and nothing else here is this wide.

           ⚠ DO NOT PROMOTE THIS TO A TOKEN without deciding what else would
           use it. A `--radius-2xl` that one element sets is a constant wearing
           a token's clothes, and the token block already warns against
           reshaping the scale by the back door. */
        borderBottomLeftRadius: BAND_RADIUS,
        borderBottomRightRadius: BAND_RADIUS,
      } as React.CSSProperties}
    >
      {header && <div className="relative z-10" ref={(el) => {
        if (el) setBarH((h: number) => (Math.round(el.offsetHeight) || h))
      }}>{header}</div>}

      {/* ── phone: the pieces travel ─────────────────────────── */}
      <div className="sd-m" style={M.block}>
        <p className="sd-mw t-caption text-white/75" style={M.mw}>Matchweek {matchweek}</p>
        <p className="sd-big t-num t-num-black text-white" style={M.big}>{headline}</p>
        {sub && <p className="sd-sub t-detail text-white/45">{sub}</p>}
        {liveNow && (
          <p className="sd-sub t-detail">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-danger-500/15 text-danger-500 px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-danger-500 motion-safe:animate-pulse" aria-hidden="true" />
              Live
            </span>
          </p>
        )}

        <Face p={person(youEntry)} colour={youColour} className="sd-face sd-face-you" style={{ ...M.face, ...M.faceL }} />
        {sealed
          ? <Face p={null} colour={themColour} className="sd-face sd-face-them" style={{ ...M.face, ...M.faceR }} unknown />
          : <Face p={person(themEntry!)} colour={themColour} className="sd-face sd-face-them" style={{ ...M.face, ...M.faceR }} />}
        {sealed && <p className="sd-vee t-caption text-accent-400 text-base select-none">V</p>}

        <div className="sd-who sd-who-you">
          <p className="t-caption text-white truncate">{name(youEntry)}</p>
          {meta(youEntry) && <p className="t-num text-[10px] text-white/40 mt-0.5">{meta(youEntry)}</p>}
        </div>
        <div className="sd-who sd-who-them">
          <p className="t-caption text-white truncate">
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
            <span className="sd-nm t-caption text-white block truncate">{name(youEntry)}</span>
            {meta(youEntry) && <span className="sd-pts t-num text-white/40 block">{meta(youEntry)}</span>}
          </span>
        </div>

        <div className="sd-mid">
          <p className="sd-mw-d t-caption text-white/75" style={MW_SIZE_D}>Matchweek {matchweek}</p>
          <p className="sd-big-d t-num t-num-black text-white">{headline}</p>
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
            <span className="sd-nm t-caption text-white block truncate">
              {sealed ? 'Sealed' : name(themEntry!)}
            </span>
            {!sealed && meta(themEntry!) && (
              <span className="sd-pts t-num text-white/40 block">{meta(themEntry!)}</span>
            )}
          </span>
        </div>
      </div>
    </div>
    </>
  )
}
