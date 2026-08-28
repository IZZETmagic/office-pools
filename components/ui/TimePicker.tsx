'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

/**
 * A time picker in the app's own type and colour, replacing `<input type="time">`.
 *
 * Sibling to `DatePicker` — same trigger styling, same fixed-position panel,
 * same dismissal rules — so a date and a time sitting next to each other look
 * like one control split in two rather than two unrelated widgets.
 *
 * ## The value is `HH:MM` in 24-hour, and stays that way
 *
 * That is what `<input type="time">` produced and what every caller already
 * recombines with a date. The 12-hour AM/PM face is presentation only; nothing
 * outside this file sees it.
 *
 * ## ⚠ THE PANEL IS PORTALLED, AND IT HAS TO BE
 *
 * `position: fixed` is viewport-relative ONLY while no ancestor has a
 * transform, filter or perspective — any of those makes the ancestor the
 * containing block instead. This renders inside a modal whose panel animates
 * with `modal-scale-in` and whose step wrapper animates with `step-slide-left`,
 * and BOTH leave `transform: matrix(1, 0, 0, 1, 0, 0)` on the element. An
 * identity matrix is still a transform, so `fixed` anchored to the modal:
 * measured `left: 346px` (correct, the trigger is at 346) and rendered at 675.
 *
 * `createPortal` to `document.body` puts the panel outside both, so the
 * coordinates mean what they say. `ActionMenu` records this hazard but never
 * meets it — it is used in tables, not in an animated dialog.
 *
 * ## ⚠ Off-grid minutes are kept, not rounded away
 *
 * The minute column steps in fives, which is plenty for a deadline. But a value
 * can arrive from anywhere — an older row, a script, a season imported with a
 * 13:07 kickoff — and a picker that silently rounded 13:07 to 13:05 would edit
 * data the moment somebody opened it to change something else. So the current
 * minute is spliced into the column if it is not already there.
 */

type Props = {
  /** `HH:MM`, 24-hour. */
  value: string
  onChange: (value: string) => void
  /** Labels the trigger for assistive tech, e.g. "Deadline time". */
  ariaLabel?: string
  className?: string
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1)   // 12, 1..11 reordered below
const MINUTE_STEP = 5

const pad = (n: number) => String(n).padStart(2, '0')

/** `HH:MM` -> `{ h, m }` in 24-hour. Split, never parsed as a Date. */
function parts(value: string): { h: number; m: number } {
  const p = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!p) return { h: 13, m: 0 }
  const h = Math.min(23, Math.max(0, +p[1]))
  const m = Math.min(59, Math.max(0, +p[2]))
  return { h, m }
}

const to24 = (h12: number, meridiem: 'AM' | 'PM') =>
  meridiem === 'AM' ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12)

function label12(h: number, m: number) {
  const mer = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${pad(m)} ${mer}`
}

export function TimePicker({ value, onChange, ariaLabel, className }: Props) {
  const { h, m } = parts(value)
  const meridiem: 'AM' | 'PM' = h < 12 ? 'AM' : 'PM'
  const hour12 = h % 12 === 0 ? 12 : h % 12

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const PANEL_W = 232
    const PANEL_H = 260
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const below = r.bottom + 6
    const top = below + PANEL_H > vh ? Math.max(8, r.top - PANEL_H - 6) : below
    setPos({ top, left: Math.min(Math.max(8, r.left), Math.max(8, vw - PANEL_W - 8)) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
    }
    // Anchored to a rect captured at open time, so a scroll would detach it —
    // but ONLY a scroll that moves the trigger. ⚠ This listener is capture-phase
    // on `window`, so it also sees scrolls INSIDE this panel: without the
    // containment check, spinning the wheel over the hour column closed the very
    // panel being used. A scroll originating in the panel moves nothing the
    // panel is anchored to, so it is ignored.
    const onReflow = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open])

  // 12 first, so the column reads 12, 1, 2 … the way a clock face does.
  const hours = [12, ...HOURS_12.filter((n) => n !== 12)]
  // ⚠ The splice that stops the picker editing data it was only asked to show.
  const minutes = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP)
  const minuteOptions = minutes.includes(m) ? minutes : [...minutes, m].sort((a, b) => a - b)

  const commit = (next: { h12?: number; min?: number; mer?: 'AM' | 'PM' }) => {
    const h12 = next.h12 ?? hour12
    const mer = next.mer ?? meridiem
    const min = next.min ?? m
    onChange(`${pad(to24(h12, mer))}:${pad(min)}`)
  }

  const columnItem = (active: boolean) =>
    `w-full py-1.5 rounded-chip t-num t-num-medium text-[13px] transition-colors
     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40
     ${active ? 'bg-primary-600 text-white' : 'text-ink hover:bg-mist'}`

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 px-4 py-3 rounded-control bg-mist text-ink
          t-body border border-transparent transition-colors hover:bg-silver
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40
          ${className ?? ''}`}
      >
        <Icon name="clock" size={15} className="text-muted shrink-0" />
        <span>{label12(h, m)}</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={ariaLabel ?? 'Choose a time'}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 60, width: 232 }}
          className="p-2 bg-surface rounded-card shadow-card-elevated border border-border-default"
        >
          <div className="flex gap-1.5">
            {/* Hour and minute scroll; the meridiem is two buttons, because a
                two-item scroller is worse than two buttons at every size. */}
            {/* ⚠ `overscroll-contain` is the fix for "the page scrolls instead
                of the options". Without it the column chains its scroll to the
                document the moment it reaches either end, so the list stops and
                the page behind the modal starts moving instead. */}
            <div className="flex-1 max-h-52 overflow-y-auto overscroll-contain pr-0.5" role="listbox" aria-label="Hour">
              {hours.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="option"
                  aria-selected={n === hour12}
                  onClick={() => commit({ h12: n })}
                  className={columnItem(n === hour12)}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="flex-1 max-h-52 overflow-y-auto overscroll-contain pr-0.5" role="listbox" aria-label="Minute">
              {minuteOptions.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="option"
                  aria-selected={n === m}
                  onClick={() => commit({ min: n })}
                  className={columnItem(n === m)}
                >
                  {pad(n)}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1 w-14">
              {(['AM', 'PM'] as const).map((mer) => (
                <button
                  key={mer}
                  type="button"
                  aria-pressed={mer === meridiem}
                  onClick={() => commit({ mer })}
                  className={columnItem(mer === meridiem)}
                >
                  {mer}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => { setOpen(false); triggerRef.current?.focus() }}
            className="mt-2 w-full py-2 rounded-chip t-body text-primary-700 hover:bg-mist transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40"
          >
            Done
          </button>
        </div>,
        document.body,
      )}
    </>
  )
}
