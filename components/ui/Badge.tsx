import { poolStatusDisplay, toneToBadgeVariant } from '@/lib/poolStatus'

type BadgeVariant = 'blue' | 'green' | 'yellow' | 'gray' | 'outline' | 'outline-green' | 'outline-yellow' | 'outline-gray'

type BadgeProps = {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  blue: 'bg-primary-100 text-primary-800',
  green: 'bg-success-100 text-success-800',
  yellow: 'bg-warning-100 text-warning-800',
  gray: 'bg-neutral-100 text-neutral-700',
  outline: 'border border-primary-500 text-neutral-700 bg-transparent',
  'outline-green': 'border border-success-500 text-neutral-700 bg-transparent',
  'outline-yellow': 'border border-warning-500 text-neutral-700 bg-transparent',
  'outline-gray': 'border border-neutral-400 text-neutral-700 bg-transparent',
}

export function Badge({ variant = 'blue', children, className }: BadgeProps) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-xl font-medium ${variantClasses[variant]} ${className ?? ''}`}>
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
