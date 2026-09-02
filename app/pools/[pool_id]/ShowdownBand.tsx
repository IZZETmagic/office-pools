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
  /**
   * The big READING at the top — a score, a countdown. Null when this state has
   * nothing to say up there, which shortens the phone band (see `M_BETWEEN`).
   */
  headline: React.ReactNode
  /**
   * The thing you PRESS, on the V's line between the two faces.
   *
   * ⚠ A SECOND SLOT, NOT A PLACE THE HEADLINE MOVES TO. It began as
   * `headlineAt: 'top' | 'between'` — one piece of content, two positions —
   * which could not express the state Ryan asked for next: *"after the reveal
   * the 0-0 score should be up and then under that a countdown until the first
   * game"*. That wants a reading at the top AND a button between the faces, at
   * the same time, and a single slot cannot hold both.
   *
   * ⚠ IT TAKES THE V'S PLACE. Only one of the two is ever drawn — the V says
   * "you against them" while the far corner is still a question mark; the
   * button is how you fill that corner. Both at once stacks a 48px control on
   * a 16px letter.
   *
   * ⚠ NO EFFECT FROM `md` UP, where `.sd-d` already runs face | middle | face
   * and the button simply joins the middle column.
   */
  action?: React.ReactNode
  /**
   * One quiet line under the headline.
   *
   * ⚠ A NODE, NOT A STRING, since 2026-09-02: after the walkout this carries a
   * ticking `Countdown` to the matchweek's first kickoff, which is a component
   * rather than text.
   */
  sub?: React.ReactNode
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
  // ⚠ THESE THREE WERE THE LAST PLACEMENTS LEFT IN globals.css, and they were
  // the ones that broke: the served stylesheet had lost their `top` while the
  // file still declared it, so the label, the V and both names fell back to
  // their static position and stacked on each other at the top of the block.
  // Every phone placement now lives here, which is the point of `M` — one
  // owner, and no piece of this layout can be lost to a stale rebuild.
  sub:   { top: '104px' },
  vee:   { top: '170px' },
  /**
   * The between-the-faces slot — the V's line, sized to hold something bigger.
   *
   * ⚠ IT TRAVELS ON THE FACES' OWN EXPRESSION, character for character, so the
   * two cannot drift: `top` and `height` are copied from `M.face`, which puts
   * this box's centre exactly on the faces' centre at every point of the
   * collapse (open 146+36=182, shut 32+18=50). That is the same mistake the
   * names note above records — a placement in different units from the thing
   * it has to line up with agrees at exactly one viewport and nowhere else.
   *
   * Full width with the content centred, rather than a left/right inset: the
   * faces are inset in PIXELS that shrink with `--p`, so any inset here would
   * have to track them to stay centred. The midpoint of the band is the
   * midpoint of the faces regardless, because they are symmetric.
   */
  mid:   { top: 'calc(146px - 114px * var(--p))',
           height: 'calc(72px - 36px * var(--p))',
           left: 0, right: 0 },
  /**
   * ⚠ EACH NAME SHARES ITS AVATAR'S EDGE, in the same units.
   *
   * They used to sit at `left: 2%` / `right: 2%` with `width: 40%` and centred
   * text, while the faces are placed in PIXELS — so the two only agreed at one
   * viewport width and drifted further apart at every other. On a wide phone
   * the name sat well inside its own avatar.
   *
   * Now the name's outer edge is the avatar's outer edge, `calc()` for `calc()`,
   * and the text is aligned to that edge rather than centred in a box that has
   * nothing to do with the face above it. They cannot drift because they are
   * the same expression.
   */
  whoYou:  { top: '232px', left:  'calc(38px - 22px * var(--p))',
             width: '44%', textAlign: 'left' as const },
  whoThem: { top: '232px', right: 'calc(38px - 22px * var(--p))',
             width: '44%', textAlign: 'right' as const },
} as const

