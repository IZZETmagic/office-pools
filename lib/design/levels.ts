/**
 * The XP level colour ladder.
 *
 * Mirrors `useLevelColor` in mobile/components/pool-detail/FormTab.tsx, which is
 * what colours the level ring, the progress bar and the level pills on the app's
 * Form tab:
 *
 *   L10+   accent (gold)
 *   L8–9   amber
 *   L6–7   primary
 *   L4–5   #57D0FF
 *   below  green
 *
 * Returned as CSS custom properties rather than Tailwind classes because most
 * consumers are SVG strokes, gradient stops and inline styles, where a class
 * cannot reach. `levelColorClass` is there for the plain-text cases.
 */

export type LevelBand = 'legend' | 'expert' | 'skilled' | 'rising' | 'starter'

export function levelBand(level: number): LevelBand {
  if (level >= 10) return 'legend'
  if (level >= 8) return 'expert'
  if (level >= 6) return 'skilled'
  if (level >= 4) return 'rising'
  return 'starter'
}

const BAND_VAR: Record<LevelBand, string> = {
  legend: 'var(--accent-400)',
  expert: 'var(--warning-500)',
  skilled: 'var(--primary-600)',
  rising: 'var(--sp-level-sky)',
  starter: 'var(--success-600)',
}

const BAND_TEXT: Record<LevelBand, string> = {
  legend: 'text-accent-400',
  expert: 'text-warning-500',
  skilled: 'text-primary-600',
  rising: 'text-[var(--sp-level-sky)]',
  starter: 'text-success-600',
}

/** CSS colour for a level — for SVG strokes, gradients and inline styles. */
export function levelColor(level: number): string {
  return BAND_VAR[levelBand(level)]
}

/** Tailwind text class for a level, where a class is usable. */
export function levelColorClass(level: number): string {
  return BAND_TEXT[levelBand(level)]
}

/**
 * Tinted pill treatment for a level badge — the app's tint-at-low-alpha recipe,
 * with the top band filled solid as RN's LevelPill does at L10.
 */
const BAND_PILL: Record<LevelBand, string> = {
  legend: 'bg-accent-400 text-white',
  expert: 'bg-warning-500/15 text-warning-700',
  skilled: 'bg-primary-600/12 text-primary-700',
  rising: 'bg-[var(--sp-level-sky)]/15 text-[var(--sp-level-sky)]',
  starter: 'bg-success-600/12 text-success-700',
}

export function levelPillClass(level: number): string {
  return BAND_PILL[levelBand(level)]
}

/**
 * The three XP sources, coloured as the app's XPStatColumn does:
 * match XP in primary, bonus in amber, badges in gold.
 */
export const XP_SOURCE_COLOR = {
  match: 'var(--primary-600)',
  bonus: 'var(--warning-500)',
  badge: 'var(--accent-400)',
} as const
