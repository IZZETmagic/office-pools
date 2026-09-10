import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { Dossier } from '@/components/scouting/Dossier';
import { DossierHeader } from '@/components/scouting/DossierHeader';
import { useDossier } from '@/lib/useDossier';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// Scout — one member's dossier
// =============================================================
// Reached from the duel (an opponent) and from the Pick'em list (your own). It
// is a SCREEN rather than a section inside either, because the same report
// serves three callers and inlining it three times is three copies of a card
// with forty numbers in it.
//
// ⚠ IT DOES NOT REVEAL A SEALED OPPONENT. The caller arrives holding an entry
// id it already had; nothing here answers "who am I playing". The Duels surface
// owns that gate and this screen is downstream of it.
//
// ## ⚠ THE HEADER FLOATS, SO THE CONTENT PADS BY IT
//
// The band is absolutely positioned over the scroll view — that is what lets it
// slide up without a layout pass — so nothing reserves its space. The padding
// below is that reservation, and it is the MEASURED height rather than a
// constant: a name that wraps makes the band taller, and a guess would either
// clip the first card or leave a gap above it. Same call the Showdown band's
// `bandHeight` makes on the pool screen.
// =============================================================

export default function ScoutScreen() {
  const { id, entryId } = useLocalSearchParams<{ id: string; entryId: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data, loading, error, refresh } = useDossier(id, entryId);

  const scrollY = useSharedValue(0);
  const [bandHeight, setBandHeight] = useState(0);
  /** How far the band may travel: everything below the row that stays. */
  const [detailsHeight, setDetailsHeight] = useState(0);

  /**
   * ⚠ `'worklet'` AND A DIRECT `.value` WRITE — the house pattern, matching the
   * pool screen's handler. `react-hooks/immutability` flags the assignment; it
   * is a false positive for a Reanimated shared value, which is a mutable box by
   * design, and there are 32 of the same across `mobile/` for the same reason.
   * Written on the UI thread, read by the animated styles above. No re-render.
   */
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      scrollY.value = e.contentOffset.y;
    },
  });

  const slide = useAnimatedStyle(() => {
    if (detailsHeight === 0) return {};
    const p = interpolate(scrollY.value, [0, detailsHeight], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY: -p * detailsHeight }] };
  });

  /**
   * A hairline under the band, but only once it has collapsed.
   *
   * ⚠ AT REST THERE IS NOTHING TO DIVIDE — the band and the page are the same
   * colour and a line across an uninterrupted surface reads as a seam. It earns
   * its place only when content is passing underneath.
   */
  const hairline = useAnimatedStyle(() => {
    if (detailsHeight === 0) return { opacity: 0 };
    const p = interpolate(scrollY.value, [0, detailsHeight], [0, 1], Extrapolation.CLAMP);
    return { opacity: interpolate(p, [0.6, 1], [0, 1], Extrapolation.CLAMP) };
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: bandHeight + 8,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={{ paddingTop: 64, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : error ? (
          // ⚠ A STATED FAILURE WITH A WAY OUT, not an empty scroll view. The
          // most likely cause is a member with nothing revealed yet, and a blank
          // screen makes that look like a broken build.
          <Pressable
            onPress={() => void refresh()}
            style={{ marginHorizontal: 20, paddingVertical: 32, alignItems: 'center', gap: 8 }}
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
      </Animated.ScrollView>

      {/*
        ⚠ THE BAND IS LAST IN THE TREE so it paints over the scroll view without
        needing a zIndex — and `pointerEvents` stays default because the back
        button lives inside it.
      */}
      <Animated.View
        style={[
          { position: 'absolute', left: 0, right: 0, top: 0 },
          slide,
        ]}
      >
        {data ? (
          <DossierHeader
            data={data}
            scrollY={scrollY}
            topInset={insets.top}
            onHeight={setBandHeight}
            onDetailsHeight={setDetailsHeight}
          />
        ) : (
          // ⚠ THE BACK ROW EXISTS BEFORE THE DATA DOES. Without this the screen
          // has no way out for as long as the fetch takes, or for ever if it
          // fails — which is exactly when a member wants to leave.
          <View
            style={{
              paddingTop: insets.top + 6,
              backgroundColor: theme.colors.snow,
            }}
            onLayout={(e) => setBandHeight(e.nativeEvent.layout.height)}
          >
            <FallbackBar />
          </View>
        )}
        <Animated.View
          style={[
            { height: 1, backgroundColor: theme.colors.silver },
            hairline,
          ]}
        />
      </Animated.View>
    </View>
  );
}

function FallbackBar() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 10,
      }}
    >
      <BackButton />
      <RNText
        style={{ fontFamily: fontFamilies.black, fontSize: 17, color: theme.colors.ink }}
      >
        Scout
      </RNText>
    </View>
  );
}

function BackButton() {
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Icon name="chevron.left" size={22} color="ink" />
    </Pressable>
  );
}
