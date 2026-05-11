import { useColorScheme } from 'react-native';

import { resolveColors, type ColorMode, type ColorToken } from './colors';
import { borders } from './borders';
import { radii } from './radii';
import { shadows } from './shadows';
import { spacing } from './spacing';
import { typography } from './typography';

export type Theme = {
  mode: ColorMode;
  colors: Record<ColorToken, string>;
  spacing: typeof spacing;
  radii: typeof radii;
  shadows: typeof shadows;
  borders: typeof borders;
  typography: typeof typography;
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const mode: ColorMode = scheme === 'dark' ? 'dark' : 'light';
  return {
    mode,
    colors: resolveColors(mode),
    spacing,
    radii,
    shadows,
    borders,
    typography,
  };
}

export function withOpacity(hex: string, opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity));
  const alpha = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}
