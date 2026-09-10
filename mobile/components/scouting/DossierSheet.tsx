import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Dossier } from '@/components/scouting/Dossier';
import { Icon, Text } from '@/components/ui';
import { getInitials, gradientForUser } from '@/lib/avatarGradient';
import { withLightness } from '@/lib/design/oklch';
import { useDossier } from '@/lib/useDossier';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// The scout report, as a sheet
// =============================================================
// ⚠ IT WAS A ROUTE AND IT SHOULD NOT HAVE BEEN. A pushed screen gets the
// router's own chrome, stacks on the back history, and — on a duel — takes you
// away from the thing you opened it to think about. A scout report is something
// you glance at with the duel still behind it. Ryan, 2026-09-09.
//
// ## ⚠ THE SHELL IS `PlayerStatSheet`'s, DELIBERATELY AND ALMOST EXACTLY
//
// Same vanilla RN `Modal` + `Animated.View` — not gorhom, which buys gesture
// dismissal and a snap stack this wants neither of. Same three structural
// decisions, and every one of them was a bug there first:
//
//   1. THE BACKDROP IS A SIBLING OF THE CARD, NOT ITS PARENT. A `Pressable`
//      claims the touch responder on touch-START, so a ScrollView inside one
//      never receives the scroll gesture. That sheet spent two attempts on
//      `maxHeight` before finding it was never a height problem.
//   2. A DEFINITE `height`, NOT `maxHeight`. `maxHeight` leaves the box auto,
//      Yoga hands the ScrollView no fixed height, and the content runs off the
//      bottom. `flex: 1` distributes what REMAINS, and nothing remains until
//      something is definite.
//   3. THE HEADER GRADIENT IS A FIXED HEIGHT BEHIND THE CONTENT, not a
//      background on it. Anchored to a distance the fade looks identical
//      however tall the header grows; anchored to the content it re-spreads
//      every time a name wraps.
//
// ⚠ THE TINT IS THE MEMBER'S OWN COLOUR. The player sheet uses the club's;
// the equivalent for a person is the avatar gradient, which is keyed on their
// user id and frozen so they are the same colour here, in Banter and on the
// duel card. That is what makes this read as *them* rather than as a panel.
//
// ⚠ NO RANK BADGE ON THE AVATAR, THOUGH THE PLAYER SHEET PUTS A RATING THERE.
// Ryan removed it 2026-09-10. A rating is what that sheet is ABOUT; a pool
// position is not what this one is about — the report is how somebody picks,
// and their standing is a different fact that the season total already covers
// in the line below. The server still sends `standing.rank`, correctly withheld
// in Last Man Standing, so a surface that does want it has it.
// =============================================================

/** Same value the player sheet lands club colours on. See its note. */
const HEADER_LIGHTNESS = 0.84;

/** A distance, not a proportion — see the header. */
const HEADER_FADE = 220;

/** The colour a member gets when they have no user row to be keyed on. */
const NEUTRAL_TINT = '#7B87A8';

