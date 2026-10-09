// Someone @-mentioned you in a pool's Banter: who, where, and what they said.
// Tapping opens that pool's Banter.
//
// ⚠ It opens the chat, not the message. The sheet has no scroll-to-message
// yet; a mention is almost always recent, so it is on the first screen anyway.

import { Text as RNText, View } from 'react-native';

import { avatarBackgroundFor, avatarIndexFor, groundInkFor } from '@/lib/avatarGradient';
import type { ActivityItem, MentionMeta } from '@/lib/useActivity';
import { Pressable } from '@/components/ui';
import { fontFamilies, useTheme } from '@/theme';

import { relativeTime } from './ActivityCard';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

export function MentionCard({ item, onPress }: { item: ActivityItem; onPress: (() => void) | null }) {
  const theme = useTheme();
  const m = (item.metadata ?? {}) as unknown as MentionMeta;
  const sender = m.sender_name ?? 'Someone';
  // Same colour the person has everywhere else: hashed from their user id.
  const idx = avatarIndexFor(m.sender_user_id ?? sender);

  return (
    <Pressable
      onPress={
        onPress
          ? () => {
              onPress();
            }
          : undefined
      }
      accessibilityRole="button"
      accessibilityLabel={`${sender} mentioned you in ${m.pool_name}: ${m.message_preview ?? ''}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md + 2,
        paddingLeft: theme.spacing.md + 4,
        paddingRight: theme.spacing.md + 2,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {!item.isRead ? (
        <View
          style={{
            position: 'absolute',
            left: 6,
            top: 24,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.colors.primary,
          }}
        />
      ) : null}
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: avatarBackgroundFor(idx),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RNText style={{ fontFamily: fontFamilies.black, fontSize: 13, color: groundInkFor(idx) }}>
          {initials(sender)}
        </RNText>
      </View>

      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
          <RNText
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: item.isRead ? fontFamilies.semibold : fontFamilies.bold,
              fontSize: 14,
              color: theme.colors.ink,
            }}
          >
            {sender} · {m.pool_name}
          </RNText>
          <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 10, color: theme.colors.slate }}>
            {relativeTime(item.createdAt)}
          </RNText>
        </View>
        {m.message_preview ? (
          <View
            style={{
              backgroundColor: theme.colors.mist,
              borderRadius: theme.radii.sm,
              borderTopLeftRadius: 4,
              paddingHorizontal: theme.spacing.sm + 2,
              paddingVertical: theme.spacing.sm,
            }}
          >
            <RNText
              numberOfLines={3}
              style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.ink }}
            >
              {m.message_preview}
            </RNText>
          </View>
        ) : null}
        {onPress ? (
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.primary }}>
            Reply in Banter
          </RNText>
        ) : null}
      </View>
    </Pressable>
  );
}
