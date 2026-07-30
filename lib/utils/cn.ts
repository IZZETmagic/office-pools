import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Join class names, with later Tailwind utilities winning over earlier ones in the same
 * group.
 *
 * The UI primitives used to compose classes with template strings
 * (`` `${base} ${variant} ${className ?? ''}` ``), which meant a caller passing
 * `className="rounded-pill"` to a component whose base already said `rounded-card` got
 * both, and whichever CSS rule happened to come later in the stylesheet won. `twMerge`
 * resolves that conflict by intent instead: the caller's class wins.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
