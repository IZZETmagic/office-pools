/**
 * Format a number with comma separators and no decimal places.
 * e.g. 1234 → "1,234", 50 → "50"
 */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

/**
 * Format an integer cent amount as a localized currency string.
 * e.g. (1900, 'USD') → "$19.00", (5000, 'EUR') → "€50.00"
 */
export function formatCurrency(cents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

/**
 * Number of full monthly anniversaries that have elapsed between `start`
 * and `end` (inclusive of `start`, exclusive of `end`). Used to compute
 * how many monthly billing cycles a subscription has incurred.
 *
 * Example: start=2025-09-15, end=2026-01-14 → 3 (Sep15→Oct15, Oct15→Nov15, Nov15→Dec15)
 *          start=2025-09-15, end=2026-01-15 → 4
 */
export function monthsElapsed(start: Date, end: Date): number {
  if (end < start) return 0
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  if (end.getDate() < start.getDate()) months -= 1
  return Math.max(0, months)
}

/**
 * Format a date string as a human-readable relative time.
 * e.g. "just now", "5m ago", "3h ago", "Feb 14"
 */
export function formatTimeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  if (diffSec < 10) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
