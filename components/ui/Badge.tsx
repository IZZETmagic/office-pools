type BadgeProps = {
  variant?: 'blue' | 'green' | 'yellow' | 'gray'
  children: React.ReactNode
  className?: string
}

const variantClasses = {
  blue: 'bg-primary-100 text-primary-700',
  green: 'bg-success-100 text-success-700',
  yellow: 'bg-warning-100 text-warning-700',
  gray: 'bg-neutral-100 text-neutral-600',
}

export function Badge({ variant = 'blue', children, className }: BadgeProps) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${variantClasses[variant]} ${className ?? ''}`}>
      {children}
    </span>
  )
}

export function getStatusVariant(status: string): 'green' | 'yellow' | 'gray' {
  if (status === 'open') return 'green'
  if (status === 'active') return 'yellow'
  return 'gray'
}
