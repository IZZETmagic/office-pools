/**
 * Format a number with comma separators and no decimal places.
 * e.g. 1234 → "1,234", 50 → "50"
 */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}
