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

export function getStatusVariant(status: string): BadgeVariant {
  if (status === 'open') return 'outline-green'
  if (status === 'closed') return 'outline-yellow'
  return 'outline-gray'
}
