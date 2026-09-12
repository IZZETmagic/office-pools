import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MONO, MONO_BOLD } from '@/components/match/matchDisplay';
import { Icon, Text } from '@/components/ui';
import { withLightness } from '@/lib/design/oklch';
import { useTheme, withOpacity } from '@/theme';
import {
  formatRating,
  playerPhotoUrl,
  playerRates,
  positionName,
  statIsZero,
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

/**
 * How light the header's colour is made, in light mode.
 *
 * ⚠⚠ A LIGHTNESS, NOT AN OPACITY, AND THE DIFFERENCE IS WHICH CLUBS SURVIVE.
 * The header was `tint` at 24% over snow, which is washed out — but simply
 * turning the opacity up does not work, because the text on it is DARK: at 45%
 * a black-shirted club (Fulham) drops the ink to 4.37:1 and at 65% to 2.13:1.
 * Opacity moves every club's lightness by a different amount, so one number
 * cannot be right for Arsenal red and Fulham black at once.
 *
 * Setting the LIGHTNESS lands every club in the same band whatever it started
 * as. At 0.84 they are properly coloured — Arsenal #FF826E, Everton #8BC8FF —
 * and the worst ink contrast across six very different clubs is 6.37:1.
 */
const HEADER_LIGHTNESS = 0.84;

/**
 * How far the header's colour fades, in points.
 *
 * ⚠ A DISTANCE, NOT A PROPORTION, WHICH IS THE WHOLE POINT. The header's height
 * depends on its content — a headline of "Minutes played 90 · 3 goals · 2
 * assists" wraps where "Minutes played 90" does not — so a gradient that ends
 * at its own bottom edge stretches with it and leaves a bigger slab of flat
 * colour at the top each time. 220 covers the tallest realistic header (~202pt)
 * and overshoots the shortest (~189pt), so the colour runs on into the list
 * rather than stopping at a seam.
 */
const HEADER_FADE = 220;

export function PlayerStatSheet({
  stat,
  teamName,
  tint,
  substMinutes,
  clock,
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
  /** See `statsClock` in playerStats — a live match is not a 90-minute one. */
  clock: number;
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
  const headline = headlineParts(stat, subMinute(stat, substMinutes, clock));
  const photo = playerPhotoUrl(stat.externalPlayerId);
  // ⚠ Dark mode keeps the translucent tint, which reads well over a dark
  // surface. Light mode needs a colour of its own — see HEADER_LIGHTNESS.
  const headerColor = theme.mode === 'dark' ? tint : withLightness(tint, HEADER_LIGHTNESS);
  const headerAlpha = theme.mode === 'dark' ? 0.38 : 1;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* ⚠⚠ THE BACKDROP IS A SIBLING OF THE CARD, NOT ITS PARENT, AND THIS IS
          WHY THE LIST SCROLLS. It used to be a `Pressable` wrapping everything,
          with a second `Pressable` inside it to swallow taps on the card — so
          the ScrollView sat inside TWO of them. A Pressable claims the touch
          responder on touch-START, which means the scroll gesture never reached
          the list: it was not a height problem at all, and no amount of
          `maxHeight`, `flexShrink` or `flex` was ever going to fix it.

          As a sibling the backdrop still catches every tap outside the card,
          the card intercepts nothing, and the swallowing Pressable is not
          needed because there is no longer anything to swallow. This is exactly
          how `ReactionsSheet` is built, which is why that one has always
          scrolled. */}
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
        />
        <Animated.View
            style={{
              // ⚠⚠ A DEFINITE HEIGHT, AND `maxHeight` WAS NOT ENOUGH. This is
              // the second go at this bug, so it is worth writing down what
              // actually differs.
              //
              // The first fix moved the cap from a percentage to points, which
              // was necessary — a percentage resolves only against a parent
              // with a definite height, and the press-swallowing wrapper above
              // has none. But it was not sufficient. `maxHeight` still leaves
              // this view's height AUTO, so Yoga has no fixed box to hand the
              // ScrollView, the ScrollView sizes to its own content, and the
              // content runs off the bottom exactly as before.
              //
              // `ReactionsSheet` — the sheet in this app that demonstrably
              // scrolls — uses a real `height` with `flex: 1` on its list, and
              // that pairing is the point: `flex: 1` distributes REMAINING
              // space, and there is no remainder until something is definite.
              //
              // The cost is a short player leaving space at the bottom, which
              // is the trade ReactionsSheet's own comment accepts. This card is
              // ~690pt at its shortest against a 717pt box on a 844pt phone, so
              // the gap is small and the scrolling is not optional.
              height: screenHeight * 0.85,
              // ⚠ SNOW, NOT SURFACE, AND THAT IS THE WHOLE RESTRUCTURE. Cards
              // in this app are `surface` on `snow` — that is the relationship
              // every screen uses and the one `shadows.card` is drawn for. The
              // sheet was `surface`, so its cards could not be surface too and
              // had to invent borders and tinted fills to separate at all. Make
              // the body a screen and the cards can just be cards.
              backgroundColor: theme.colors.snow,
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
            {/* ⚠⚠ A FIXED HEIGHT BEHIND THE CONTENT, NOT A BACKGROUND ON IT.
                The gradient used to BE the header, so `end: y 1` meant "the
                bottom of whatever this contains" — a proportion. Give a
                player three goals and an assist, the headline wraps, the
                header grows, and the same ramp spreads over more pixels: the
                top stays above 80% alpha for 38pt on a short card and 50pt on
                a tall one, which is the solid bar. Anchored to a fixed
                distance the fade is identical however tall the header gets.

                ⚠ AND IT IS ALLOWED TO OVERSHOOT. At 220 it reaches a little
                past the header on most players, so the colour carries on into
                the top of the list instead of stopping at a seam — which is
                the "keeps going down" part.

                ⚠ THREE STOPS, NOT TWO. A straight 1 -> 0 ramp has its flattest
                stretch at the top, exactly where the eye is. Dropping to 0.5
                in the first third kills the slab and leaves a long soft tail. */}
            <LinearGradient
              // ⚠ Fades to the SAME colour at zero alpha, never 'transparent':
              // a literal transparent fades through black on iOS.
              colors={[
                withOpacity(headerColor, headerAlpha),
                withOpacity(headerColor, headerAlpha * 0.5),
                withOpacity(headerColor, 0),
              ]}
              locations={[0, 0.34, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              pointerEvents="none"
              style={{ position: 'absolute', left: 0, right: 0, top: 0, height: HEADER_FADE }}
            />

            {/* ---- who ---------------------------------------------- */}
            {/* ⚠ NO GRAB HANDLE. It suggested a drag this sheet never
                supported — it opens and closes, it does not snap — and the X
                below says the same thing without implying a gesture that does
                nothing. Tapping the backdrop still works. */}
            <View style={{ paddingTop: 22, paddingBottom: 20, paddingHorizontal: 20 }}>

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
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: theme.radii.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: tint,
                      // ⚠ NO BORDER AND NO GLOW. Both were tried and both read
                      // as a ring around the face rather than as light. The
                      // photograph separates on its own: these are cutouts on a
                      // pale background, sitting on a header that now carries a
                      // real colour rather than a wash of one.
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
                  {/* ⚠ `sectionHeader`, A REAL TOKEN — Nunito Black at 20/24.
                      This was hand-set bold at 21, which is a size the app does
                      not have. His name IS the heading of this sheet. */}
                  <Text variant="sectionHeader" numberOfLines={1}>
                    {stat.playerName}
                  </Text>
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

                <Text variant="body">
                  {[positionName(stat.position), teamName].filter(Boolean).join(' · ')}
                </Text>

                {headline.length > 0 ? (
                  <Text variant="detail" color="slate">
                    {headline.join(' · ')}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* ---- the numbers ---------------------------------------- */}
            <ScrollView
              // ⚠ `flex: 1`, NOT `flexShrink: 1`. Shrinking only applies once
              // something is over-full; taking the remainder works whenever the
              // parent is a known size, which it now is. The header above is
              // fixed, so the remainder is exactly what this gets.
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}
              // ⚠ SHOWN, NOT HIDDEN. Ryan could not tell the sheet scrolled —
              // and while the real fault was that it did not, a long list with
              // no indicator gives a reader nothing to go on either way.
              showsVerticalScrollIndicator
            >
              {groups.map((g) => {
                const mine = rates.filter((r) => r.section === g.title);
                return (
                  <View
                    key={g.title}
                    style={{
                      marginBottom: theme.spacing.md,
                      backgroundColor: theme.colors.surface,
                      borderRadius: theme.radii.lg,
                      ...theme.shadows.card,
                      overflow: 'hidden',
                    }}
                  >
                    {/* ⚠ `cardTitle`, THE SAME HEADER THE STATS TAB USES. Mine
                        was 11pt uppercase on a tinted strip — a vocabulary this
                        app does not have anywhere else. A section title is
                        `cardTitle`, and it needs no accent to stand out once it
                        is 16pt bold on its own card. */}
                    <View
                      style={{
                        paddingHorizontal: theme.spacing.lg,
                        paddingTop: theme.spacing.lg - 2,
                        paddingBottom: mine.length > 0 ? theme.spacing.md : theme.spacing.xs,
                      }}
                    >
                      <Text variant="cardTitle">{g.title}</Text>
                    </View>

                    {/* ⚠⚠ THE RATE LEADS ITS OWN SECTION rather than sitting in
                        a block of its own above everything. A reader after
                        passing found the accuracy in one place and the key
                        passes in another; they are one topic and now one card. */}
                    {mine.map((r) => {
                      const tone = r.band ? RATING_COLOR[r.band] : theme.colors.slate;
                      return (
                        <View
                          key={r.label}
                          style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md, gap: 6 }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'baseline',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Text variant="body">{r.label}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                              <Text variant="detail" color="slate">
                                {r.detail}
                              </Text>
                              <RNText
                                style={{
                                  fontFamily: MONO_BOLD,
                                  fontSize: 17,
                                  color: tone,
                                  fontVariant: ['tabular-nums'],
                                }}
                              >
                                {r.pct}%
                              </RNText>
                            </View>
                          </View>
                          {/* ⚠ The bar is the VALUE; the colour is how it
                              compares to everyone else in his position. */}
                          <View
                            style={{
                              height: 6,
                              borderRadius: theme.radii.pill,
                              backgroundColor: withOpacity(theme.colors.mist, 0.9),
                              overflow: 'hidden',
                            }}
                          >
                            <View
                              style={{
                                width: `${Math.max(2, Math.min(100, r.pct))}%`,
                                height: 6,
                                borderRadius: theme.radii.pill,
                                backgroundColor: tone,
                              }}
                            />
                          </View>
                        </View>
                      );
                    })}

                    {g.rows.map((r, i) => {
                      // ⚠ A zero is quieter by WEIGHT, never by being fainter:
                      // `slate` is only 5.56:1 on this card to begin with, so
                      // there is no headroom to dim into.
                      const empty = statIsZero(r.value);
                      const [lead, ...rest] = r.value.split(' ');
                      return (
                        <View
                          key={r.label}
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            paddingHorizontal: theme.spacing.lg,
                            paddingVertical: 9,
                            borderTopWidth: i === 0 && mine.length === 0 ? 0 : 1,
                            borderTopColor: withOpacity(theme.colors.silver, 0.45),
                          }}
                        >
                          <Text variant="body" color="slate">
                            {r.label}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                            <RNText
                              style={{
                                fontFamily: empty ? MONO : MONO_BOLD,
                                fontSize: empty ? 14 : 17,
                                color: empty ? theme.colors.slate : theme.colors.ink,
                                fontVariant: ['tabular-nums'],
                              }}
                            >
                              {lead}
                            </RNText>
                            {rest.length > 0 ? (
                              <RNText
                                style={{
                                  fontFamily: MONO,
                                  fontSize: 12,
                                  color: theme.colors.slate,
                                  fontVariant: ['tabular-nums'],
                                }}
                              >
                                {rest.join(' ')}
                              </RNText>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                    <View style={{ height: theme.spacing.sm }} />
                  </View>
                );
              })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
