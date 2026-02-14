type AlertProps = {
  variant: 'error' | 'success'
  children: React.ReactNode
  className?: string
}

const variantClasses = {
  error: 'bg-red-50 border border-red-200 text-red-600',
  success: 'bg-green-50 border border-green-200 text-green-600',
}

export function Alert({ variant, children, className = 'mb-4' }: AlertProps) {
  return (
    <div className={`${variantClasses[variant]} px-4 py-3 rounded ${className}`}>
      {children}
    </div>
  )
}
