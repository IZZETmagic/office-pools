import { Animated, Easing, Modal, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { fontFamilies, useTheme, withOpacity } from '@/theme';
import {
  formatRating,
  ratingColor,
  statGroups,
  headlineParts,
  type MatchPlayerStat,
} from '@/lib/playerStats';

// =============================================================
// One player's afternoon
// =============================================================
// A vanilla RN `Modal` with an `Animated.View`, the pattern TeamPickerSheet and
// ShowdownRecapSheet already use here — not gorhom. The library buys gesture
// dismissal and a snap-point stack, and this sheet wants neither: it is a card
// you open, read and close.
//
// ⚠ IT IS A SHEET RATHER THAN AN INLINE CARD BECAUSE THE PITCH MUST NOT MOVE.
// The Line-ups tab lives inside a horizontal pager; expanding a panel under the
// pitch would reflow the tab mid-swipe and shift the player you just tapped out
// from under your thumb.
// =============================================================

export function PlayerStatSheet({
  stat,
  teamName,
  tint,
  onClose,
}: {
  stat: MatchPlayerStat | null;
  teamName: string;
  tint: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: stat ? 1 : 0,
      duration: stat ? 220 : 160,
      easing: stat ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [stat, slide]);

  if (!stat) return null;

  const rating = formatRating(stat.rating);
  const colour = ratingColor(stat.rating);
  const groups = statGroups(stat);
  const headline = headlineParts(stat);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* Tapping away closes. The card swallows its own presses. */}
      <Pressable
        onPress={onClose}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}
      >
        <Pressable onPress={() => {}}>
          <Animated.View
            style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radii.lg,
              borderTopRightRadius: theme.radii.lg,
              paddingBottom: insets.bottom + 16,
              maxHeight: '80%',
              transform: [
                { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
              ],
            }}
          >
            {/* Grab handle — decorative here, but its absence reads as a bug. */}
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: withOpacity(theme.colors.slate, 0.3),
                }}
              />
            </View>

            {/* ---- who ------------------------------------------------ */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 20,
                paddingTop: 8,
                paddingBottom: 14,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: tint,
                }}
              >
                <RNText
                  style={{
                    fontFamily: MONO_BOLD,
                    fontSize: 15,
                    color: '#FFFFFF',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {stat.shirtNumber ?? '–'}
                </RNText>
              </View>

              <View style={{ flex: 1 }}>
                <RNText
                  numberOfLines={1}
                  style={{ fontFamily: fontFamilies.bold, fontSize: 17, color: theme.colors.ink }}
                >
                  {stat.playerName}
                  {stat.isCaptain ? '  (C)' : ''}
                </RNText>
                <RNText
                  numberOfLines={1}
                  style={{
                    fontFamily: fontFamilies.regular,
                    fontSize: 13,
                    color: theme.colors.slate,
                    marginTop: 2,
                  }}
                >
                  {[teamName, ...headline].join(' · ')}
                </RNText>
              </View>

              {/* ⚠ The rating is absent, not zero, when the provider did not
                  give one — an unused substitute has no afternoon to rate. */}
              {rating && colour ? (
                <View
                  style={{
                    minWidth: 46,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: colour,
                    alignItems: 'center',
                  }}
                >
                  <RNText
                    style={{
                      fontFamily: MONO_BOLD,
                      fontSize: 16,
                      color: '#FFFFFF',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {rating}
                  </RNText>
                </View>
              ) : null}
            </View>

            {/* ---- the numbers ---------------------------------------- */}
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
            >
              {groups.map((g) => (
                <View key={g.title} style={{ marginBottom: 18 }}>
                  <RNText
                    style={{
                      fontFamily: fontFamilies.semibold,
                      fontSize: 11,
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: theme.colors.slate,
                      marginBottom: 8,
                    }}
                  >
                    {g.title}
                  </RNText>
                  {g.rows.map((r, i) => (
                    <View
                      key={r.label}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingVertical: 7,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: withOpacity(theme.colors.slate, 0.12),
                      }}
                    >
                      <RNText
                        style={{
                          fontFamily: fontFamilies.regular,
                          fontSize: 14,
                          color: theme.colors.slate,
                        }}
                      >
                        {r.label}
                      </RNText>
                      <RNText
                        style={{
                          fontFamily: MONO_BOLD,
                          fontSize: 14,
                          color: theme.colors.ink,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {r.value}
                      </RNText>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
