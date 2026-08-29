/**
 * SportPool design tokens — TypeScript mirror of the React Native palette.
 *
 * These values MIRROR `mobile/theme/` (colors.ts, radii.ts, spacing.ts). They are
 * deliberately duplicated rather than imported: `mobile/**` is listed in `.vercelignore`,
 * so the directory does not exist in the deployed bundle and any production import from
 * web code would fail the Vercel build — silently passing in dev, which is the trap.
 * `lib/design/__tests__/tokens.test.ts` imports the mobile palette and asserts every value
 * below still matches — test files never ship, so the guard is free. This is the same
 * pattern as `lib/email/brand.ts`.
 *
 * `app/globals.css` is the source of truth for anything expressible as a CSS class; the
 * drift test also asserts that these values appear there. Reach for this file only where
 * a plain utility class can't go — inline `style` props, `recharts` series colours,
 * gradient maths, canvas/SVG fills.
 */

export type ColorMode = 'light' | 'dark'

type ModeValues = { light: string; dark: string }

/**
 * Full mirror of `palette` in mobile/theme/colors.ts, including the entries the email
 * mirror skipped (`silver` and the whole tier/streak family).
 */
export const palette = {
  snow: { light: '#F7F8FC', dark: '#121520' },
  surface: { light: '#FFFFFF', dark: '#1C2030' },
  mist: { light: '#EEF1F8', dark: '#232840' },
  silver: { light: '#D4DAE8', dark: '#2E3448' },
  slate: { light: '#7B87A8', dark: '#8B97B8' },
  ink: { light: '#1B2340', dark: '#E8EAF0' },
  midnight: { light: '#0B0F1A', dark: '#0B0F1A' },

  primary: { light: '#3B6EFF', dark: '#5B8AFF' },
  primaryLight: { light: '#F7F9FF', dark: '#1A2440' },

  accent: { light: '#F5C518', dark: '#F5C518' },
  accentLight: { light: '#FFF8E1', dark: '#2A2210' },

  green: { light: '#22C55E', dark: '#34D972' },
  greenLight: { light: '#ECFDF5', dark: '#0F2A1A' },
  red: { light: '#EF4444', dark: '#F87171' },
  redLight: { light: '#FEF2F2', dark: '#2A1010' },
  amber: { light: '#F59E0B', dark: '#FBBF24' },
  amberLight: { light: '#FFFBEB', dark: '#2A2210' },

  // Prediction tiers and streaks are mode-invariant in the app.
  tierExact: { light: '#E2B830', dark: '#E2B830' },
  tierWinnerGd: { light: '#52D660', dark: '#52D660' },
  tierWinner: { light: '#30B7FF', dark: '#30B7FF' },
  tierMiss: { light: '#A1A6A0', dark: '#A1A6A0' },
  hotStreak: { light: '#F4C41B', dark: '#F4C41B' },
  coldStreak: { light: '#8DE2FF', dark: '#8DE2FF' },
  bronze: { light: '#CD7F32', dark: '#CD7F32' },
} satisfies Record<string, ModeValues>

export type ColorToken = keyof typeof palette

export function resolveColors(mode: ColorMode): Record<ColorToken, string> {
  const out = {} as Record<ColorToken, string>
  ;(Object.keys(palette) as ColorToken[]).forEach((k) => {
    out[k] = palette[k][mode]
  })
  return out
}

/** mobile/theme/radii.ts */
export const radii = {
  xs: 6,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
} as const

/** mobile/theme/spacing.ts */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  hero: 64,
  heroLg: 96,
} as const

/**
 * The app tints surfaces by compositing a token over the background at low alpha
 * (`withOpacity` in mobile/theme/useTheme.ts) rather than keeping a tint scale. This is
 * the direct equivalent for inline styles; in CSS classes prefer
 * `color-mix(in srgb, var(--primary-600) 12%, transparent)`.
 */
export function withOpacity(hex: string, opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity))
  const alpha = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${alpha}`
}

/**
 * Left-edge accent stripe on pool cards, keyed to pool mode.
 * From mobile/components/pools/PoolListItem.tsx.
 */
export const poolModeGradient = {
  full_tournament: ['#667EEA', '#3B6EFF'],
  progressive: ['#34D399', '#059669'],
  bracket_picker: ['#FBBF24', '#D97706'],
} as const

/**
 * How much lighter the TOP of a pool card's stripe sits than its brand colour.
 *
 * The stripe is one competition colour drawn as two stops, matching the shape
 * every other stripe in the app already has (see `poolModeGradient`, three pairs
 * that are each one hue at two lightnesses). In OKLab units, so the step looks
 * the same on Ligue 1's near-black navy as on the World Cup's gold.
 */
export const STRIPE_TOP_LIFT = 0.14

/**
 * One colour per game mode — all seven — for the pill on a pool card.
 *
 * ⚠ THE PILL IS NOW THE ONLY PLACE THE MODE IS COLOURED. The card's stripe
 * became the competition's brand colour (Ryan, 2026-08-29), so a member telling
 * a Showdown pool from a Last Man Standing one at a glance depends entirely on
 * this. Before it, all four league modes shared one gold pill.
 *
 * ## Why these seven and not others
 *
 * The three bracket colours are FIXED: they mirror `poolModeColor` below, which
 * mirrors mobile/theme, and moving them would drift the two apps apart. That
 * leaves the four league modes to fit around three fixed points at 265°, 163°
 * and 58° — an uneven ring whose largest empty arc is 153°. Four colours in
 * that arc is ~30° each, so the set below reaches a minimum pairwise separation
 * of 28° (full_tournament / table). Seven evenly spaced would be 51°; 28° is
 * near the achievable maximum, not a shrug.
 *
 * Measured, not eyeballed — `lib/design/__tests__/modeIdentity.test.ts` pins the
 * separation so a future eighth mode cannot be dropped in on top of an existing
 * one.
 *
 * The pill's text and tint are DERIVED from these at render (see getModeChip in
 * poolMode.ts) rather than authored per theme, which is why one value each is
 * enough and why a new mode needs exactly one line here.
 */
export const modeIdentityColor = {
  full_tournament:   '#3B6EFF',  // hue 265 — the brand blue, unchanged
  progressive:       '#059669',  // hue 163 — unchanged
  bracket_picker:    '#D97706',  // hue  58 — unchanged
  pickem:            '#0891B2',  // hue 222 — teal, the everyday league mode
  table:             '#7C3AED',  // hue 293 — violet, an ordered list
  showdown:          '#C026D3',  // hue 323 — magenta, a clash
  last_man_standing: '#E11D48',  // hue  18 — crimson, elimination
} as const

export type ModeIdentityKey = keyof typeof modeIdentityColor

/** Flat mode colours used for pills and tab accents (PoolDetailHeader.tsx). */
export const poolModeColor = {
  full_tournament: '#3B6EFF',
  progressive: '#059669',
  bracket_picker: '#D97706',
} as const

export type PoolMode = keyof typeof poolModeGradient
