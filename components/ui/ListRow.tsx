import { cn } from '@/lib/utils/cn'

/**
 * The chassis behind every list row in the app — leaderboard entries, pool list
 * items, member rows: a `surface` card at a 24px radius with 14px padding, 12px
 * gaps and the near-invisible card shadow.
 *
 * `highlighted` is the "this row is you" treatment. The values are the iOS ones
 * (primary at 8%, a 1.5px primary border at 25%); mobile/PLATFORM_DIVERGENCES.md
 * records that Android drifted to different values, and iOS is the intended design.
 */
type ListRowProps = {
  children: React.ReactNode
  highlighted?: boolean
  /** Renders a <button> and wires press feedback. Omit for a static row. */
  onClick?: () => void
  className?: string
}

export function ListRow({ children, highlighted = false, onClick, className }: ListRowProps) {
  const classes = cn(
    'w-full flex items-center gap-3 p-3.5 rounded-card text-left',
    highlighted
      ? 'bg-primary-600/8 border-[1.5px] border-primary-600/25'
      : 'bg-surface shadow-card dark:shadow-none dark:border dark:border-border-default',
    onClick && 'transition-opacity active:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40',
    className,
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {children}
      </button>
    )
  }

  return <div className={classes}>{children}</div>
}
