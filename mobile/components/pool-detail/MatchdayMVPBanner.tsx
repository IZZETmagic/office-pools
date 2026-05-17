import { View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { MatchdayMvp } from '@/lib/api';
import { useTheme, withOpacity } from '@/theme';

export function MatchdayMVPBanner({ mvp }: { mvp: MatchdayMvp }) {
  const theme = useTheme();
  const name = mvp.entry_name?.trim() ? mvp.entry_name : mvp.full_name;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.md + 2,
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        borderWidth: theme.borders.accent,
        borderColor: withOpacity(theme.colors.accent, 0.3),
        ...theme.shadows.card,
      }}
    >
      <Icon name="star.fill" color="accent" size={20} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" color="slate">
          Matchday MVP
        </Text>
        <Text variant="body">
          {name} scored {mvp.match_points} pts on Match {mvp.match_number}
        </Text>
      </View>
    </View>
  );
}
