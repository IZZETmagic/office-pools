import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import {
  type RadiusToken,
  type ShadowToken,
  type SpacingToken,
  useTheme,
  withOpacity,
} from '@/theme';

type CardProps = {
  children: ReactNode;
  padding?: SpacingToken;
  radius?: RadiusToken;
  shadow?: ShadowToken;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  children,
  padding = 'xl',
  radius = 'lg',
  shadow = 'card',
  bordered = false,
  style,
}: CardProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii[radius],
          padding: theme.spacing[padding],
          ...theme.shadows[shadow],
          ...(bordered
            ? {
                borderWidth: theme.borders.thin,
                borderColor: withOpacity(theme.colors.silver, 0.5),
              }
            : null),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
