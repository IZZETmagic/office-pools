import type { ReactNode } from 'react';
import { ScrollView, View, type ScrollViewProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  scrollProps?: ScrollViewProps;
};

export function Screen({ children, scroll = true, contentStyle, scrollProps }: ScreenProps) {
  const theme = useTheme();
  const Container = scroll ? ScrollView : View;
  const containerProps = scroll
    ? {
        contentContainerStyle: {
          padding: theme.spacing.xl,
          gap: theme.spacing.xxl,
          ...contentStyle,
        },
        ...scrollProps,
      }
    : {
        style: {
          flex: 1,
          padding: theme.spacing.xl,
          gap: theme.spacing.xxl,
          ...contentStyle,
        },
      };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.snow }}
      edges={['top', 'left', 'right']}
    >
      <Container {...containerProps}>{children}</Container>
    </SafeAreaView>
  );
}
