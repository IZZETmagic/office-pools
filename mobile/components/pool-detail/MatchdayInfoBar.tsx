import { View } from 'react-native';

import { Text } from '@/components/ui';
import type { MatchdayInfo } from '@/lib/api';
import { useTheme } from '@/theme';

export function MatchdayInfoBar({ info }: { info: MatchdayInfo }) {
  const theme = useTheme();
  const nextDate = info.next_match_date
    ? new Date(info.next_match_date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.mist,
      }}
    >
      {info.last_match_number !== null ? (
        <Text variant="detail" color="slate">
          Last: Match {info.last_match_number}
        </Text>
      ) : (
        <View />
      )}
      <Text variant="detail" color="slate">
        {info.completed_count}/{info.total_count} played
      </Text>
      {nextDate ? (
        <Text variant="detail" color="slate">
          Next: {nextDate}
        </Text>
      ) : (
        <View />
      )}
    </View>
  );
}
