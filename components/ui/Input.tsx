type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  focusColor?: 'blue' | 'green'
}

const focusClasses = {
  blue: 'focus:ring-blue-500',
  green: 'focus:ring-green-500',
}

export function Input({ focusColor = 'blue', className, ...props }: InputProps) {
  return (
    <input
      {...props}
      className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 ${focusClasses[focusColor]} focus:border-transparent text-gray-900 ${className ?? ''}`}
    />
  )
}
