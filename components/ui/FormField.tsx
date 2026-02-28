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
      <label className="block text-sm font-medium text-neutral-700 mb-1">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger-600 mt-1">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-neutral-700 mt-1">{helperText}</p>
      ) : null}
    </div>
  )
}
