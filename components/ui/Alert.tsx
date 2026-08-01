import { cn } from '@/lib/utils/cn'
import { Icon } from './Icon'

/**
 * The RN inline banner: tinted background, 18px radius, and a leading icon sized
 * to the copy (see PredictionsAlertBanner in the app).
 *
 * COLOUR HERE IS MEASURED, NOT CHOSEN. The fill is the tone at 12% and the copy
 * is a high step of the same tone. Because the ramp inverts, one class covers
 * both modes and no `dark:` override is needed. Ratios below are composited in
 * a browser against the real surface behind the banner — not against pure
 * white, which flatters light mode by roughly a point:
 *
 *              light            dark
 *   info       6.05:1          10.10:1     primary-800
 *   success    5.56:1          15.16:1     success-900
 *   warning    5.08:1          14.94:1     warning-800
 *   error      5.16:1          11.19:1     danger-800
 *
 * `success` needs 900 where the others need 800: at 800 it measured 3.58:1,
 * a fail, because green is the lightest of the four tones.
 *
 * The two variants this file used to ship both failed AA in light mode —
 * `success` was text-success-700 at 2.96:1 and `error` was 4.42:1. Do not
 * "brighten" these back toward the 600 step: 600 is the brand colour, it lands
 * at 2.0–3.7:1 on its own tint, and that is exactly why these banners were
 * reported as hard to read.
 */
type AlertProps = {
  variant: 'info' | 'success' | 'warning' | 'error'
  children: React.ReactNode
  className?: string
}

const variantClasses = {
  info: 'bg-primary-600/12 text-primary-800',
  success: 'bg-success-600/12 text-success-900',
  warning: 'bg-warning-500/12 text-warning-800',
  error: 'bg-danger-600/12 text-danger-800',
}

const variantIcon = {
  info: 'info.circle.fill',
  success: 'checkmark.circle.fill',
  warning: 'exclamationmark.triangle.fill',
  error: 'exclamationmark.circle.fill',
} as const

export function Alert({ variant, children, className = 'mb-4' }: AlertProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 px-4 py-3.5 rounded-control text-sm',
        variantClasses[variant],
        className,
      )}
      role={variant === 'error' || variant === 'warning' ? 'alert' : 'status'}
    >
      <Icon name={variantIcon[variant]} size={18} weight="semibold" className="shrink-0 mt-px" />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
