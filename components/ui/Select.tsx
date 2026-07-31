import { Children, isValidElement } from 'react'

import { cn } from '@/lib/utils/cn'
import { Icon } from './Icon'

/**
 * Dropdown, styled to match Input: filled with `mist`, an 18px radius, and no
 * resting border — the focus ring is the only stroke.
 *
 * Still a native <select> underneath. It keeps the platform picker on mobile,
 * keyboard behaviour and screen-reader semantics for free, which a div-based
 * listbox would all have to reimplement. `appearance-none` only removes the OS
 * chevron so we can draw our own.
 *
 * WIDTH: sized to its longest option, not its current one. A native select left
 * to itself is sized by the browser from the selected value, so the control —
 * and everything laid out beside it — resizes as the user changes the filter.
 * An invisible sizer holding the longest label shares a single grid cell with
 * the select, so the cell is always as wide as the widest choice and the layout
 * never shifts.
 */
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  focusColor?: 'blue' | 'green'
  /** Fill the container rather than sizing to the longest option. */
  fullWidth?: boolean
}

const focusClasses = {
  blue: 'focus:border-primary-600 focus:ring-primary-600/20',
  green: 'focus:border-success-600 focus:ring-success-600/20',
}

/** Longest option label among the children, used to size the control. */
function longestOptionLabel(children: React.ReactNode): string {
  let longest = ''
  // toArray flattens nested arrays, so options produced by .map() are included.
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue
    const label = (child.props as { children?: React.ReactNode }).children
    if (typeof label === 'string' && label.length > longest.length) longest = label
  }
  return longest
}

export function Select({
  focusColor = 'blue',
  fullWidth = false,
  className,
  children,
  ...props
}: SelectProps) {
  const sizer = longestOptionLabel(children)

  return (
    <div className={cn('relative inline-grid', fullWidth && 'w-full')}>
      <select
        {...props}
        className={cn(
          'col-start-1 row-start-1 w-full appearance-none pl-4 pr-10 py-3 rounded-control bg-mist text-ink',
          'text-sm font-semibold cursor-pointer',
          'border border-transparent focus:outline-none focus:ring-2 transition-colors',
          focusClasses[focusColor],
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        )}
      >
        {children}
      </select>

      {/* Sizer — same box model and type as the select, never shown, never read.
          Skipped when fullWidth, where the container dictates the width. */}
      {!fullWidth && sizer ? (
        <span
          aria-hidden="true"
          className="col-start-1 row-start-1 invisible pointer-events-none pl-4 pr-10 py-3 text-sm font-semibold whitespace-nowrap"
        >
          {sizer}
        </span>
      ) : null}

      {/* Full-height flex column rather than `top-1/2 -translate-y-1/2`. Centring an
          icon with a transform depends on the transform actually composing, and when
          it doesn't the chevron drops out of place — it is also one more thing that
          has to survive whatever the icon renderer does with className. A flex box
          spanning inset-y-0 centres it with no transform involved. */}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <Icon name="chevron.down" size={14} weight="bold" className="text-muted" />
      </span>
    </div>
  )
}
