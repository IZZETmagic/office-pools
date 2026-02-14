import Link from 'next/link'

type ButtonBaseProps = {
  variant?: 'primary' | 'green' | 'outline' | 'gray'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  loading?: boolean
  loadingText?: string
  className?: string
  children: React.ReactNode
}

type ButtonAsButtonProps = ButtonBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
    href?: undefined
  }

type ButtonAsLinkProps = ButtonBaseProps &
  Omit<React.ComponentProps<typeof Link>, keyof ButtonBaseProps> & {
    href: string
  }

type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps

const variantClasses = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  green: 'bg-green-600 text-white hover:bg-green-700',
  outline: 'bg-white text-blue-600 border-2 border-blue-600 hover:bg-blue-50',
  gray: 'bg-gray-200 text-gray-700 hover:bg-gray-300',
}

const sizeClasses = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-4 py-2',
  lg: 'px-8 py-3',
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  loadingText,
  className,
  children,
  ...props
}: ButtonProps) {
  const baseClasses = [
    'rounded-lg font-semibold transition',
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? 'w-full' : '',
    className ?? '',
  ].filter(Boolean).join(' ')

  if ('href' in props && props.href) {
    const { href, ...linkProps } = props as ButtonAsLinkProps
    return (
      <Link href={href} className={`${baseClasses} text-center`} {...linkProps}>
        {children}
      </Link>
    )
  }

  const buttonProps = props as ButtonAsButtonProps
  const isDisabled = loading || buttonProps.disabled

  return (
    <button
      {...buttonProps}
      disabled={isDisabled}
      className={`${baseClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {loading && loadingText ? loadingText : children}
    </button>
  )
}
