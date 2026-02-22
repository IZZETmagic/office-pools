type AlertProps = {
  variant: 'error' | 'success'
  children: React.ReactNode
  className?: string
}

const variantClasses = {
  error: 'bg-danger-50 border border-danger-200 text-danger-600',
  success: 'bg-success-50 border border-success-200 text-success-600',
}

export function Alert({ variant, children, className = 'mb-4' }: AlertProps) {
  return (
    <div className={`${variantClasses[variant]} px-4 py-3 rounded ${className}`}>
      {children}
    </div>
  )
}
