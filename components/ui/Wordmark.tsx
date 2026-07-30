import { cn } from '@/lib/utils/cn'

/**
 * The SportPool wordmark is type, not an image — "Sport" in ink, "Pool" in the
 * brand blue, set in Nunito 900. Ported from mobile/components/ui/Wordmark.tsx,
 * including its line-height rule (round(size * 1.1)).
 */
type WordmarkProps = {
  /** Font size in px. RN uses 32 in the home header, 44 on the splash. */
  size?: number
  /** On dark or branded surfaces, "Sport" turns white and "Pool" stays blue. */
  onDark?: boolean
  className?: string
}

export function Wordmark({ size = 32, onDark = false, className }: WordmarkProps) {
  return (
    <span
      className={cn('font-black select-none', onDark ? 'text-white' : 'text-ink', className)}
      style={{ fontSize: size, lineHeight: `${Math.round(size * 1.1)}px` }}
    >
      Sport<span className="text-primary-600">Pool</span>
    </span>
  )
}
