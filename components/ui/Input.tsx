import { cn } from '@/lib/utils/cn'

/**
 * The RN text field: filled with `mist`, an 18px radius, and no border at rest —
 * the focus ring is the only stroke. Do not add a resting border back; the filled
 * shape is what makes web inputs read like the app's.
 *
 * Font size deliberately stays at the browser default 16px on small screens
 * (enforced by the `max-width: 640px` rule in globals.css) so iOS does not zoom
 * the viewport on focus.
 */
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  focusColor?: 'blue' | 'green'
  /** Switches the ring to danger and marks the field invalid for assistive tech. */
  error?: boolean
}

const focusClasses = {
  blue: 'focus:border-primary-600 focus:ring-primary-600/20',
  green: 'focus:border-success-600 focus:ring-success-600/20',
}

export function Input({ focusColor = 'blue', error = false, className, ...props }: InputProps) {
  return (
    <input
      {...props}
      aria-invalid={error || undefined}
      className={cn(
        'w-full px-4 py-3 rounded-control bg-mist text-ink',
        'placeholder:text-muted/70',
        'border border-transparent focus:outline-none focus:ring-2 transition-colors',
        error ? 'border-danger-600 focus:border-danger-600 focus:ring-danger-600/20' : focusClasses[focusColor],
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
    />
  )
}
