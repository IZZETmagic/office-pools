import { Pressable, Text as RNText, View } from 'react-native';

import type { ReactionAggregate } from '@/lib/usePoolBanter';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  aggregates: ReactionAggregate[];
  currentUserId: string | null;
  isOwn: boolean;
  onToggle: (emoji: string) => void;
};

export function ReactionPills({ aggregates, currentUserId, isOwn, onToggle }: Props) {
  const theme = useTheme();
  if (aggregates.length === 0) return null;

  const sorted = [...aggregates].sort((a, b) => b.count - a.count);

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 4,
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        paddingLeft: isOwn ? 0 : 34,
      }}
    >
      {sorted.map((a) => {
        const reacted = !!currentUserId && a.userIds.includes(currentUserId);
        return (
          <Pressable
            key={a.emoji}
            onPress={() => onToggle(a.emoji)}
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
              borderWidth: 1,
              borderColor: reacted
                ? withOpacity(theme.colors.primary, 0.4)
                : 'transparent',
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
