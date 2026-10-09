import { Share, View } from 'react-native';

import { Button, Icon, Pressable, Text } from '@/components/ui';
import type { PoolSummary } from '@/lib/useHomeData';
import { useTheme, withOpacity } from '@/theme';

type InviteFriendsBannerProps = {
  pool: PoolSummary;
  /** The ×. Closes the card for this pool for good (lib/inviteCard.ts). */
  onClose: () => void;
};

export function InviteFriendsBanner({ pool, onClose }: InviteFriendsBannerProps) {
  const theme = useTheme();

  async function handleShare() {
    const url = `https://sportpool.io/join/${pool.poolCode}`;
    const message = `Join my prediction pool on SportPool!\n\n${url}`;
    try {
      await Share.share({ message, url });
    } catch {
      /* user cancelled */
    }
  }

  return (
    <View
      style={{
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radii.lg,
        backgroundColor: withOpacity(theme.colors.primary, 0.08),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Icon name="person.2.fill" color="primary" size={22} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="cardTitle">{pool.poolName} needs more players</Text>
          <Text variant="body" color="slate">
            {pool.memberCount} member{pool.memberCount === 1 ? '' : 's'} — invite friends to make it
            competitive
          </Text>
        </View>
        {/* The notifications-off card's ×, so the two close the same way. */}
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
          accessibilityHint={`Stops suggesting invites for ${pool.poolName}`}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.mist,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="xmark" tint={theme.colors.slate} size={11} weight="bold" />
        </Pressable>
      </View>
      <Button title="Share Invite" size="md" fullWidth onPress={handleShare} />
    </View>
  );
}
