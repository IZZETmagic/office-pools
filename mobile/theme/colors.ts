export type ColorMode = 'light' | 'dark';

type ModeValues = { light: string; dark: string };

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

  tierExact: { light: '#E2B830', dark: '#E2B830' },
  tierWinnerGd: { light: '#52D660', dark: '#52D660' },
  tierWinner: { light: '#30B7FF', dark: '#30B7FF' },
  tierMiss: { light: '#A1A6A0', dark: '#A1A6A0' },
  hotStreak: { light: '#F4C41B', dark: '#F4C41B' },
  coldStreak: { light: '#8DE2FF', dark: '#8DE2FF' },
  bronze: { light: '#CD7F32', dark: '#CD7F32' },
} satisfies Record<string, ModeValues>;

export type ColorToken = keyof typeof palette;

export function resolveColors(mode: ColorMode): Record<ColorToken, string> {
  const out = {} as Record<ColorToken, string>;
  (Object.keys(palette) as ColorToken[]).forEach((k) => {
    out[k] = palette[k][mode];
  });
  return out;
}
