export const borders = {
  thin: 0.5,
  standard: 1,
  accent: 1.5,
} as const;

export type BorderToken = keyof typeof borders;
