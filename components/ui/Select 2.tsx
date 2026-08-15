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
 * An invisible sizer holding the longest label shares one grid cell with the
 * select, so the cell is always as wide as the widest choice.
 *
 * The structural properties — the grid, the shared cell, the chevron's position
 * — are INLINE STYLES on purpose. Tailwind only emits classes it finds when it
 * scans, so a utility used in exactly one new file can be missing from the
 * served stylesheet until the dev server restarts, and this component then
 * silently loses both its width and its chevron placement. Colour and type stay
 * as classes because those fail visibly and harmlessly; layout does not.
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

// Shared box model: the sizer must match the select exactly or the width is wrong.
const BOX: React.CSSProperties = {
  paddingTop: 12,
  paddingBottom: 12,
  paddingLeft: 16,
  paddingRight: 40,
  fontSize: 14,
  fontWeight: 600,
  lineHeight: '20px',
}

export function Select({
  focusColor = 'blue',
  fullWidth = false,
  className,
  children,
  ...props
}: SelectProps) {
  const sizer = longestOptionLabel(children)
  const useSizer = !fullWidth && sizer.length > 0

  return (
    <span
      style={{
        position: 'relative',
        display: fullWidth ? 'block' : 'inline-grid',
        width: fullWidth ? '100%' : undefined,
      }}
    >
      <select
        {...props}
        style={{ ...BOX, gridArea: '1 / 1', width: '100%', appearance: 'none' }}
        className={cn(
          'rounded-control bg-mist text-ink cursor-pointer',
          'border border-transparent focus:outline-none focus:ring-2 transition-colors',
          focusClasses[focusColor],
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        )}
      >
        {children}
      </select>

      {/* Sizer — same box model and type as the select, never shown, never read. */}
      {useSizer ? (
        <span
          aria-hidden="true"
          style={{
            ...BOX,
            gridArea: '1 / 1',
            visibility: 'hidden',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {sizer}
        </span>
      ) : null}

      <span
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <Icon name="chevron.down" size={14} weight="bold" className="text-muted" />
      </span>
    </span>
  )
}
