import { Pressable, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';

type PredictionsAlertBannerProps = {
  count: number;
  onPress?: () => void;
};

export function PredictionsAlertBanner({ count, onPress }: PredictionsAlertBannerProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md + 2,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.amberLight,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon name="exclamationmark.circle.fill" color="amber" size={22} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="cardTitle">
          {count} pool{count === 1 ? '' : 's'} need{count === 1 ? 's' : ''} predictions
        </Text>
        <Text variant="body" color="slate">
          Submit before the deadline
        </Text>
      </View>
      <Icon name="chevron.right" color="slate" size={14} weight="semibold" />
    </Pressable>
  );
}
