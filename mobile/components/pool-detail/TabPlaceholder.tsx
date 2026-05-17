import type { SymbolViewProps } from 'expo-symbols';
import { View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme, withOpacity } from '@/theme';

type TabPlaceholderProps = {
  icon: SymbolViewProps['name'];
  title: string;
  caption: string;
};

export function TabPlaceholder({ icon, title, caption }: TabPlaceholderProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.lg,
        paddingVertical: theme.spacing.hero,
        paddingHorizontal: theme.spacing.xl,
      }}
    >
      <View
        style={{
          width: 96,
          height: 96,
          borderRadius: theme.radii.xl,
          backgroundColor: withOpacity(theme.colors.primary, 0.08),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} color="primary" size={40} />
      </View>
      <View style={{ gap: theme.spacing.xs, alignItems: 'center' }}>
        <Text variant="sectionHeader" align="center">
          {title}
        </Text>
        <Text variant="body" color="slate" align="center">
          {caption}
        </Text>
      </View>
    </View>
  );
}
