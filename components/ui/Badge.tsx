type BadgeProps = {
  variant?: 'blue' | 'green' | 'yellow' | 'gray'
  children: React.ReactNode
  className?: string
}

const variantClasses = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  gray: 'bg-gray-100 text-gray-600',
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
