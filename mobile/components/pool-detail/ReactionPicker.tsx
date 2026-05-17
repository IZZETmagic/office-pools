import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text as RNText } from 'react-native';

import { useTheme, withOpacity } from '@/theme';

export const REACTION_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '👀'];

type Props = {
  visible: boolean;
  onPick: (emoji: string) => void;
};

export function ReactionPicker({ visible, onPick }: Props) {
  const theme = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      speed: 30,
      bounciness: 10,
    }).start();
  }, [visible, progress]);

  if (!visible) return null;

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <Animated.View
      style={{
        flexDirection: 'row',
        gap: 2,
        padding: 4,
        borderRadius: 22,
        backgroundColor: theme.colors.surface,
        borderWidth: 0.5,
        borderColor: withOpacity(theme.colors.silver, 0.6),
        opacity: progress,
        transform: [{ scale }, { translateY }],
        ...theme.shadows.card,
      }}
    >
      {REACTION_EMOJIS.map((emoji) => (
        <Pressable
          key={emoji}
          onPress={() => onPick(emoji)}
          hitSlop={4}
          style={({ pressed }) => ({
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? withOpacity(theme.colors.ink, 0.08) : 'transparent',
          })}
        >
          <RNText style={{ fontSize: 20, lineHeight: 22 }}>{emoji}</RNText>
        </Pressable>
      ))}
    </Animated.View>
  );
}
