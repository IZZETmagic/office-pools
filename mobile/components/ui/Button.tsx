import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from './Text';
import { hapticTap, playFeel, type FeelName } from '@/lib/haptics';
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
   * Which feel this button uses. Omit for the app default; `false` for silence.
   *
   * ⚠⚠ THIS USED TO BE OPT-IN AND NOW IS NOT. The note here argued against a
   * default, on the grounds that a buzz everywhere stops meaning anything.
   * Ryan's brief — *"anything that can be interacted with needs a haptic
   * feedback"* — overrides that, stated twice and the second time after hearing
   * the argument. So a button buzzes unless told otherwise, like every other
   * Pressable in the app. See `hapticTap`, which holds the full note and the
   * single switch for retuning it.
   *
   * ⭐ Firing on press rather than on the action's outcome is still deliberate:
   * the outcome belongs to whoever awaited it, and `hapticSuccess` /
   * `hapticFailure` are theirs to call. This one only says "I felt your
   * finger" — which is why a commit button can carry BOTH.
   */
  haptic?: FeelName | false;
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
        if (haptic === undefined) hapticTap();
        else if (haptic) playFeel(haptic);
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
