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
  primary: 'bg-primary-600 text-white hover:bg-primary-700',
  green: 'bg-success-600 text-white hover:bg-success-700',
  outline: 'bg-white text-primary-600 border-2 border-primary-600 hover:bg-primary-50',
  gray: 'bg-neutral-200 text-neutral-700 hover:bg-neutral-300',
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
