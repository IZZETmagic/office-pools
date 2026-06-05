import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import type { BadgeInfo } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type BadgeDetailSheetHandle = {
  open: (badge: BadgeInfo, earned: boolean) => void;
  close: () => void;
};

// Badge icon mapping is shared with FormTab via ./badge-icons so the chip
// in the form tab and this detail sheet always render the same glyph for
// a given badge ID. Previously these two files maintained independent
// maps and drifted — unlocked badges like lightning_rod / stadium_regular
// rendered as a generic star here because the entries were missing.
import { badgeIcon } from './badge-icons';

function rarityColorFor(theme: ReturnType<typeof useTheme>, rarity: string): string {
  switch (rarity) {
    case 'Common':
      return theme.colors.slate;
    case 'Uncommon':
      return theme.colors.green;
    case 'Rare':
      return theme.colors.primary;
    case 'Very Rare':
      return '#1281E2';
    case 'Legendary':
      return theme.colors.accent;
    default:
      return theme.colors.slate;
  }
}

export const BadgeDetailSheet = forwardRef<BadgeDetailSheetHandle>(
  function BadgeDetailSheet(_, ref) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const [visible, setVisible] = useState(false);
    const [badge, setBadge] = useState<BadgeInfo | null>(null);
    const [earned, setEarned] = useState(false);
    const screenHeight = Dimensions.get('window').height;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(screenHeight)).current;

    useImperativeHandle(ref, () => ({
      open: (b, e) => {
        setBadge(b);
        setEarned(e);
        setVisible(true);
      },
      close: () => animateOut(),
    }));

    function animateIn() {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }

    function animateOut() {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: screenHeight,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => setVisible(false));
    }

    useEffect(() => {
      if (visible) animateIn();
    }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    function handleClose() {
      animateOut();
    }

    if (!badge) {
      return (
        <Modal
          visible={visible}
          transparent
          animationType="none"
          onRequestClose={handleClose}
        />
      );
    }

    const color = rarityColorFor(theme, badge.rarity);
    const icon = badgeIcon(badge.id);

    return (
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={handleClose}
        statusBarTranslucent
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: '#000000',
              opacity: backdropOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.4],
              }),
            }}
          >
            <Pressable style={{ flex: 1 }} onPress={handleClose} />
          </Animated.View>
          <Animated.View
            style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radii.xl,
              borderTopRightRadius: theme.radii.xl,
              paddingTop: theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              paddingBottom: insets.bottom + theme.spacing.lg,
              gap: theme.spacing.md,
              transform: [{ translateY }],
            }}
          >
            <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
              <Pressable
                onPress={handleClose}
                hitSlop={theme.spacing.md}
                accessibilityLabel="Close"
                accessibilityRole="button"
                style={({ pressed }) => ({
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: 32,
                  height: 32,
                  borderRadius: theme.radii.pill,
                  backgroundColor: withOpacity(theme.colors.ink, 0.06),
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                  zIndex: 1,
                })}
              >
                <Icon name="xmark" size={12} tint={theme.colors.ink} weight="semibold" />
              </Pressable>

              <View
                style={{
                  width: 128,
                  height: 128,
                  borderRadius: 64,
                  backgroundColor: earned && icon.png
                    ? 'transparent'
                    : earned
                      ? withOpacity(color, 0.15)
                      : theme.colors.mist,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {earned ? (
                  icon.png ? (
                    <Image source={icon.png} style={{ width: 128, height: 128 }} resizeMode="contain" />
                  ) : (
                    <Icon name={icon.ios} size={52} tint={color} weight="semibold" />
                  )
                ) : (
                  <Icon name="lock.fill" size={40} tint={theme.colors.slate} weight="semibold" />
                )}
              </View>

              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 20,
                  color: earned ? theme.colors.ink : theme.colors.slate,
                  textAlign: 'center',
                }}
                numberOfLines={2}
              >
                {badge.name}
              </RNText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                <View
                  style={{
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: theme.spacing.xxs,
                    borderRadius: theme.radii.pill,
                    backgroundColor: withOpacity(color, 0.15),
                  }}
                >
                  <RNText
                    style={{
                      fontFamily: fontFamilies.bold,
                      fontSize: 10,
                      color,
                      letterSpacing: 0.4,
                    }}
                  >
                    {badge.rarity.toUpperCase()}
                  </RNText>
                </View>
                {badge.tier ? (
                  <RNText
                    style={{
                      fontFamily: fontFamilies.semibold,
                      fontSize: 11,
                      color: theme.colors.slate,
                    }}
                  >
                    {badge.tier}
                  </RNText>
                ) : null}
              </View>
            </View>

            {/* XP bonus pill */}
            <View
              style={{
                alignSelf: 'center',
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.xs,
                borderRadius: theme.radii.pill,
                backgroundColor: withOpacity(theme.colors.accent, 0.08),
                borderWidth: theme.borders.standard,
                borderColor: withOpacity(theme.colors.accent, 0.2),
              }}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 12,
                  color: theme.colors.slate,
                }}
              >
                XP Bonus
              </RNText>
              <RNText
                style={{
                  fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                  fontSize: 14,
                  fontWeight: '800',
                  color: theme.colors.accent,
                  fontVariant: ['tabular-nums'],
                }}
              >
                +{badge.xp_bonus} XP
              </RNText>
            </View>

            {/* Condition */}
            <View
              style={{
                gap: theme.spacing.xs,
                padding: theme.spacing.md,
                borderRadius: theme.radii.md,
                backgroundColor: withOpacity(theme.colors.primary, 0.06),
                borderWidth: theme.borders.standard,
                borderColor: withOpacity(theme.colors.primary, 0.15),
              }}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 11,
                  letterSpacing: 0.6,
                  color: theme.colors.primary,
                  textTransform: 'uppercase',
                }}
              >
                {earned ? 'How you earned it' : 'How to earn'}
              </RNText>
              <RNText
                style={{
                  fontFamily: fontFamilies.regular,
                  fontSize: 14,
                  color: theme.colors.ink,
                  lineHeight: 20,
                }}
              >
                {badge.condition}
              </RNText>
            </View>

          </Animated.View>
        </View>
      </Modal>
    );
  },
);
