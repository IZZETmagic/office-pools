'use client'

// =============================================================
// THE BANTER SHEET — banter over the pool, not instead of it
// =============================================================
// Plan: drafts/2026-09-01_showdown_banter_plan.md, slice 2.
//
// The one-page Showdown has no tab strip, so banter needed a new home. It
// takes the shape React Native already uses — `BanterSheet.tsx` there, opened
// by a floating button — because a sheet was the right answer on a phone for
// the same reason it is the right answer here: the pool is the page, and
// banter is something you open on top of it and dismiss.
//
// ## ⚠ WHY NOT THE APP'S `Modal`
//
// The plan said reuse it and slice 0 said otherwise. `Modal` sizes itself from
// the LAYOUT viewport, whose bottom on iOS sits underneath the keyboard — the
// exact problem this surface exists to avoid. A chat is the one sheet in the
// app that must be keyboard-aware, so it gets ~90 lines that know how, rather
// than a shared component bent until it does.
//
// ## ⚠ THE HEIGHT, AND NOTHING ELSE
//
// Measured on Ryan's iPhone, three placements tried:
//
//   transform: translateY(visualViewport.offsetTop)   gap beneath the composer
//   top:       visualViewport.offsetTop               gap beneath the composer
//   none:      no offset at all                       FLUSH
//
// iOS ALREADY shifts `position: fixed` with the visual viewport. Applying
// `offsetTop` double-counts a correction the browser has made for you. So the
// only thing read here is `height` — the instinct to use `offsetTop` because
// it comes back non-zero is exactly the trap.
//
// ## ⚠ WHAT IT DOES NOT DO
//
// It does not touch `document.body`. `CommunityTab`'s tab mode pins the body to
// become a full screen, and the Showdown band's collapse is driven by
// `window.scrollY` — a pinned body freezes the band open. `embedded` is what
// switches that off; this component is why it exists.
// =============================================================

import { useEffect, useRef, useState } from 'react'

import { CommunityTab } from './community/CommunityTab'
import type { CommunityTabProps } from './community/types'

