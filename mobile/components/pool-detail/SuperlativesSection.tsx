import { View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { Superlative } from '@/lib/api';
import { useTheme } from '@/theme';

const ICON_BY_TYPE: Record<string, string> = {
  hot: 'flame.fill',
  cold: 'snowflake',
  contrarian: 'dice.fill',
  crowd: 'person.3.fill',
  sharpshooter: 'scope',
  climber: 'arrow.up.right',
  faller: 'arrow.down.right',
};

const COLOR_TOKEN_BY_TYPE: Record<
  string,
  'red' | 'primary' | 'accent' | 'green' | 'slate'
> = {
  hot: 'red',
  cold: 'primary',
  contrarian: 'primary',
  crowd: 'primary',
  sharpshooter: 'accent',
  climber: 'green',
  faller: 'red',
};

export function SuperlativesSection({ superlatives }: { superlatives: Superlative[] }) {
  const theme = useTheme();
  if (superlatives.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
      <Text variant="sectionHeader">Pool Superlatives</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {superlatives.map((s) => {
          const icon = ICON_BY_TYPE[s.type] ?? 'star.fill';
          const color = COLOR_TOKEN_BY_TYPE[s.type] ?? 'accent';
          return (
            <View
              key={`${s.type}-${s.entry_id}`}
              style={{
                width: '48%',
                alignItems: 'center',
                gap: theme.spacing.xs,
                padding: theme.spacing.md,
                borderRadius: theme.radii.md,
                backgroundColor: theme.colors.surface,
                ...theme.shadows.card,
              }}
            >
              <Icon name={icon as never} color={color} size={22} />
              <Text variant="caption" color="ink" align="center">
                {s.title}
              </Text>
              <Text variant="body" color="primary" align="center" numberOfLines={1}>
                {s.name}
              </Text>
              <Text variant="detail" color="slate" align="center" numberOfLines={1}>
                {s.detail}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
