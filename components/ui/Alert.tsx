import { cn } from '@/lib/utils/cn'
import { Icon } from './Icon'

/**
 * The RN inline banner: tinted background, 18px radius, and a leading icon sized
 * to the copy (see PredictionsAlertBanner in the app).
 */
type AlertProps = {
  variant: 'error' | 'success'
  children: React.ReactNode
  className?: string
}

const variantClasses = {
  error: 'bg-danger-600/10 text-danger-700',
  success: 'bg-success-600/10 text-success-700',
}

const variantIcon = {
  error: 'exclamationmark.circle.fill',
  success: 'checkmark.circle.fill',
} as const

export function Alert({ variant, children, className = 'mb-4' }: AlertProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 px-4 py-3.5 rounded-control text-sm',
        variantClasses[variant],
        className,
      )}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <Icon name={variantIcon[variant]} size={18} weight="semibold" className="shrink-0 mt-px" />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
