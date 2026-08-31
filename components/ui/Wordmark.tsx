import { cn } from '@/lib/utils/cn'

/**
 * The SportPool wordmark is type, not an image — one word, no space, "Sport" in ink
 * and "Pool" in the brand blue, set in Nunito 900. Ported from
 * mobile/components/ui/Wordmark.tsx, including its line-height rule
 * (round(size * 1.1)).
 *
 * Use this anywhere the brand appears as a mark. Prose that merely mentions the
 * product ("Welcome to SportPool") is ordinary text and does not need it.
 */
type WordmarkProps = {
  /** Font size in px. RN uses 32 in the home header, 44 on the splash. */
  size?: number
  /** On dark surfaces: "Sport" turns white, "Pool" keeps the brand blue. */
  onDark?: boolean
  /**
   * Render the whole wordmark in a single colour, inherited from the parent.
   * For surfaces that require all-white or all-black — a pool's brand-coloured
   * header, the TV boards, a monochrome print or favicon context — where the
   * brand blue would either clash with the background or disappear into it.
   */
  mono?: boolean
  /**
   * The initials mark: `SP` instead of `SportPool`, in the same two colours.
   *
   * ⚠ It is the SAME COMPONENT on purpose. The mark's colour rule — the first
   * half in ink or white, the second half in brand blue — is one decision, and
   * a separate `<SPMark>` would be a second place to make it. Compacting
   * "Sport" to S and "Pool" to P keeps the join in the same spot, so the two
   * marks stay recognisably the same thing.
   *
   * For a band, a tab bar, a favicon — anywhere the full wordmark would crowd
   * the name sitting next to it.
   */
  compact?: boolean
  className?: string
}

export function Wordmark({ size = 32, onDark = false, mono = false, compact = false, className }: WordmarkProps) {
  return (
    <span
      className={cn(
        'font-black select-none whitespace-nowrap',
        mono ? undefined : onDark ? 'text-white' : 'text-ink',
        className,
      )}
      style={{ fontSize: size, lineHeight: `${Math.round(size * 1.1)}px` }}
    >
      {compact ? 'S' : 'Sport'}
      <span className={mono ? undefined : 'text-primary-600'}>{compact ? 'P' : 'Pool'}</span>
    </span>
  )
}
