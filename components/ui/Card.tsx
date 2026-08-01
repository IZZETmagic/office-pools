import { cn } from '@/lib/utils/cn'

/**
 * The RN card: white `surface` on the `snow` page, a 24px radius, and a shadow so
 * soft it is nearly invisible. The separation comes from the surface/snow value
 * step, not the shadow — deepening it is the most common way to make web stop
 * looking like the app.
 */
type CardProps = {
  children: React.ReactNode
  /**
   * `none` is for content that must reach the card's edge — a table whose rows
   * highlight, for instance. With the default padding a highlighted row stops
   * short of the border on both sides and reads as a floating band rather than
   * a selected row.
   */
  padding?: 'none' | 'md' | 'lg'
  /** Hairline border instead of a shadow, matching Card's `bordered` prop in RN. */
  bordered?: boolean
  className?: string
}

const paddingClasses = {
  none: '',
  md: 'p-6',
  lg: 'p-8',
}

export function Card({ children, padding = 'md', bordered = false, className }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface rounded-card',
        // Shadows read as muddy smears on a dark surface, so dark mode swaps to a
        // hairline — as the app does.
        bordered
          ? 'border border-silver/50'
          : 'shadow-card dark:shadow-none dark:border dark:border-border-default',
        paddingClasses[padding],
        className,
      )}
    >
      {children}
    </div>
  )
}
