import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text as RNText, View } from 'react-native';

import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type QuickAction = {
  key: string;
  emoji: string;
  label: string;
  description: string;
};

type Props = {
  open: boolean;
  actions: QuickAction[];
  onPick: (key: string) => void;
  onDismiss: () => void;
};

export function QuickActionsMenu({ open, actions, onPick, onDismiss }: Props) {
  const theme = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      speed: 26,
      bounciness: 8,
    }).start();
  }, [open, progress]);

  if (!open) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <>
      <Pressable
        onPress={onDismiss}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: theme.spacing.md,
          // Anchor to the + button's actual box (32px) plus a 4px gap.
          // Pixel-based so it never drifts when the composer row grows.
          bottom: 32 + theme.spacing.xs,
          transform: [{ translateY }],
          opacity: progress,
        }}
      >
        <View
          style={{
            minWidth: 240,
            backgroundColor: theme.colors.surface,
            borderRadius: 16,
            borderWidth: 0.5,
            borderColor: withOpacity(theme.colors.silver, 0.6),
            overflow: 'hidden',
            ...theme.shadows.card,
          }}
        >
          {actions.map((a, i) => (
            <Pressable
              key={a.key}
              onPress={() => onPick(a.key)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: 12,
                backgroundColor: pressed ? withOpacity(theme.colors.ink, 0.05) : 'transparent',
                borderTopWidth: i === 0 ? 0 : 0.5,
                borderTopColor: withOpacity(theme.colors.silver, 0.4),
              })}
            >
              <RNText style={{ fontSize: 20 }}>{a.emoji}</RNText>
              <View style={{ flex: 1, gap: 2 }}>
                <RNText
                  numberOfLines={1}
                  style={{
                    fontFamily: fontFamilies.bold,
                    fontSize: 14,
                    color: theme.colors.ink,
                  }}
                >
                  {a.label}
                </RNText>
                <RNText
                  numberOfLines={1}
                  style={{
                    fontFamily: fontFamilies.regular,
                    fontSize: 11,
                    color: theme.colors.slate,
                  }}
                >
                  {a.description}
                </RNText>
              </View>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </>
  );
}
