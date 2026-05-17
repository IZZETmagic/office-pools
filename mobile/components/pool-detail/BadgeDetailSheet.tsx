import { SymbolView } from 'expo-symbols';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BadgeInfo } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type BadgeDetailSheetHandle = {
  open: (badge: BadgeInfo, earned: boolean) => void;
  close: () => void;
};

type BadgeIconSpec = { ios: string; emoji: string };

const BADGE_ICONS: Record<string, BadgeIconSpec> = {
  bullseye: { ios: 'scope', emoji: '🎯' },
  sharpshooter: { ios: 'target', emoji: '🏹' },
  marksman: { ios: 'dot.scope', emoji: '🎯' },
  hot_streak: { ios: 'flame.fill', emoji: '🔥' },
  unstoppable: { ios: 'bolt.fill', emoji: '⚡' },
  perfectionist: { ios: 'star.circle.fill', emoji: '💯' },
  underdog: { ios: 'dice.fill', emoji: '🎰' },
  giant_slayer: { ios: 'figure.boxing', emoji: '🥊' },
  oracle: { ios: 'eye.fill', emoji: '👁️' },
  prophet: { ios: 'crystal.ball', emoji: '🔮' },
  group_master: { ios: 'square.grid.3x3.fill', emoji: '🧩' },
  knockout_king: { ios: 'crown.fill', emoji: '👑' },
  bracket_buster: { ios: 'sparkles', emoji: '✨' },
  showtime: { ios: 'sparkles', emoji: '✨' },
  grand_finale: { ios: 'trophy.fill', emoji: '🏆' },
  legend: { ios: 'star.fill', emoji: '⭐' },
  // Bracket Picker badges
  bp_cartographer: { ios: 'map.fill', emoji: '🗺️' },
  bp_world_map: { ios: 'globe', emoji: '🌍' },
  bp_bracket_prophet: { ios: 'eye.fill', emoji: '👁️' },
  bp_architect: { ios: 'building.2.fill', emoji: '🏛️' },
  bp_sniper: { ios: 'scope', emoji: '🎯' },
  bp_final_four: { ios: 'trophy.fill', emoji: '🏆' },
  bp_perfect_bracket: { ios: 'star.fill', emoji: '⭐' },
  bp_upset_specialist: { ios: 'exclamationmark.triangle.fill', emoji: '⚠️' },
  bp_group_guardian: { ios: 'shield.fill', emoji: '🛡️' },
  bp_quick_draw: { ios: 'bolt.fill', emoji: '⚡' },
  bp_full_bracket: { ios: 'checklist', emoji: '✅' },
};
const FALLBACK_ICON: BadgeIconSpec = { ios: 'star.fill', emoji: '⭐' };

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
    const icon = BADGE_ICONS[badge.id] ?? FALLBACK_ICON;

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
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: theme.radii.pill,
                  backgroundColor: earned
                    ? withOpacity(color, 0.15)
                    : theme.colors.mist,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {earned ? (
                  Platform.OS === 'ios' ? (
                    <SymbolView
                      name={icon.ios as never}
                      size={28}
                      tintColor={color}
                      weight="semibold"
                      resizeMode="scaleAspectFit"
                    />
                  ) : (
                    <RNText style={{ fontSize: 30, lineHeight: 34 }}>{icon.emoji}</RNText>
                  )
                ) : Platform.OS === 'ios' ? (
                  <SymbolView
                    name="lock.fill"
                    size={22}
                    tintColor={theme.colors.slate}
                    weight="semibold"
                    resizeMode="scaleAspectFit"
                  />
                ) : (
                  <RNText style={{ fontSize: 24, color: theme.colors.slate }}>🔒</RNText>
                )}
              </View>

              <View style={{ flex: 1, gap: theme.spacing.xxs }}>
                <RNText
                  style={{
                    fontFamily: fontFamilies.bold,
                    fontSize: 18,
                    color: earned ? theme.colors.ink : theme.colors.slate,
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

              <Pressable
                onPress={handleClose}
                hitSlop={theme.spacing.md}
                accessibilityLabel="Close"
                accessibilityRole="button"
                style={({ pressed }) => ({
                  width: 32,
                  height: 32,
                  borderRadius: theme.radii.pill,
                  backgroundColor: withOpacity(theme.colors.ink, 0.06),
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                {Platform.OS === 'ios' ? (
                  <SymbolView
                    name="xmark"
                    size={12}
                    tintColor={theme.colors.ink}
                    weight="semibold"
                  />
                ) : (
                  <RNText
                    style={{
                      fontSize: 14,
                      color: theme.colors.ink,
                      fontWeight: '700',
                      lineHeight: 14,
                    }}
                  >
                    ✕
                  </RNText>
                )}
              </Pressable>
            </View>

            {/* XP bonus row */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radii.md,
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
                  fontSize: 16,
                  fontWeight: '800',
                  color: theme.colors.accent,
                  fontVariant: ['tabular-nums'],
                }}
              >
                +{badge.xp_bonus} XP
              </RNText>
            </View>

            {/* Condition */}
            <View style={{ gap: theme.spacing.xs }}>
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 11,
                  letterSpacing: 0.6,
                  color: theme.colors.slate,
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

            {/* Status pill */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.spacing.xs,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radii.md,
                backgroundColor: earned
                  ? withOpacity(theme.colors.green, 0.12)
                  : withOpacity(theme.colors.slate, 0.08),
              }}
            >
              {Platform.OS === 'ios' ? (
                <SymbolView
                  name={earned ? 'checkmark.seal.fill' : 'lock.fill'}
                  size={12}
                  tintColor={earned ? theme.colors.green : theme.colors.slate}
                  weight="semibold"
                />
              ) : (
                <RNText
                  style={{
                    fontSize: 12,
                    color: earned ? theme.colors.green : theme.colors.slate,
                  }}
                >
                  {earned ? '✓' : '🔒'}
                </RNText>
              )}
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 12,
                  color: earned ? theme.colors.green : theme.colors.slate,
                  letterSpacing: 0.3,
                }}
              >
                {earned ? 'EARNED' : 'LOCKED'}
              </RNText>
            </View>
          </Animated.View>
        </View>
      </Modal>
    );
  },
);
