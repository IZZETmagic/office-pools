/**
 * Format a number with comma separators and no decimal places.
 * e.g. 1234 → "1,234", 50 → "50"
 */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US')
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
