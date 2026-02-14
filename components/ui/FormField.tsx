type FormFieldProps = {
  label: string
  helperText?: string
  children: React.ReactNode
  className?: string
}

export function FormField({ label, helperText, children, className }: FormFieldProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
      {helperText && (
        <p className="text-xs text-gray-500 mt-1">{helperText}</p>
      )}
    </div>
  )
}
