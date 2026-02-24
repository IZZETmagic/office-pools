type CardProps = {
  children: React.ReactNode
  padding?: 'md' | 'lg'
  className?: string
}

const paddingClasses = {
  md: 'p-6',
  lg: 'p-8',
}

export function Card({ children, padding = 'md', className }: CardProps) {
  return (
    <div className={`bg-surface rounded-lg shadow dark:shadow-none dark:border dark:border-border-default ${paddingClasses[padding]} ${className ?? ''}`}>
      {children}
    </div>
  )
}
