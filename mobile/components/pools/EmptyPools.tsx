import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { useTheme, withOpacity } from '@/theme';

type EmptyPoolsProps = {
  /**
   * Called when the user taps "Join with Code". Parent screen opens the
   * JoinPoolSheet. Falls back to navigating to /join-pool if no callback
   * is provided (e.g. during transitions) — but the route is being
   * deprecated, so callers should always pass this.
   */
  onJoinPress?: () => void;
};

export function EmptyPools({ onJoinPress }: EmptyPoolsProps = {}) {
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
          // No-op fallback if the parent forgot to pass the callback — better
          // than navigating to a removed route. EmptyPools is only used inside
          // the Pools tab which always wires this up.
          onPress={onJoinPress ?? (() => {})}
        />
      </View>
    </View>
  );
}
