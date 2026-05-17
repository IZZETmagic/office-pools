export const radii = {
  xs: 6,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radii;
