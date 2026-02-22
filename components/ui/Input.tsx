type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  focusColor?: 'blue' | 'green'
}

const focusClasses = {
  blue: 'focus:ring-primary-500',
  green: 'focus:ring-success-500',
}

export function Input({ focusColor = 'blue', className, ...props }: InputProps) {
  return (
    <input
      {...props}
      className={`w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 ${focusClasses[focusColor]} focus:border-transparent text-neutral-900 ${className ?? ''}`}
    />
  )
}
