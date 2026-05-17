import { Alert, View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { useTheme, withOpacity } from '@/theme';

export function EmptyHome() {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xl,
        paddingVertical: theme.spacing.xxxl,
      }}
    >
      <View
        style={{
          width: 128,
          height: 128,
          borderRadius: theme.radii.pill,
          backgroundColor: withOpacity(theme.colors.accent, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: theme.radii.pill,
            backgroundColor: withOpacity(theme.colors.accent, 0.18),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="trophy.fill" color="accent" size={48} />
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm, alignItems: 'center', paddingHorizontal: theme.spacing.lg }}>
        <Text variant="sectionHeader" align="center">
          Better with friends
        </Text>
        <Text variant="body" color="slate" align="center">
          Create a pool or join one with a code to start predicting the World Cup together.
        </Text>
      </View>

      <View style={{ gap: theme.spacing.md, alignSelf: 'stretch', paddingHorizontal: theme.spacing.lg }}>
        <Button
          title="Create a Pool"
          size="lg"
          fullWidth
          onPress={() => Alert.alert('Coming soon', 'Create-pool flow ships in the next session.')}
        />
        <Button
          title="Join with Code"
          variant="secondary"
          size="lg"
          fullWidth
          onPress={() => Alert.alert('Coming soon', 'Join-pool flow ships in the next session.')}
        />
      </View>

      <Text variant="detail" color="slate" align="center">
        Pools are more fun with 4+ people
      </Text>
    </View>
  );
}
