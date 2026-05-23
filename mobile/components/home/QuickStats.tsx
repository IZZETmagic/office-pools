import { Platform, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';

type QuickStatsProps = {
  bestStreak: number;
  bestRank: number | null;
  totalPoints: number;
};

export function QuickStats({ bestStreak, bestRank, totalPoints }: QuickStatsProps) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
      <StatCard icon="flame.fill" tint="#EF4444" title="Streak" value={String(bestStreak)} />
      <StatCard
        icon="trophy.fill"
        tint="#D97706"
        title="Best Rank"
        value={bestRank !== null ? `#${bestRank}` : '--'}
      />
      <StatCard
        icon="bolt.fill"
        tint={theme.colors.primary}
        title="Points"
        value={totalPoints.toLocaleString()}
      />
    </View>
  );
}

function StatCard({
  icon,
  tint,
  title,
  value,
}: {
  icon: string;
  tint: string;
  title: string;
  value: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        paddingVertical: theme.spacing.md + 2,
        paddingHorizontal: theme.spacing.xs,
        alignItems: 'center',
        gap: theme.spacing.xs + 2,
        ...theme.shadows.card,
      }}
    >
      <Icon name={icon} size={16} tint={tint} weight="light" solid />
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 20,
          fontWeight: '800',
          color: theme.colors.ink,
        }}
      >
        {value}
      </RNText>
      <Text
        style={{
          fontSize: 10,
          letterSpacing: 1,
          color: theme.colors.slate,
          textTransform: 'uppercase',
          fontFamily: 'Nunito_700Bold',
        }}
      >
        {title}
      </Text>
    </View>
  );
}
