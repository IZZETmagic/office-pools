import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from './Text';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const heights: Record<ButtonSize, number> = { sm: 36, md: 44, lg: 52 };
  const paddingX: Record<ButtonSize, number> = {
    sm: theme.spacing.lg,
    md: theme.spacing.xl,
    lg: theme.spacing.xl,
  };
  const fontSizes: Record<ButtonSize, number> = { sm: 13, md: 15, lg: 16 };

  const bg = {
    primary: theme.colors.primary,
    secondary: theme.colors.mist,
    ghost: 'transparent',
    danger: theme.colors.red,
  }[variant];

  const fg = {
    primary: '#FFFFFF',
    secondary: theme.colors.ink,
    ghost: theme.colors.primary,
    danger: '#FFFFFF',
  }[variant];

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          height: heights[size],
          paddingHorizontal: paddingX[size],
          borderRadius: theme.radii.md,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: fontSizes[size],
              color: fg,
              letterSpacing: 0.2,
            }}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
