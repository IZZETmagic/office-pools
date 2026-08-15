'use client'

import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/ui/Icon'

/**
 * A small (i) that opens a short explanation next to whatever it labels.
 *
 * Click rather than hover: the scoring form is used on phones as much as on a
 * desktop, and a hover-only tooltip is unreachable there. Closes on outside
 * click, on Escape, and on scroll — it is absolutely positioned against its own
 * wrapper, so letting it ride along while the card scrolls would leave it
 * pointing at nothing.
 */
export function InfoPopover({
  title,
  body,
  align = 'left',
}: {
  title: string
  body: string
  /** Which edge the panel is pinned to. Use `right` near the end of a row. */
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // capture: the scroller is an ancestor, and scroll does not bubble.
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <span ref={wrapRef} className="relative inline-flex shrink-0 align-middle">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`What is ${title}?`}
        className="inline-flex items-center justify-center text-muted hover:text-primary-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 rounded-pill"
      >
        <Icon name="info.circle.fill" size={14} />
      </button>

      {open && (
        <span
          role="tooltip"
          className={`absolute top-full mt-1.5 z-30 w-64 rounded-chip bg-ink p-3 text-surface shadow-card-elevated ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <span className="block t-body font-bold mb-1">{title}</span>
          <span className="block text-[11px] leading-relaxed text-surface/80">{body}</span>
        </span>
      )}
    </span>
  )
}
