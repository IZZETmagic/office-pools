import { Pressable, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { fontFamilies, useTheme } from '@/theme';

type Props = {
  title: string;
  subtitle?: string;
  onToggleAll?: () => void;
  toggleLabel?: string;
};

export function StageTitle({ title, subtitle, onToggleAll, toggleLabel }: Props) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.xs,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="sectionHeader">{title}</Text>
        {subtitle ? (
          <Text variant="body" color="slate">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onToggleAll && toggleLabel ? (
        <Pressable
          onPress={onToggleAll}
          hitSlop={6}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text
            style={{
              fontFamily: fontFamilies.semibold,
              fontSize: 13,
              color: theme.colors.primary,
            }}
          >
            {toggleLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
