import { cn } from '@/lib/utils/cn'
import { Icon } from './Icon'

/**
 * Numbers.
 *
 * Every rank, point total, score and level in the app renders in a bold monospace
 * face (Menlo-Bold on iOS) — 48 call sites in RN do this with an inline platform
 * ternary. It is the most recognisable single trait of the product's typography,
 * so on web it lives in one place: the `.t-num` utility, wrapped here.
 */
type StatProps = {
  /** Rendered as-is, so callers keep control of formatting and separators. */
  value: React.ReactNode
  /** Small caption under the value, e.g. "POINTS". Uppercased by `.t-caption`. */
  label?: string
  /** Font size of the numeral in px. RN ranges from 13 (inline) to 32 (hero rank). */
  size?: number
  className?: string
  valueClassName?: string
}

export function Stat({ value, label, size = 20, className, valueClassName }: StatProps) {
  return (
    <div className={cn('flex flex-col items-center gap-0.5', className)}>
      <span className={cn('t-num text-ink', valueClassName)} style={{ fontSize: size }}>
        {value}
      </span>
      {label ? <span className="t-caption text-muted">{label}</span> : null}
    </div>
  )
}

/**
 * The three-up tile row on the RN home screen (QuickStats): a tinted icon, the
 * monospace value, then a micro uppercase label.
 */
type StatTileProps = {
  /** SF-Symbol-style name, as understood by components/ui/Icon.tsx. */
  icon: string
  value: React.ReactNode
  label: string
  /** Tailwind text colour for the icon, e.g. "text-danger-600". */
  iconClassName?: string
  className?: string
}

export function StatTile({ icon, value, label, iconClassName = 'text-primary-600', className }: StatTileProps) {
  return (
    <div
      className={cn(
        'flex-1 flex flex-col items-center gap-1 bg-surface rounded-card shadow-card',
        'dark:shadow-none dark:border dark:border-border-default py-3.5 px-2',
        className,
      )}
    >
      <Icon name={icon} size={16} weight="semibold" className={iconClassName} />
      <span className="t-num text-ink text-xl leading-none">{value}</span>
      <span className="t-caption text-muted text-center">{label}</span>
    </div>
  )
}