/**
 * The same phone layout with the headline moved down onto the V's line.
 *
 * ⚠ THIS EXISTS BECAUSE MOVING A THING LEAVES A HOLE. Taking the headline out
 * of the top slot — and the sub line with it — empties 54px between the
 * matchweek label and the faces, and a band with a caption, a void, and then
 * the duel reads as broken rather than as spacious. So the duel group moves up
 * to close it and the block gets shorter by exactly the same amount.
 *
 * ⚠ ONLY THE OPEN END MOVES. Every expression here lands on the SAME collapsed
 * value as the layout it replaces — faces 92−60 = 32 exactly as 146−114 = 32,
 * block 266−166 = 100 exactly as 320−220 = 100. The collapsed band is 100px of
 * carefully-tuned geometry (faces 36px at top 32, centre 50, the clock on that
 * same line) and none of it is being renegotiated here; the two layouts differ
 * while open and become identical as they shut.
 *
 * ⚠ AND THE SCROLL DISTANCE NEEDS NO EDIT, because `measure()` reads the band
 * at `--p: 0` and `--p: 1` and divides by the difference. `COLLAPSE_PX` is only
 * the fallback for the frame before that measurement lands. A layout that gives
 * up 166px instead of 220px is welded to the content just as tightly, without a
 * second constant to keep in step.
 *
 * The names carry no `--p` term in either layout — `.sd-who` fades out by
 * `opacity: calc(1 - 3 * var(--p))`, so they are gone before their position
 * could matter.
 */
const M_BETWEEN = {
  block:   { height: 'calc(266px - 166px * var(--p))' },
  /**
   * ⚠ THE SUB MOVES INTO THE SLOT THE HEADLINE VACATED, or it lands ON the
   * headline. At 104px it sat under a headline that started at 50; with the
   * headline now spanning 92–164 that same 104 is straight through the middle
   * of the button — which is exactly what it did on first render: "Picks are
   * open" printed across the top of Replay.
   *
   * It cannot simply be dropped. Before the walkout there is no sub at all
   * (Ryan cut "Your opponent is in"), but AFTER it the band is a duel again and
   * "Picks are open" is the only thing telling you the week is still live.
   */
  sub:     { top: '54px' },
  face:    { top: 'calc(92px - 60px * var(--p))',
             width: 'calc(72px - 36px * var(--p))', height: 'calc(72px - 36px * var(--p))' },
  mid:     { top: 'calc(92px - 60px * var(--p))',
             height: 'calc(72px - 36px * var(--p))', left: 0, right: 0 },
  whoYou:  { top: '178px', left:  'calc(38px - 22px * var(--p))',
             width: '44%', textAlign: 'left' as const },
  whoThem: { top: '178px', right: 'calc(38px - 22px * var(--p))',
             width: '44%', textAlign: 'right' as const },
} as const

