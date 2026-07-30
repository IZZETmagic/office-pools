import { cn } from '@/lib/utils/cn'

/**
 * Field label + help text.
 *
 * The label uses the RN `caption` type variant — 11px bold, uppercase, 1.5px
 * tracking — which is what the app puts above every input. It reads much smaller
 * than the old 14px sentence-case label; that is the intended change.
 */
type FormFieldProps = {
  label: string
  helperText?: string
  error?: string
  children: React.ReactNode
  className?: string
}

export function FormField({ label, helperText, error, children, className }: FormFieldProps) {
  return (
    <div className={className}>
      <label className={cn('block t-caption text-muted mb-2')}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="t-detail text-danger-600 mt-1.5">{error}</p>
      ) : helperText ? (
        <p className="t-detail text-muted mt-1.5">{helperText}</p>
      ) : null}
    </div>
  )
}
