import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from './Text';
import { playFeel, type FeelName } from '@/lib/haptics';
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
  /**
   * Opt in to a haptic on press, naming a feel from `lib/haptics.ts`.
   *
   * ⚠⚠ OPT-IN, AND IT MUST STAY THAT WAY. There are 429 `onPress` handlers
   * across 132 files in this app. A default here would buzz most of them, and a
   * buzz that happens everywhere stops meaning "that registered" and becomes
   * ambient — which is how an app starts feeling cheap. This prop exists so
   * adding a haptic to a button is one word instead of a wrapper, NOT so that
   * every button gets one.
   *
   * ⭐ Firing on press rather than on the action's outcome is deliberate: the
   * outcome belongs to whoever awaited it, and `hapticSuccess`/`hapticFailure`
   * are theirs to call. This one only says "I felt your finger".
   */
  haptic?: FeelName;
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  haptic,
  onPress,
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
      // `onPress` is pulled out of `rest` so it can be wrapped. Pressable does
      // not fire it while disabled, so `loading` needs no guard of its own.
      onPress={(ev) => {
        if (haptic) playFeel(haptic);
        onPress?.(ev);
      }}
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