const MW_SIZE_D = { fontSize: 'calc(16px - 4px * var(--p))' }

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
  header, matchweek, youEntry, themEntry, name, person, headline, sub, action,
  liveNow = false, strip = [], rank, points,
}: ShowdownBandProps) {
  const bandRef = useRef<HTMLDivElement>(null)
  /**
   * The header row's height, measured — it feeds the spacer, so guessing it
   * would leave a gap or an overlap under the band. AppHeader is `py-3` on a
   * phone and `py-4` from `sm`, so it is not one number.
   */
  const [barH, setBarH] = useState(56)
  /**
   * The band's own height open and shut, MEASURED — one pair per breakpoint.
   *
   * ⚠ These were assumed, and the assumption was the phone's. The spacer
   * reserved `bar + 320` everywhere, but from `md` the duel is a short row
   * (`.sd-m` is display:none and `.sd-d` takes over), so the desktop page sat
   * under ~190px of reserved nothing. The same assumption was in the scroll
   * divisor: a desktop band gives up about 70px, not 220, so the content was
   * outrunning a collapse that finished long before it.
   *
   * Both come from the element now, so a breakpoint the layout gains later
   * needs no numbers added here.
   */
  const [size, setSize] = useState<{ open: number; shut: number } | null>(null)
  // The scroll handler is bound once; a ref is how it reads the current
  // measurement without the effect re-subscribing on every resize.
  const sizeRef = useRef<{ open: number; shut: number } | null>(null)

  useEffect(() => {
    const el = bandRef.current
    if (!el) return
    let frame = 0

    /**
     * The rail offsets from this, so it is the VISIBLE height — arithmetic off
     * `--p`, never a layout read on the scroll path.
     */
    const publish = (p: number, open: number, shut: number) =>
      document.documentElement.style.setProperty(
        '--sd-band-h', `${Math.round(shut + (open - shut) * (1 - p))}px`)

    /**
     * Read the band open and shut in one frame, then restore.
     *
     * ⚠ MEASURED, NOT ASSUMED, AND THAT IS THE FIX. Both numbers were the
     * PHONE's: the spacer reserved `bar + 320` at every width, but from `md`
     * the duel is a short row (`.sd-m` goes display:none and `.sd-d` takes
     * over), so the desktop page sat under ~190px of reserved nothing. The
     * same assumption sat in the scroll divisor — a desktop band gives up far
     * less than 220px, so the content outran a collapse that had already
     * finished.
     *
     * ⚠ Two forced layouts, at mount and on resize ONLY. Never on the scroll
     * path, where a read-after-write every frame is the stall that made the
     * collapse feel like a drawer.
     */
    const measure = () => {
      const before = el.style.getPropertyValue('--p')
      el.style.setProperty('--p', '1')
      const shut = el.getBoundingClientRect().height
      el.style.setProperty('--p', '0')
      const open = el.getBoundingClientRect().height
      el.style.setProperty('--p', before || '0')
      if (open > shut) {
        const next = { open: Math.round(open), shut: Math.round(shut) }
        sizeRef.current = next
        setSize(next)
      }
    }

    const onScroll = () => {
      if (frame) return
      // One write per animation frame, not one per scroll event: a trackpad
      // fires far more of the latter than the screen can show.
      frame = requestAnimationFrame(() => {
        frame = 0
        // ⚠ DIVIDED BY THE HEIGHT IT ACTUALLY LOSES. That equality is what
        // welds the content to the band's bottom edge through the collapse.
        const s = sizeRef.current
        const travel = s ? Math.max(s.open - s.shut, 1) : COLLAPSE_PX
        const p = Math.min(1, Math.max(0, window.scrollY / travel))
        el.style.setProperty('--p', p.toFixed(3))
        if (s) publish(p, s.open, s.shut)
      })
    }

    measure()
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    const ro = new ResizeObserver(() => measure())
    ro.observe(document.documentElement)

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

  /**
   * The phone placements in force. One object, chosen once — so no element can
   * be laid out against a different layout's numbers than its neighbour.
   */
  const L = headline ? M : { ...M, ...M_BETWEEN }

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
    <div style={{ height: size?.open ?? barH + HERO }} aria-hidden="true" />
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
      } as React.CSSProperties}
    >
      {header && <div className="relative z-10" ref={(el) => {
        if (el) setBarH((h: number) => (Math.round(el.offsetHeight) || h))
      }}>{header}</div>}

      {/* ── phone: the pieces travel ─────────────────────────── */}
      <div className="sd-m" style={L.block}>
        <p className="sd-mw t-caption text-white/75" style={L.mw}>Matchweek {matchweek}</p>
        {headline &&
          <p className="sd-big t-num t-num-black text-white" style={L.big}>{headline}</p>}
        {sub && <p className="sd-sub t-detail text-white/45" style={L.sub}>{sub}</p>}
        {liveNow && (
          <p className="sd-sub t-detail" style={L.sub}>
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-danger-500/15 text-danger-500 px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-danger-500 motion-safe:animate-pulse" aria-hidden="true" />
              Live
            </span>
          </p>
        )}

        <Face p={person(youEntry)} colour={youColour} className="sd-face sd-face-you" style={{ ...L.face, ...L.faceL }} />
        {sealed
          ? <Face p={null} colour={themColour} className="sd-face sd-face-them" style={{ ...L.face, ...L.faceR }} unknown />
          : <Face p={person(themEntry!)} colour={themColour} className="sd-face sd-face-them" style={{ ...L.face, ...L.faceR }} />}
        {/* ⚠ THE V AND THE BETWEEN-SLOT ARE THE SAME PLACE, so only one of them
            is ever drawn. The V says "you against them" while the other corner
            is still a question mark; the button says "find out who". Rendering
            both stacks a 48px control on a 16px letter. */}
        {sealed && !action &&
          <p className="sd-vee t-caption text-accent-400 text-base select-none" style={L.vee}>V</p>}
        {action && (
          <div className="absolute grid place-items-center pointer-events-none" style={L.mid}>
            {/* ⚠ Re-enabled on the child. The wrapper spans the full band width
                and would otherwise swallow taps meant for either face. */}
            <div className="pointer-events-auto">{action}</div>
          </div>
        )}

        <div className="sd-who sd-who-you" style={L.whoYou}>
          <p className="t-caption text-white truncate">{name(youEntry)}</p>
          {meta(youEntry) && <p className="t-num text-[10px] text-white/40 mt-0.5">{meta(youEntry)}</p>}
        </div>
        <div className="sd-who sd-who-them" style={L.whoThem}>
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
          {headline && <p className="sd-big-d t-num t-num-black text-white">{headline}</p>}
          {/* ⚠ SAME COLUMN, no second position needed. The desktop row is
              already face | middle | face, so "between the faces" is where this
              column IS — the phone's absolute mid-slot exists only because the
              phone stacks. */}
          {action && <div className="sd-big-d">{action}</div>}
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
