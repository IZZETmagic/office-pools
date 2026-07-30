import Link from 'next/link'

import { cn } from '@/lib/utils/cn'

/**
 * Ported from mobile/components/ui/Button.tsx: fixed heights 36/44/52, an 18px
 * radius at every size, and Nunito 700 with 0.2px tracking.
 *
 * `secondary` and `ghost` are the RN app's own variant names. `green`, `outline`,
 * `gray` and `warning` predate the redesign and are kept because 38 files call
 * them; `gray` is an alias of `secondary`.
 */
type ButtonBaseProps = {
  variant?: 'primary' | 'secondary' | 'ghost' | 'green' | 'outline' | 'gray' | 'danger' | 'warning'
  size?: 'xs' | 'sm' | 'md' | 'lg'
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
  secondary: 'bg-mist text-ink hover:bg-silver',
  ghost: 'bg-transparent text-primary-600 hover:bg-primary-600/10',
  green: 'bg-success-600 text-white hover:bg-success-700',
  outline: 'bg-transparent text-primary-600 border border-primary-600 hover:bg-primary-600/10',
  gray: 'bg-mist text-ink hover:bg-silver',
  danger: 'bg-danger-600 text-white hover:bg-danger-700',
  warning: 'bg-warning-500 text-white hover:bg-warning-600',
}

// Heights are the RN values verbatim. `xs` has no RN counterpart — it predates the
// redesign and stays smaller and tighter-cornered than the ladder.
const sizeClasses = {
  xs: 'h-8 px-3 text-xs rounded-chip',
  sm: 'h-9 px-4 text-[13px] rounded-control',
  md: 'h-11 px-6 text-[15px] rounded-control',
  lg: 'h-[52px] px-6 text-base rounded-control',
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
  const baseClasses = cn(
    'inline-flex items-center justify-center gap-2 font-bold tracking-[0.2px] transition-colors',
    // RN gives press feedback with opacity rather than a scale or colour shift.
    'active:opacity-85',
    // The app has no keyboard affordance to inherit, so the web gets a real one.
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
    variantClasses[variant],
    sizeClasses[size],
    fullWidth && 'w-full',
    className,
  )

  if ('href' in props && props.href) {
    const { href, ...linkProps } = props as ButtonAsLinkProps
    return (
      <Link href={href} className={cn(baseClasses, 'text-center')} {...linkProps}>
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
      aria-busy={loading || undefined}
      className={cn(baseClasses, 'disabled:opacity-50 disabled:cursor-not-allowed')}
    >
      {loading && loadingText ? loadingText : children}
    </button>
  )
}