export function BanterSheet({
  open,
  onClose,
  ...community
}: { open: boolean; onClose: () => void } & Omit<CommunityTabProps, 'embedded'>) {
  /**
   * Where the visible viewport IS, and how tall it is.
   *
   * ⚠ BOTH ARE NEEDED, and the prototype said otherwise for a reason worth
   * recording. There, `offsetTop` made things worse and `none` was flush —
   * because that page could still SCROLL, so iOS satisfied the focused input by
   * scrolling the document, leaving the visual viewport at offset 0.
   *
   * This sheet locks the page, so iOS cannot scroll it. It PANS the visual
   * viewport instead, `offsetTop` goes positive, and a `position: fixed`
   * element painted against the layout viewport rides straight up out of sight.
   * That is Ryan's "it shoots up off screen".
   *
   * So the answer flipped when the page stopped scrolling. The prototype was
   * right about the page it was testing and wrong about this one.
   */
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)
  /**
   * ⚠ TEMPORARY, behind `?banterdebug=1`. The sheet came out wrong on an
   * iPhone 17 Plus — composer at the top of the screen with the page showing
   * through — and reading the code produced three plausible causes and no way
   * to choose between them. Numbers from the device settle it in one look,
   * which is how the placement question got answered. Remove once it is fixed.
   */
  const panelRef = useRef<HTMLDivElement>(null)
  const [debug, setDebug] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    // ⚠ HEIGHT ONLY. See the header: `offsetTop` is a correction iOS has
    // already applied to fixed elements, and applying it again is the gap.
    const on = typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('banterdebug') === '1'
    const fit = () => {
      setBox(vv
        ? { top: vv.offsetTop, height: vv.height }
        : { top: 0, height: window.innerHeight })
      if (!on) return
      const p = panelRef.current?.getBoundingClientRect()
      setDebug(
        `innerHeight   ${window.innerHeight}\n` +
        `vv.height     ${vv ? Math.round(vv.height) : 'n/a'}\n` +
        `vv.offsetTop  ${vv ? Math.round(vv.offsetTop) : 'n/a'}\n` +
        `vv.pageTop    ${vv ? Math.round(vv.pageTop) : 'n/a'}\n` +
        `scrollY       ${Math.round(window.scrollY)}\n` +
        `panel         ${p ? `${p.top.toFixed(0)}..${p.bottom.toFixed(0)} h${p.height.toFixed(0)}` : 'n/a'}\n` +
        `body.top      ${document.body.style.top || '—'}`,
      )
    }
    fit()
    const t = setInterval(fit, 250)
    if (!on) clearInterval(t)
    vv?.addEventListener('resize', fit)
    vv?.addEventListener('scroll', fit)
    window.addEventListener('resize', fit)
    return () => {
      clearInterval(t)
      vv?.removeEventListener('resize', fit)
      vv?.removeEventListener('scroll', fit)
      window.removeEventListener('resize', fit)
    }
  }, [open])

  /**
   * ⚠ THE PAGE IS FROZEN WHILE THE SHEET IS OPEN — and I argued against this.
   *
   * iOS scrolls the document to bring a focused input into view. The sheet is
   * `position: fixed`, which is anchored to the LAYOUT viewport, so that scroll
   * takes the sheet with it — straight off the top of the screen the instant
   * the keyboard appears. Ryan: "it does pop up, but as soon as I open the
   * keyboard it goes off screen." No amount of `visualViewport` arithmetic
   * fixes that, because the thing moving is the page underneath.
   *
   * ⚠ I RULED THIS OUT FOR THE WRONG REASON. The plan rejected pinning the body
   * because it freezes the band's scroll-driven collapse — true, and the whole
   * point of `embedded`. But that objection is about the band being WATCHED
   * while pinned. Here the band is behind a full-screen scrim for exactly as
   * long as the lock lasts, and the moment the sheet closes the scroll position
   * is restored and the band resumes. A page-level concern applied to a moment
   * when the page is not visible.
   *
   * What `embedded` still buys is that CommunityTab does not do this ITSELF,
   * on its own schedule, for the whole time the tab is mounted.
   *
   * ⚠ `top: -y` rather than `scrollTo(0,0)`: the page must not visibly jump to
   * the top behind the scrim, and the position has to come back exactly.
   */
  useEffect(() => {
    if (!open) return
    const y = window.scrollY
    const b = document.body.style
    const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow }
    b.position = 'fixed'
    b.top = `-${y}px`
    b.width = '100%'
    b.overflow = 'hidden'
    return () => {
      b.position = prev.position
      b.top = prev.top
      b.width = prev.width
      b.overflow = prev.overflow
      window.scrollTo(0, y)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* The scrim tracks the visible area as well — pinned to `inset-0` it
          would sit over the layout viewport and leave a bright strip beside the
          sheet once the visual viewport pans. */}
      <div
        className="fixed inset-x-0 z-40 bg-black/50"
        style={box ? { top: box.top, height: box.height } : { top: 0, bottom: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* ⚠ Placed and sized from the VISUAL viewport, never `bottom-0`: the
          layout viewport's bottom sits underneath the keyboard on iOS. This box
          is the part of the screen the keyboard has left, wherever that is. */}
      <div
        className="fixed inset-x-0 z-40 flex flex-col justify-end pointer-events-none"
        /* ⚠ `top` from the visual viewport, NOT a transform — a transform
           would make this a containing block for everything inside it, and the
           chat has its own positioned descendants. */
        style={box
          ? { top: box.top, height: box.height }
          : { top: 0, height: '100dvh' }}
        role="dialog"
        aria-modal="true"
        aria-label="Banter"
      >
        {debug && (
          <div className="pointer-events-none absolute left-2 top-2 z-50 rounded-lg
                          bg-black/85 px-2.5 py-2 font-mono text-[11px] leading-snug
                          text-emerald-300 whitespace-pre">
            {debug}
          </div>
        )}
        <div
          ref={panelRef}
          className="pointer-events-auto flex flex-col min-h-0 max-h-full
                     bg-surface rounded-t-sheet border-t border-border-default
                     shadow-xl overflow-hidden"
          style={{ minHeight: '65%' }}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-default shrink-0">
            <h2 className="t-caption text-muted">Banter</h2>
            <button
              type="button"
              onClick={onClose}
              className="t-caption text-primary-600 hover:text-primary-700 px-2 py-1 rounded-control"
            >
              Close
            </button>
          </div>

          {/* ⚠ `embedded` — the sheet owns the height, so CommunityTab must not
              try to own the document. Without it this mounts a component that
              pins `document.body` and takes the band's scroll away with it. */}
          <div className="flex-1 min-h-0 flex flex-col">
            <CommunityTab embedded {...community} />
          </div>
        </div>
      </div>
    </>
  )
}
