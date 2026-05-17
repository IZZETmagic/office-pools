import { View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

const ITEMS: Array<{ color: string; label: string }> = [
  { color: '#E2B830', label: 'Exact' },
  { color: '#52D660', label: 'W+GD' },
  { color: '#30B7FF', label: 'Winner' },
  { color: '#EF4444', label: 'Miss' },
];

export function LeaderboardLegend() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.md,
        justifyContent: 'center',
        paddingVertical: theme.spacing.xs,
      }}
    >
      {ITEMS.map((item) => (
        <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: item.color,
            }}
          />
          <Text
            variant="caption"
            color="slate"
            style={{ textTransform: 'none', letterSpacing: 0 }}
          >
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
