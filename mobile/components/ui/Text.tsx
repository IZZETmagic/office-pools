import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { type ColorToken, type TypographyVariant, useTheme } from '@/theme';

type TextProps = Omit<RNTextProps, 'style'> & {
  variant?: TypographyVariant;
  color?: ColorToken;
  align?: 'left' | 'center' | 'right';
  style?: RNTextProps['style'];
};

export function Text({
  variant = 'body',
  color = 'ink',
  align,
  style,
  children,
  ...rest
}: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        theme.typography[variant],
        { color: theme.colors[color] },
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
