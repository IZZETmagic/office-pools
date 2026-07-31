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
 */
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  focusColor?: 'blue' | 'green'
  /** Fill the container rather than sizing to content. */
  fullWidth?: boolean
}

const focusClasses = {
  blue: 'focus:border-primary-600 focus:ring-primary-600/20',
  green: 'focus:border-success-600 focus:ring-success-600/20',
}

export function Select({
  focusColor = 'blue',
  fullWidth = false,
  className,
  children,
  ...props
}: SelectProps) {
  return (
    <div className={cn('relative', fullWidth ? 'w-full' : 'inline-block')}>
      <select
        {...props}
        className={cn(
          'appearance-none w-full pl-4 pr-10 py-3 rounded-control bg-mist text-ink',
          'text-sm font-semibold cursor-pointer',
          'border border-transparent focus:outline-none focus:ring-2 transition-colors',
          focusClasses[focusColor],
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        )}
      >
        {children}
      </select>
      <Icon
        name="chevron.down"
        size={14}
        weight="bold"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  )
}
