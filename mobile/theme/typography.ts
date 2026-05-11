import type { TextStyle } from 'react-native';

export const fontFamilies = {
  black: 'Nunito_900Black',
  bold: 'Nunito_700Bold',
  semibold: 'Nunito_600SemiBold',
  medium: 'Nunito_500Medium',
  regular: 'Nunito_400Regular',
} as const;

export const typography = {
  pageTitle: {
    fontFamily: fontFamilies.black,
    fontSize: 32,
    lineHeight: 38,
  },
  sectionHeader: {
    fontFamily: fontFamilies.black,
    fontSize: 20,
    lineHeight: 24,
  },
  cardTitle: {
    fontFamily: fontFamilies.bold,
    fontSize: 16,
    lineHeight: 20,
  },
  body: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  detail: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 13,
  },
  mono: {
    fontFamily: 'Menlo',
    fontSize: 14,
    lineHeight: 18,
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
