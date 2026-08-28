'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

/**
 * A calendar in the app's own type and colour, replacing `<input type="date">`.
 *
 * The native control is the one thing on the create-pool screen drawn entirely
 * by the browser: Chrome's own greys, its own type, its own focus ring, and a
 * panel that ignores dark mode completely. Beside a form built from `bg-mist`,
 * `rounded-control` and Nunito it reads as somebody else's component.
 *
 * ## ⚠ NEVER PARSE THE VALUE WITH `new Date(value)`
 *
 * The value is a plain `YYYY-MM-DD`, and JavaScript parses that as **UTC**. So
 * `new Date('2026-08-21')` is 20:00 on the 20th anywhere west of Greenwich, and
 * a calendar built from it highlights the wrong day, in the wrong month at a
 * boundary. That exact defect has been fixed three times in this codebase in a
 * single day — in `formatMonthYear`, in `quickDeadlineLabel`, and in
 * SettingsTab's deadline fields.
 *
 * So this component never constructs a Date from the string. It splits it into
 * three integers and does the arithmetic on those; `Date` is used only where a
 * real calendar computation is unavoidable (what weekday a month starts on),
 * always via `new Date(y, m, d)`, which is local by definition and cannot drift.
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
 * The position itself is `fixed`, computed from the trigger's rect, for the
 * reason `ActionMenu` gives: this sits inside a modal body that is
 * `overflow-y-auto`, and an absolutely-positioned panel is clipped by it.
 */

type Props = {
  /** `YYYY-MM-DD`, or '' for no selection. */
  value: string
  onChange: (value: string) => void
  /** Earliest selectable day, `YYYY-MM-DD`. Days before it are not clickable. */
  min?: string
  /** Labels the trigger for assistive tech, e.g. "Deadline date". */
  ariaLabel?: string
  className?: string
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** `YYYY-MM-DD` -> `{ y, m, d }` with m zero-based. No `Date`, so no UTC shift. */
function parts(value: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  return { y: +m[1], m: +m[2] - 1, d: +m[3] }
}

const pad = (n: number) => String(n).padStart(2, '0')
const toValue = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

/** Today, from the LOCAL clock — never `toISOString`, which is UTC. */
function todayParts() {
  const n = new Date()
  return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() }
}

export function DatePicker({ value, onChange, min, ariaLabel, className }: Props) {
  const selected = parts(value)
  const today = todayParts()

  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  // Which month the grid is showing. Starts on the selection, or today.
  const [view, setView] = useState(() => ({
    y: selected?.y ?? today.y,
    m: selected?.m ?? today.m,
  }))

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  // Re-open on the selected month rather than wherever the user last browsed to.
  useEffect(() => {
    if (open) setView({ y: selected?.y ?? today.y, m: selected?.m ?? today.m })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const PANEL_W = 280
    const PANEL_H = 340
    // clientWidth, not innerWidth — innerWidth includes the scrollbar and
    // overshoots, which is the bug ActionMenu records.
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    // Flip above the trigger when there is no room below, and never let the
    // panel run off the right edge on a phone.
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

  // `new Date(y, m, d)` is LOCAL — the safe constructor. Day 0 of the next
  // month is the last day of this one.
  const firstWeekday = new Date(view.y, view.m, 1).getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()

  const minP = min ? parts(min) : null
  const beforeMin = (d: number) =>
    !!minP && (view.y < minP.y
      || (view.y === minP.y && view.m < minP.m)
      || (view.y === minP.y && view.m === minP.m && d < minP.d))

  const shift = (months: number) => {
    const t = view.m + months
    setView({ y: view.y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 })
  }

  const label = selected
    ? `${MONTHS[selected.m].slice(0, 3)} ${selected.d}, ${selected.y}`
    : 'Pick a date'

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
        <Icon name="calendar" size={15} className="text-muted shrink-0" />
        <span className={selected ? '' : 'text-muted'}>{label}</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={ariaLabel ?? 'Choose a date'}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 60, width: 280 }}
          className="p-3 bg-surface rounded-card shadow-card-elevated border border-border-default"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label="Previous month"
              className="w-8 h-8 grid place-items-center rounded-chip text-muted hover:bg-mist hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40"
            >
              <Icon name="chevron.left" size={13} weight="semibold" />
            </button>
            <p className="t-card-title text-ink">{MONTHS[view.m]} {view.y}</p>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label="Next month"
              className="w-8 h-8 grid place-items-center rounded-chip text-muted hover:bg-mist hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40"
            >
              <Icon name="chevron.right" size={13} weight="semibold" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="h-7 grid place-items-center t-detail text-muted uppercase tracking-wider">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-0.5">
            {/* Leading blanks rather than the previous month's days: they are not
                selectable here, and printing them invites a click that does
                nothing. */}
            {Array.from({ length: firstWeekday }, (_, i) => <div key={`b${i}`} />)}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
              const isSelected = !!selected && selected.y === view.y && selected.m === view.m && selected.d === d
              const isToday = today.y === view.y && today.m === view.m && today.d === d
              const disabled = beforeMin(d)
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  aria-pressed={isSelected}
                  aria-label={`${MONTHS[view.m]} ${d}, ${view.y}`}
                  onClick={() => { onChange(toValue(view.y, view.m, d)); setOpen(false); triggerRef.current?.focus() }}
                  className={`h-9 grid place-items-center rounded-chip t-num t-num-medium text-[13px] transition-colors
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40
                    ${disabled
                      ? 'text-muted/40 cursor-not-allowed'
                      : isSelected
                        ? 'bg-primary-600 text-white'
                        : isToday
                          ? 'text-primary-700 bg-primary-600/10 hover:bg-primary-600/20'
                          : 'text-ink hover:bg-mist'}`}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
