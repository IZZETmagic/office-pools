import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type PoolsTab = 'my-pools' | 'discover';

type PoolsSegmentProps = {
  active: PoolsTab;
  onChange: (tab: PoolsTab) => void;
};

export function PoolsSegment({ active, onChange }: PoolsSegmentProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xl,
        paddingTop: theme.spacing.sm,
      }}
    >
      <SegmentLabel active={active === 'my-pools'} onPress={() => onChange('my-pools')} label="My Pools" />
      <SegmentLabel active={active === 'discover'} onPress={() => onChange('discover')} label="Discover" />
    </View>
  );
}

function SegmentLabel({
  active,
  onPress,
  label,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.xs + 2,
        borderRadius: theme.radii.pill,
        backgroundColor: active ? withOpacity(theme.colors.primary, 0.12) : 'transparent',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 12,
          color: active ? theme.colors.primary : theme.colors.slate,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
