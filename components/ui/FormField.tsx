type FormFieldProps = {
  label: string
  helperText?: string
  children: React.ReactNode
  className?: string
}

export function FormField({ label, helperText, children, className }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-neutral-700 mb-1">
        {label}
      </label>
      {children}
      {helperText && (
        <p className="text-xs text-neutral-600 mt-1">{helperText}</p>
      )}
    </div>
  )
}
