import { poolStatusDisplay, toneToBadgeVariant } from '@/lib/poolStatus'
import { cn } from '@/lib/utils/cn'

/**
 * The RN pill: fully rounded, 11px bold, and a background that is the text colour
 * composited at ~12% rather than a separate tint from the ramp. That one recipe
 * covers every badge in the app — ADMIN, YOU, mode labels, status chips.
 *
 * Text sits on the -700 step so it stays legible on the tint in light mode and,
 * because the ramps invert, in dark mode too.
 */
type BadgeVariant = 'blue' | 'green' | 'yellow' | 'red' | 'gray' | 'outline' | 'outline-green' | 'outline-yellow' | 'outline-gray'

type BadgeProps = {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  blue: 'bg-primary-600/12 text-primary-700',
  green: 'bg-success-600/12 text-success-700',
  yellow: 'bg-warning-500/15 text-warning-700',
  red: 'bg-danger-600/12 text-danger-700',
  gray: 'bg-mist text-muted',
  outline: 'border border-primary-600/40 text-primary-700 bg-transparent',
  'outline-green': 'border border-success-600/40 text-success-700 bg-transparent',
  'outline-yellow': 'border border-warning-500/40 text-warning-700 bg-transparent',
  'outline-gray': 'border border-silver text-muted bg-transparent',
}

export function Badge({ variant = 'blue', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[11px] font-bold whitespace-nowrap',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * @deprecated Prefer `poolStatusLabel` alongside this so the user never sees a
 * raw lowercase DB value. Delegates to lib/poolStatus so colours cannot drift.
 */
export function getStatusVariant(status: string): BadgeVariant {
  return toneToBadgeVariant(poolStatusDisplay({ status }).tone)
}

/** Solid-fill counterpart, for surfaces that use filled rather than outline pills. */
export function getStatusVariantSolid(status: string): BadgeVariant {
  const { tone } = poolStatusDisplay({ status })
  switch (tone) {
    case 'green': return 'green'
    case 'amber': return 'yellow'
    case 'blue': return 'blue'
    case 'neutral': return 'gray'
  }
}

/** The human label that belongs with either variant helper above. */
export function poolStatusLabel(status: string): string {
  return poolStatusDisplay({ status }).label
}
