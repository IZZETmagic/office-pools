import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { useTheme, withOpacity } from '@/theme';

export function EmptyPools() {
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
          No pools yet
        </Text>
        <Text variant="body" color="slate" align="center">
          Join a pool with a code or create a new one to get started.
        </Text>
      </View>

      <View style={{ gap: theme.spacing.md, alignSelf: 'stretch', paddingHorizontal: theme.spacing.lg }}>
        <Button
          title="Create a Pool"
          size="lg"
          fullWidth
          onPress={() => router.navigate('/create-pool')}
        />
        <Button
          title="Join with Code"
          variant="secondary"
          size="lg"
          fullWidth
          onPress={() => router.navigate('/join-pool')}
        />
      </View>
    </View>
  );
}
