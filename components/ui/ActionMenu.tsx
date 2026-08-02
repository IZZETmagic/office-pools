'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

/**
 * A button that opens a list of actions.
 *
 * This exists because the actions it replaces were `<select>` elements. A select
 * is a *value picker* — it reports a chosen value and keeps showing it. These
 * menus never had a value: every consumer set `defaultValue=""`, ran a switch in
 * `onChange`, then immediately reset `e.target.value = ''` to un-choose it. That
 * works, but the browser draws it as a form control, which is why it rendered as
 * an unstyled native dropdown among branded components, and it announces itself
 * to a screen reader as a combobox with a value rather than as a menu.
 *
 * Positioning is `fixed`, computed from the trigger's rect, rather than an
 * absolutely-positioned child. The members table lives inside an
 * `overflow-x-auto` wrapper, and an absolute popover is clipped by it — a menu
 * that opens on the last row would be cut off. `fixed` escapes scroll clipping.
 * It does NOT escape a transformed ancestor, so if this is ever placed inside
 * one, the menu will anchor to that instead and this comment is the clue.
 *
 * Items are `block`, and that is load-bearing rather than decorative. A
 * <button> is inline-block by default, and `w-full` on an inline-block inside
 * this width-less fixed panel gives the percentage nothing definite to resolve
 * against; the browser falls back toward the available space — viewport minus
 * the `right` offset — so the menu rendered ~393px wide for labels needing
 * ~130px. As a block child, `w-full` is treated as auto while the panel sizes
 * itself, and the panel collapses onto its `min-w-44` floor. Setting
 * `width: max-content` on the panel does NOT fix it; the cycle is in the child.
 */

export type ActionMenuItem = {
  key: string
  label: string
  onSelect: () => void
  /** Destructive actions are tinted and pushed below a rule. */
  destructive?: boolean
  disabled?: boolean
}

type Props = {
  items: ActionMenuItem[]
  /** Trigger text. Kept short — the column is narrow. */
  label?: string
  className?: string
}

export function ActionMenu({ items, label = 'Actions', className }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    // clientWidth, not innerWidth: innerWidth includes the vertical scrollbar
    // while getBoundingClientRect does not, so innerWidth overshoots by the
    // scrollbar width and the menu sits ~15px left of the trigger it belongs to.
    const viewportWidth = document.documentElement.clientWidth
    setPos({ top: r.bottom + 6, right: Math.max(8, viewportWidth - r.right) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
    }
    // Close on scroll/resize rather than chase the trigger: the menu is anchored
    // to a rect captured at open time, so leaving it open would detach it.
    const onReflow = () => setOpen(false)
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

  const enabled = items.filter((i) => !i.disabled)
  if (enabled.length === 0) return null

  const ordinary = enabled.filter((i) => !i.destructive)
  const destructive = enabled.filter((i) => i.destructive)

  const renderItem = (item: ActionMenuItem) => (
    <button
      key={item.key}
      role="menuitem"
      type="button"
      onClick={() => { setOpen(false); item.onSelect() }}
      className={`block w-full text-left px-3 py-2 text-sm rounded-chip transition-colors ${
        item.destructive
          ? 'text-danger-800 hover:bg-danger-600/20'
          : 'text-ink hover:bg-mist'
      }`}
    >
      {item.label}
    </button>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-control
          border border-border-default bg-surface text-ink hover:bg-mist transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 ${className ?? ''}`}
      >
        {label}
        <Icon name="chevron.down" size={12} weight="semibold" className="shrink-0" />
      </button>

      {open && pos && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 60 }}
          className="min-w-44 p-1.5 bg-surface rounded-card shadow-card-elevated
            dark:shadow-none dark:border dark:border-border-default"
        >
          {ordinary.map(renderItem)}
          {destructive.length > 0 && ordinary.length > 0 && (
            <div className="my-1.5 h-px bg-border-subtle" />
          )}
          {destructive.map(renderItem)}
        </div>
      )}
    </>
  )
}
