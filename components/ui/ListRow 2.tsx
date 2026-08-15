import { cn } from '@/lib/utils/cn'

/**
 * The row chassis: a surface card at the card radius with the card shadow,
 * sized for a list rather than a page section.
 *
 * This existed as copy-pasted classes in four places — the members cards, the
 * entries list, Everyone's predictions and the match rows — which is how the
 * match rows ended up at a 14px radius while the other three sat at 24px.
 * Anything that should be true of every row belongs here.
 *
 * `className` is merged with tailwind-merge, so a caller passing `rounded-chip`
 * or a different border genuinely replaces the base rather than fighting it on
 * source order.
 */
type ListRowProps<T extends 'div' | 'button'> = {
  /** `button` when the whole row is the control. Defaults to a div. */
  as?: T
  /** Pointer affordances: cursor, hover fill, pressed fill. */
  interactive?: boolean
  /**
   * The viewer's own row. Uses the iOS values from PLATFORM_DIVERGENCES.md —
   * primary at 8% behind a primary-at-25% edge — and drops the shadow, since a
   * tinted row reads as raised on its own.
   */
  selected?: boolean
  /**
   * A 3px left edge, for rows that encode a status in the margin. Pass the
   * border-colour class, e.g. `border-l-success-500`.
   */
  accent?: string
  /** Rows that own their internal padding (sectioned rows) pass false. */
  padded?: boolean
  className?: string
  children: React.ReactNode
} & Omit<React.ComponentPropsWithoutRef<T>, 'className' | 'children'>

export function ListRow<T extends 'div' | 'button' = 'div'>({
  as,
  interactive = false,
  selected = false,
  accent,
  padded = true,
  className,
  children,
  ...rest
}: ListRowProps<T>) {
  const Tag = (as ?? 'div') as 'div'
  return (
    <Tag
      {...(rest as React.ComponentPropsWithoutRef<'div'>)}
      className={cn(
        // The border is always present, transparent by default, so turning a
        // row selected or accented never shifts its size by a pixel.
        'rounded-card border-[1.5px] transition-colors',
        padded && 'p-3.5',
        selected
          ? 'bg-primary-600/8 border-primary-600/25'
          : 'bg-surface border-transparent shadow-card',
        accent && `border-l-[3px] ${accent}`,
        interactive && 'cursor-pointer hover:bg-mist active:bg-silver',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