export function DossierSheet({
  poolId,
  entryId,
  onClose,
}: {
  poolId: string;
  /** Null closes the sheet, matching `PlayerStatSheet`'s `stat` prop. */
  entryId: string | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { data, loading, error, refresh } = useDossier(poolId, entryId ?? undefined);

  // ⚠ `useState`, NOT `useRef` — this value is interpolated during render to
  // build the transform, and reading a ref while rendering is what
  // `react-hooks/refs` objects to. Same call `PlayerStatSheet` makes.
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(slide, {
      toValue: entryId ? 1 : 0,
      duration: entryId ? 220 : 160,
      easing: entryId ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entryId, slide]);

  if (!entryId) return null;

  const gradient = data?.user_id ? gradientForUser(data.user_id) : null;
  const tint = gradient ? gradient[0] : NEUTRAL_TINT;
  // ⚠ Dark mode keeps the translucent tint; light mode needs a lightness of its
  // own, or a dark identity colour drops the ink below contrast. See the player
  // sheet's note — the reasoning is the same and it is measured there.
  const headerColor = theme.mode === 'dark' ? tint : withLightness(tint, HEADER_LIGHTNESS);
  const headerAlpha = theme.mode === 'dark' ? 0.38 : 1;

  const displayName = data?.entry_name?.trim()
    ? data.entry_name
    : (data?.full_name ?? 'Scout report');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* ⚠⚠ A SIBLING, NOT A PARENT — see the header. This is what lets the
            list below scroll at all. */}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
        />

        <Animated.View
          style={{
            // ⚠⚠ DEFINITE, NOT `maxHeight` — see the header.
            height: screenHeight * 0.85,
            // ⚠ SNOW, NOT SURFACE. Cards in this app are `surface` on `snow`;
            // make the sheet body a screen and the cards can just be cards.
            backgroundColor: theme.colors.snow,
            borderTopLeftRadius: theme.radii.lg,
            borderTopRightRadius: theme.radii.lg,
            // So the header band reaches the rounded corners.
            overflow: 'hidden',
            transform: [
              { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
            ],
          }}
        >
          <LinearGradient
            // ⚠ Fades to the SAME colour at zero alpha, never 'transparent' —
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

          {/* ---- who ------------------------------------------------- */}
          {/* ⚠ NO GRAB HANDLE, matching the player sheet: it implies a drag
              this sheet does not support. The X says the same thing honestly,
              and tapping the backdrop still works. */}
          <View style={{ paddingTop: 22, paddingBottom: 18, paddingHorizontal: 20 }}>
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
              {/* ⚠ THE WRAPPER IS THE SPACING, not a leftover from the rank
                  badge it used to position. The column's `gap` is 3, which is
                  right between the three text lines and far too tight under an
                  80pt circle. */}
              <View style={{ marginBottom: 10 }}>
                <Avatar name={displayName} gradient={gradient} tint={tint} size={80} />
              </View>

              {/* ⚠ `sectionHeader`, a real token — their name IS this sheet's
                  heading, exactly as the player's is on that one. */}
              <Text variant="sectionHeader" numberOfLines={1}>
                {data?.is_self ? 'Your season' : displayName}
              </Text>

              {/* The player sheet's "position · team" line. Here: who they are,
                  and which pool this is — the two things that place the report. */}
              <Text variant="body" numberOfLines={1}>
                {[
                  data?.is_self ? displayName : data?.full_name,
                  data?.pool?.name,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>

              {/* Its headline line: the competition and the season total. */}
              {data?.competition || data?.standing ? (
                <Text variant="detail" color="slate" numberOfLines={1}>
                  {[
                    data.competition
                      ? `${data.competition.name} ${data.competition.season}`
                      : null,
                    data.standing ? `${data.standing.total_points} pts` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ) : null}
            </View>
          </View>

          {/* ---- the report ------------------------------------------ */}
          {/* ⚠ `flex: 1` AGAINST THE DEFINITE HEIGHT ABOVE. That pairing is the
              whole reason this scrolls; see the header. */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 28 }}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={{ paddingTop: 48, alignItems: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : error ? (
              <Pressable
                onPress={() => void refresh()}
                style={{ marginHorizontal: 20, paddingVertical: 28, alignItems: 'center', gap: 8 }}
              >
                <RNText
                  style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}
                >
                  Could not load the scout report
                </RNText>
                <RNText
                  style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}
                >
                  Tap to try again
                </RNText>
              </Pressable>
            ) : data ? (
              <Dossier dossier={data.dossier} isSelf={data.is_self} />
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * The face.
 *
 * ⚠ INITIALS ON A GRADIENT, NOT A PHOTOGRAPH. `users.avatar_url` exists and is
 * null for all 4,836 rows — nothing on mobile reads it, and real photos are
 * Avatars v1, which is unbuilt. This is the same avatar Banter and the duel
 * card draw, which is the point: one person, one colour, everywhere.
 */
function Avatar({
  name,
  gradient,
  tint,
  size,
}: {
  name: string;
  gradient: readonly [string, string] | null;
  tint: string;
  size: number;
}) {
  const theme = useTheme();
  const initials = getInitials(name);

  const label = (
    <RNText
      style={{
        fontFamily: fontFamilies.black,
        fontSize: Math.round(size * 0.34),
        color: '#FFFFFF',
      }}
    >
      {initials}
    </RNText>
  );

  // ⚠ A MEMBER WITH NO USER ROW STILL GETS A CIRCLE. An entry can outlive its
  // user; a missing gradient must not leave a hole where a face goes.
  if (!gradient) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: theme.radii.pill,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {label}
      </View>
    );
  }

  return (
    <LinearGradient
      colors={gradient as unknown as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: theme.radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {label}
    </LinearGradient>
  );
}
