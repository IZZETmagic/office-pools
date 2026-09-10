import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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

import { MONO, MONO_BOLD } from '@/components/match/matchDisplay';
import { Icon } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';
import {
  formatRating,
  playerPhotoUrl,
  playerRates,
  positionName,
  subMinute,
  RATE_COVERS,
  RATING_COLOR,
  ratingScaleColor,
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
  substMinutes,
  onClose,
}: {
  stat: MatchPlayerStat | null;
  teamName: string;
  tint: string;
  /**
   * ⚠ THE MINUTES ONLY, AND ONLY TO CORROBORATE. A player cannot be joined to
   * the timeline — its names are abbreviated and carry no id — so this confirms
   * the minute his own row already implies rather than supplying one.
   */
  substMinutes: ReadonlySet<number>;
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
  const colour = ratingScaleColor(stat.rating);
  const rates = playerRates(stat);
  // ⚠ A rate carries its own counts, so the raw row it came from would print
  // the same fact twice. See RATE_COVERS.
  const covered = new Set(rates.map((r) => RATE_COVERS[r.label]).filter(Boolean));
  const groups = statGroups(stat)
    .map((g) => ({ ...g, rows: g.rows.filter((r) => !covered.has(r.label)) }))
    .filter((g) => g.rows.length > 0);
  const headline = headlineParts(stat, subMinute(stat, substMinutes));
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
              // ⚠ SO THE BAND REACHES THE ROUNDED CORNERS. The header runs
              // edge to edge and right to the top of the sheet; without this it
              // would square them off.
              overflow: 'hidden',
              paddingBottom: insets.bottom + 16,
              transform: [
                { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
              ],
            }}
          >
            {/* ---- who ---------------------------------------------- */}
            {/* ⚠ NO GRAB HANDLE. It suggested a drag this sheet never
                supported — it opens and closes, it does not snap — and the X
                below says the same thing without implying a gesture that does
                nothing. Tapping the backdrop still works. */}
            <LinearGradient
              colors={[
                withOpacity(tint, theme.mode === 'dark' ? 0.38 : 0.24),
                withOpacity(tint, 0),
              ]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{ paddingTop: 22, paddingBottom: 20, paddingHorizontal: 20 }}
            >
              <Pressable
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={({ pressed }) => ({
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  width: 32,
                  height: 32,
                  borderRadius: theme.radii.pill,
                  backgroundColor: withOpacity(theme.colors.ink, 0.08),
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                  zIndex: 2,
                })}
              >
                <Icon name="xmark" size={12} tint={theme.colors.ink} weight="semibold" />
              </Pressable>

              <View style={{ alignItems: 'center', gap: 3 }}>
                <View style={{ marginBottom: 10 }}>
                  {/* ⚠ THE GLOW IS A SHADOW ON A CIRCLE, the same trick
                      `CountdownHero` uses: a coloured shadow at zero offset with
                      a wide radius reads as light coming off the thing. There is
                      no radial gradient in React Native to do it properly. */}
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: -10,
                      left: -10,
                      width: 100,
                      height: 100,
                      borderRadius: theme.radii.pill,
                      backgroundColor: withOpacity(tint, 0.35),
                      shadowColor: tint,
                      shadowOpacity: 0.7,
                      shadowRadius: 22,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 12,
                    }}
                  />
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: theme.radii.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: tint,
                      borderWidth: 2,
                      borderColor: withOpacity(theme.colors.surface, 0.9),
                      overflow: 'hidden',
                    }}
                  >
                    {/* The position letter is the photograph's fallback — the
                        number lives under the name, as it does on the pitch. */}
                    <RNText
                      style={{ fontFamily: MONO, fontSize: 26, color: 'rgba(255,255,255,0.9)' }}
                    >
                      {stat.position ?? '·'}
                    </RNText>
                    {photo ? (
                      <Image
                        source={{ uri: photo }}
                        style={{ position: 'absolute', width: 80, height: 80 }}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        alt=""
                      />
                    ) : null}
                  </View>

                  {/* ⚠ ON THE PHOTOGRAPH'S TOP-RIGHT CORNER, exactly where it
                      sits on the pitch. The same badge in the same place on the
                      same face is one thing to learn, not two.

                      ⚠ MOSTLY OUTSIDE IT, THOUGH. At `right: -12` the badge is
                      44 wide against an 80pt photo and 32pt of it lay across the
                      face — 40% of the photograph's width, over the head rather
                      than the corner. At -26 that is 18pt, 22%, which clips hair
                      and background instead. There is room: the photo's right
                      edge is ~236pt and the X does not start until ~349pt. */}
                  {rating && colour ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -26,
                        minWidth: 44,
                        paddingHorizontal: 9,
                        paddingVertical: 5,
                        borderRadius: theme.radii.pill,
                        backgroundColor: colour,
                        alignItems: 'center',
                      }}
                    >
                      <RNText
                        style={{
                          fontFamily: MONO,
                          fontSize: 17,
                          color: '#FFFFFF',
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {rating}
                      </RNText>
                    </View>
                  ) : null}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  {stat.shirtNumber !== null ? (
                    <RNText
                      style={{
                        fontFamily: MONO,
                        fontSize: 16,
                        color: theme.colors.slate,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {stat.shirtNumber}
                    </RNText>
                  ) : null}
                  <RNText
                    numberOfLines={1}
                    style={{ fontFamily: fontFamilies.bold, fontSize: 21, color: theme.colors.ink }}
                  >
                    {stat.playerName}
                  </RNText>
                  {stat.isCaptain ? (
                    <View
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: theme.radii.pill,
                        backgroundColor: theme.colors.ink,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <RNText
                        style={{ fontFamily: MONO_BOLD, fontSize: 9, color: theme.colors.surface }}
                      >
                        C
                      </RNText>
                    </View>
                  ) : null}
                </View>

                <RNText
                  style={{
                    fontFamily: fontFamilies.semibold,
                    fontSize: 13,
                    color: theme.colors.ink,
                  }}
                >
                  {[positionName(stat.position), teamName].filter(Boolean).join(' · ')}
                </RNText>

                {headline.length > 0 ? (
                  <RNText
                    style={{
                      fontFamily: fontFamilies.regular,
                      fontSize: 12,
                      color: theme.colors.slate,
                    }}
                  >
                    {headline.join(' · ')}
                  </RNText>
                ) : null}
              </View>
            </LinearGradient>

            {/* ---- the numbers ---------------------------------------- */}
            <ScrollView
              // ⚠ THE ONLY PART THAT SHRINKS, and RN defaults `flexShrink` to
              // 0 where the web defaults to 1. The handle and the header are
              // fixed; this is what gives way when the card meets its cap, and
              // therefore what scrolls. Without the explicit shrink it holds its
              // full content height and pushes the rest off the screen.
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}
              // ⚠ SHOWN, NOT HIDDEN. Ryan could not tell the sheet scrolled —
              // and while the real fault was that it did not, a long list with
              // no indicator gives a reader nothing to go on either way.
              showsVerticalScrollIndicator
            >
              {/* ⚠⚠ THE RATES COME FIRST, AND THEY ARE THE POINT OF THE SHEET.
                  A column of raw counts tells you what happened; a rate tells
                  you whether it was any good, which is the question somebody
                  opened this to answer. They are derived from the counts below
                  rather than fetched — no extra column, no extra call. */}
              {rates.length > 0 ? (
                <View
                  style={{
                    backgroundColor: withOpacity(theme.colors.slate, 0.07),
                    borderRadius: theme.radii.md,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    marginBottom: 18,
                    gap: 12,
                  }}
                >
                  {rates.map((r) => {
                    const tone = r.band ? RATING_COLOR[r.band] : theme.colors.slate;
                    return (
                      <View key={r.label} style={{ gap: 5 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                          }}
                        >
                          <RNText
                            style={{
                              fontFamily: fontFamilies.medium,
                              fontSize: 13,
                              color: theme.colors.ink,
                            }}
                          >
                            {r.label}
                          </RNText>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                            <RNText
                              style={{
                                fontFamily: fontFamilies.regular,
                                fontSize: 11,
                                color: theme.colors.slate,
                              }}
                            >
                              {r.detail}
                            </RNText>
                            <RNText
                              style={{
                                fontFamily: MONO_BOLD,
                                fontSize: 15,
                                color: tone,
                                fontVariant: ['tabular-nums'],
                              }}
                            >
                              {r.pct}%
                            </RNText>
                          </View>
                        </View>
                        {/* ⚠ THE BAR IS THE VALUE, NOT A RANKING. It fills to the
                            percentage itself; the COLOUR is what carries how that
                            compares to everyone else in his position. Two
                            encodings of the same thing would be one too many. */}
                        <View
                          style={{
                            height: 4,
                            borderRadius: theme.radii.pill,
                            backgroundColor: withOpacity(theme.colors.slate, 0.15),
                            overflow: 'hidden',
                          }}
                        >
                          <View
                            style={{
                              width: `${Math.max(2, Math.min(100, r.pct))}%`,
                              height: 4,
                              borderRadius: theme.radii.pill,
                              backgroundColor: tone,
                            }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {groups.map((g) => (
                <View
                  key={g.title}
                  style={{
                    marginBottom: 12,
                    borderRadius: theme.radii.md,
                    borderWidth: 1,
                    borderColor: withOpacity(theme.colors.slate, 0.14),
                    paddingHorizontal: 14,
                    paddingTop: 10,
                    paddingBottom: 4,
                  }}
                >
                  <RNText
                    style={{
                      fontFamily: fontFamilies.semibold,
                      fontSize: 11,
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: theme.colors.slate,
                      marginBottom: 6,
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
                        borderTopColor: withOpacity(theme.colors.slate, 0.10),
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
