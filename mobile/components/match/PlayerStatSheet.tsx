import { Image } from 'expo-image';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { fontFamilies, useTheme, withOpacity } from '@/theme';
import {
  formatRating,
  playerPhotoUrl,
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
  const { height: screenHeight } = useWindowDimensions();
  // ⚠ `useState`, NOT `useRef`. The sibling sheets here hold their
  // `Animated.Value` in a ref, and for them that is fine — they only ever touch
  // it from an effect. This one INTERPOLATES it during render to build the
  // transform, which is reading a ref while rendering, and react-hooks/refs is
  // right to object. A lazy `useState` initialiser gives the same
  // create-once-per-mount behaviour without the lie about what it is for.
  const [slide] = useState(() => new Animated.Value(0));

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
  const photo = playerPhotoUrl(stat.externalPlayerId);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* Tapping away closes. The card swallows its own presses. */}
      <Pressable
        onPress={onClose}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}
      >
        {/* This wrapper exists only to swallow presses so a tap on the card
            does not close it. It deliberately has no height of its own. */}
        <Pressable onPress={() => {}}>
          <Animated.View
            style={{
              // ⚠⚠ POINTS, NOT A PERCENTAGE, AND THAT IS THE WHOLE BUG. This
              // was `maxHeight: '80%'`, and a percentage height resolves only
              // against a parent with a DEFINITE height. Its parent is the
              // press-swallowing wrapper above, which has none — so the cap
              // resolved against nothing, the card grew to its content, and the
              // ScrollView inside was never given a bound to scroll within. The
              // sheet ran off the bottom of the screen and stayed there.
              //
              // A measured height always resolves, whatever the parent is doing.
              // `ReactionsSheet` reaches for the same trick (`screenHeight *
              // 0.55`) rather than trusting percentage resolution through a
              // stack of wrappers, and it is right to.
              maxHeight: screenHeight * 0.85,
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radii.lg,
              borderTopRightRadius: theme.radii.lg,
              paddingBottom: insets.bottom + 16,
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
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: tint,
                  overflow: 'hidden',
                }}
              >
                {/* Number first, photo over it — the same fallback the pitch
                    uses, and for the same reason: a 404 renders nothing. */}
                <RNText
                  style={{
                    fontFamily: MONO_BOLD,
                    fontSize: 17,
                    color: '#FFFFFF',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {stat.shirtNumber ?? '–'}
                </RNText>
                {photo ? (
                  <Image
                    source={{ uri: photo }}
                    style={{ position: 'absolute', width: 48, height: 48 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    // Decorative: his name is directly beside it.
                    alt=""
                  />
                ) : null}
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
              // ⚠ THE ONLY PART THAT SHRINKS, and RN defaults `flexShrink` to
              // 0 where the web defaults to 1. The handle and the header are
              // fixed; this is what gives way when the card meets its cap, and
              // therefore what scrolls. Without the explicit shrink it holds its
              // full content height and pushes the rest off the screen.
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
              // ⚠ SHOWN, NOT HIDDEN. Ryan could not tell the sheet scrolled —
              // and while the real fault was that it did not, a long list with
              // no indicator gives a reader nothing to go on either way.
              showsVerticalScrollIndicator
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
