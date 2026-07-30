import { cn } from '@/lib/utils/cn'
import { Icon } from './Icon'

/**
 * The app's empty state: two concentric tinted circles around a large icon, then a
 * heavy title, muted copy, and up to two full-width stacked actions.
 *
 * RN uses gold at 12%/18% for the "nothing here yet" case and the brand blue at 8%
 * for smaller in-tab placeholders — hence `tone`.
 */
type EmptyStateProps = {
  /** SF-Symbol-style name, as understood by components/ui/Icon.tsx. */
  icon: string
  title: string
  description?: string
  tone?: 'gold' | 'primary'
  /** Primary and secondary actions, already-rendered Buttons. */
  action?: React.ReactNode
  secondaryAction?: React.ReactNode
  /** Small print under the actions. */
  footnote?: string
  className?: string
}

const toneClasses = {
  gold: { outer: 'bg-accent-400/12', inner: 'bg-accent-400/18', icon: 'text-accent-400' },
  primary: { outer: 'bg-primary-600/8', inner: 'bg-primary-600/12', icon: 'text-primary-600' },
}

export function EmptyState({
  icon,
  title,
  description,
  tone = 'gold',
  action,
  secondaryAction,
  footnote,
  className,
}: EmptyStateProps) {
  const t = toneClasses[tone]

  return (
    <div className={cn('flex flex-col items-center text-center px-6 py-10', className)}>
      <div className={cn('flex items-center justify-center h-32 w-32 rounded-pill', t.outer)}>
        <div className={cn('flex items-center justify-center h-[88px] w-[88px] rounded-pill', t.inner)}>
          <Icon name={icon} size={48} weight="light" className={t.icon} />
        </div>
      </div>

      <h2 className="t-section-header text-ink mt-6">{title}</h2>
      {description ? <p className="t-body text-muted mt-2 max-w-sm">{description}</p> : null}

      {action || secondaryAction ? (
        <div className="flex flex-col gap-3 w-full max-w-xs mt-6">
          {action}
          {secondaryAction}
        </div>
      ) : null}

      {footnote ? <p className="t-detail text-muted mt-4">{footnote}</p> : null}
    </div>
  )
}
