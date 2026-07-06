import { Pressable, Text as RNText, View } from 'react-native';

import type { ReactionAggregate } from '@/lib/usePoolBanter';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  aggregates: ReactionAggregate[];
  currentUserId: string | null;
  isOwn: boolean;
  // Tapping any pill opens the "who reacted" sheet for the whole message
  // (adding/removing your own reaction is done via the long-press picker).
  onPress: () => void;
};

export function ReactionPills({ aggregates, currentUserId, isOwn, onPress }: Props) {
  const theme = useTheme();
  if (aggregates.length === 0) return null;

  const sorted = [...aggregates].sort((a, b) => b.count - a.count);

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        // Lift the reactions up onto the bubble's bottom edge (iMessage /
        // WhatsApp style) and hug the bubble's near corner — left edge for
        // received, right edge for own — instead of floating in a gap below.
        // Received no longer needs the 34px avatar offset: ReactionPills already
        // renders inside the post-avatar bubble column, so it was over-indented.
        marginTop: -6,
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        paddingLeft: isOwn ? 0 : 10,
        paddingRight: isOwn ? 10 : 0,
      }}
    >
      {sorted.map((a) => {
        const reacted = !!currentUserId && a.userIds.includes(currentUserId);
        return (
          <Pressable
            key={a.emoji}
            onPress={onPress}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 14,
              backgroundColor: reacted
                ? withOpacity(theme.colors.primary, 0.14)
                : theme.colors.mist,
              // Outline ring the colour of the chat background (snow) so the
              // pill reads as "cut out" and pops off the message bubble it
              // overlaps — near-white in light mode, near-black in dark. Reacted
              // state stays legible via the tinted fill + blue count below.
              borderWidth: 2,
              borderColor: theme.colors.snow,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <RNText style={{ fontSize: 13, lineHeight: 15 }}>{a.emoji}</RNText>
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 11,
                color: reacted ? theme.colors.primary : theme.colors.slate,
                fontVariant: ['tabular-nums'],
              }}
            >
              {a.count}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}
