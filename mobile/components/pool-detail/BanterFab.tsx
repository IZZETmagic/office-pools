import { MessageMultiple01Icon } from '@hugeicons-pro/core-solid-rounded';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  unreadCount: number;
  onPress: () => void;
};

export function BanterFab({ unreadCount, onPress }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0)).current;
  const tapScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (unreadCount > 0) {
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [unreadCount, pulse]);

  function handlePressIn() {
    Animated.spring(tapScale, { toValue: 0.92, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  }
  function handlePressOut() {
    Animated.spring(tapScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 12 }).start();
  }

  const animatedScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: 16,
        bottom: Math.max(insets.bottom, 12) + 16,
      }}
    >
      <Animated.View style={{ transform: [{ scale: Animated.multiply(animatedScale, tapScale) }] }}>
        <Pressable
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          hitSlop={8}
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: 'rgba(255,255,255,0.3)',
            shadowColor: theme.colors.primary,
            shadowOpacity: unreadCount > 0 ? 0.55 : 0.3,
            shadowRadius: unreadCount > 0 ? 18 : 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          }}
        >
          {/* Hugeicons MessageMultiple01 — the "stacked chat bubbles"
              glyph. Imported directly (rather than going through the
              SF-symbol-name Icon map) because we want this exact icon
              specifically on the FAB, not anywhere else that references
              `bubble.left.and.bubble.right.fill` (profile notification
              rows, banter empty state). */}
          <HugeiconsIcon
            icon={MessageMultiple01Icon}
            size={26}
            color="#FFFFFF"
            strokeWidth={2.5}
          />
        </Pressable>
        {unreadCount > 0 ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 20,
              height: 20,
              paddingHorizontal: 6,
              borderRadius: 10,
              backgroundColor: theme.colors.red,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: withOpacity('#FFFFFF', 0.9),
            }}
          >
            <RNText
              style={{
                color: '#FFFFFF',
                fontFamily: fontFamilies.bold,
                fontSize: 11,
                lineHeight: 13,
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </RNText>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}
