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

import { useEffect, useState } from 'react'

import { CommunityTab } from './community/CommunityTab'
import type { CommunityTabProps } from './community/types'

export function BanterSheet({
  open,
  onClose,
  ...community
}: { open: boolean; onClose: () => void } & Omit<CommunityTabProps, 'embedded'>) {
  /** The visible viewport height. Null until measured, so nothing renders wrong once. */
  const [visibleH, setVisibleH] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    // ⚠ HEIGHT ONLY. See the header: `offsetTop` is a correction iOS has
    // already applied to fixed elements, and applying it again is the gap.
    const fit = () => setVisibleH(vv ? vv.height : window.innerHeight)
    fit()
    vv?.addEventListener('resize', fit)
    vv?.addEventListener('scroll', fit)
    window.addEventListener('resize', fit)
    return () => {
      vv?.removeEventListener('resize', fit)
      vv?.removeEventListener('scroll', fit)
      window.removeEventListener('resize', fit)
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
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* ⚠ `top-0` with a measured height, NOT `bottom-0`. The layout
          viewport's bottom is underneath the keyboard on iOS; this box is the
          part of the screen the keyboard has left. */}
      <div
        className="fixed inset-x-0 top-0 z-40 flex flex-col justify-end pointer-events-none"
        style={{ height: visibleH ?? '100dvh' }}
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
