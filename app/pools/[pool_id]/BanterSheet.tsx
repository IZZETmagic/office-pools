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
   * The slice of screen the keyboard has left.
   *
   * ⚠ `top` STAYS 0. The pan is corrected by moving the PAGE (see the lock
   * effect), not the sheet — the body is fixed, so nudging its `top` by the pan
   * brings everything back into view at once. Compensating here as well is how
   * the sheet ended up moving twice and leaving the screen faster.
   */
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)

  /**
   * Lock the page, and counteract iOS Safari's visual-viewport pan.
   *
   * ⚠ THIS IS `CommunityTab`'s SOLUTION, NOT A NEW ONE. That component has
   * carried it since the tab was built, with a comment describing Ryan's exact
   * symptom: focusing the composer makes Safari slide the visual viewport up to
   * clear the keyboard, it takes fixed chrome off screen with it, and it does
   * not slide back. I spent four attempts rediscovering that badly — moving the
   * SHEET by `offsetTop` — when the fix is to move the PAGE.
   *
   * `document.body` is fixed, so nudging its `top` by the pan puts everything
   * back where the user can see it, the sheet included. Chrome reaches the same
   * place on its own (`interactiveWidget=resizes-content` keeps `offsetTop` at
   * 0, making this a no-op there).
   *
   * ⚠ `offsetTop - y`, not CommunityTab's plain `offsetTop`: it scrolls to the
   * top first and accepts losing your place, which is fine for a tab that
   * replaces the page. A sheet must give the page back exactly as it was, so
   * the lock keeps `-y` and the pan is added to it.
   */
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    const y = window.scrollY
    const b = document.body.style
    const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow }

    /**
     * ⚠ SCROLL TO 0 FIRST, exactly as CommunityTab does.
     *
     * My previous version kept the page's scroll offset in the lock — `top:
     * -y` — and added the pan to it. It worked once, and only by coincidence:
     * the pan was 347 and the scroll was 347, so they cancelled to `top: 0`.
     * At any other scroll position that arithmetic displaces the body by
     * hundreds of pixels before Safari has even panned, and the sheet leaves
     * the screen again.
     *
     * The proven version pins the page at zero and then applies the pan alone,
     * so `top` only ever holds ONE quantity. The scroll position is remembered
     * here and restored on close, which is the only thing CommunityTab does not
     * need to do — it replaces the page, this covers it.
     *
     * ⚠ Behind a full-screen scrim, scrolling to 0 is invisible.
     */
    window.scrollTo(0, 0)
    b.overflow = 'hidden'
    b.position = 'fixed'
    b.width = '100%'
    b.top = '0px'

    let raf = 0
    const sync = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // ONE quantity: the pan. Nothing else lives in `top`.
        b.top = `${vv ? vv.offsetTop : 0}px`
        setBox({ top: 0, height: vv ? vv.height : window.innerHeight })
      })
    }
    sync()
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)

    return () => {
      cancelAnimationFrame(raf)
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
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
        <div
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
