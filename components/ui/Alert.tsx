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
 *   success    6.05:1          10.10:1     primary-800  (see below)
 *   warning    5.08:1          14.94:1     warning-800
 *   error      5.16:1          11.19:1     danger-800
 *
 * SUCCESS IS NO LONGER GREEN, AND SHARES INFO'S TINT (2026-08-29, Ryan). Green
 * survives in the product as a RESULT colour — a correct pick, a rising rank —
 * so spending it on "Message sent" made a confirmation speak in the same voice
 * as a scoring event. The two variants are now separated by their ICON, not
 * their tone: a check for something the member did, an info glyph for something
 * they are being told. Keep them on the same classes; a "nearly info" third
 * blue would read as a rendering bug rather than a distinction. The toast in
 * components/ui/Toast.tsx makes the same move for the same reason.
 *
 * Which is also why the glyphs are FILLED — the Hugeicons Pro solid-rounded set,
 * opted into with `solid` (SOLID_ICON_MAP in components/ui/Icon.tsx). Once the
 * icon is the only thing separating success from info, a stroke outline is too
 * quiet to carry that job.
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
  success: 'bg-primary-600/12 text-primary-800',
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
      <Icon name={variantIcon[variant]} size={18} solid className="shrink-0 mt-px" />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
