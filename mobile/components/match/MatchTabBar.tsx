import { useRef } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  scrollTo,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// The match detail strip
// =============================================================
// The same object as `PoolTabBar`, at a smaller scale and with a fixed set:
// pills, horizontal scroll, and an active highlight driven off the pager's
// `pageOffset` ON THE UI THREAD so it lands the moment you swipe rather than
// after a React commit.
//
// ⚠ ALWAYS ON A DARK BAND, so unlike `PoolTabBar` there is no `onDarkBand`
// flag. This strip only ever sits inside the competition band, which is dark in
// both app themes — so it takes its colours from the band, not from the device
// theme, and has no background of its own. An opaque strip here would cut the
// band's gradient off in a straight line where the tabs start.
// =============================================================

export type MatchTabKey = 'facts' | 'predictions';

type TabDef = {
  key: MatchTabKey;
  label: string;
  icon: string;
};

// Order drives both the swipe sequence and the strip layout.
//
// ⚠ LINE-UPS AND STATISTICS ARE DELIBERATELY ABSENT, not hidden behind a flag.
// Neither has a row in the database yet — `/fixtures/lineups` and
// `/fixtures/statistics` are never called — so a tab for either would be
// permanently empty, and a tab that is always there and never has anything in
// it teaches people to stop tapping it. They arrive when their data does.
const ALL_TABS: TabDef[] = [
  { key: 'facts', label: 'Facts', icon: 'list.bullet' },
  { key: 'predictions', label: 'Predictions', icon: 'pencil.line' },
];

export const MATCH_TABS: readonly MatchTabKey[] = ALL_TABS.map((t) => t.key);

/**
 * One pill. Its active styling reads `pageOffset` and HARD-SNAPS to the nearest
 * page (`Math.round`) — no tween — so the highlight is on the tab you swiped to
 * the instant you get there, without waiting on the JS thread.
 */
function TabPill({
  tab,
  index,
  pageOffset,
  activeIndex,
  onPress,
  onLayout,
}: {
  tab: TabDef;
  index: number;
  pageOffset?: SharedValue<number>;
  activeIndex: number;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const theme = useTheme();

  const bgStyle = useAnimatedStyle(() => {
    const offset = pageOffset?.value ?? activeIndex;
    return {
      backgroundColor:
        Math.round(offset) === index ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.10)',
    };
  });
  const labelStyle = useAnimatedStyle(() => {
    const offset = pageOffset?.value ?? activeIndex;
    return {
      color: Math.round(offset) === index ? '#16192B' : 'rgba(255,255,255,0.66)',
    };
  });
  // The active-tint icon snaps in over the dimmed base icon — no crossfade, so
  // it changes in the same frame as the pill behind it.
  const activeIconStyle = useAnimatedStyle(() => {
    const offset = pageOffset?.value ?? activeIndex;
    return { opacity: Math.round(offset) === index ? 1 : 0 };
  });

  return (
    <View onLayout={onLayout}>
      <Animated.View style={[{ borderRadius: theme.radii.pill, flexShrink: 0 }, bgStyle]}>
        <Pressable
          onPress={onPress}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeIndex === index }}
          accessibilityLabel={tab.label}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm + 1,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View>
            <Icon name={tab.icon as never} tint="rgba(255,255,255,0.66)" size={13} weight="semibold" />
            <Animated.View
              pointerEvents="none"
              style={[{ position: 'absolute', top: 0, left: 0 }, activeIconStyle]}
            >
              <Icon name={tab.icon as never} tint="#16192B" size={13} weight="semibold" />
            </Animated.View>
          </View>
          <Animated.Text
            numberOfLines={1}
            style={[
              {
                fontFamily: fontFamilies.bold,
                fontSize: 13,
                lineHeight: 16,
                includeFontPadding: false,
              },
              labelStyle,
            ]}
          >
            {tab.label}
          </Animated.Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export function MatchTabBar({
  active,
  onChange,
  pageOffset,
}: {
  active: MatchTabKey;
  onChange: (tab: MatchTabKey) => void;
  /**
   * Fractional page offset of the swipe pager, as a Reanimated shared value, so
   * the strip can follow the swipe without re-rendering the screen on every
   * frame. See `PoolTabBar` for the same arrangement at pool scale.
   */
  pageOffset?: SharedValue<number>;
}) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const activeIndex = ALL_TABS.findIndex((t) => t.key === active);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const pillLayoutsRef = useRef<{ x: number; width: number }[]>([]);
  const pillLayouts = useSharedValue<{ x: number; width: number }[]>([]);

  function handlePillLayout(index: number, e: LayoutChangeEvent) {
    const { x, width } = e.nativeEvent.layout;
    pillLayoutsRef.current[index] = { x, width };
    // Once per pill on layout, not per frame — copying the array here is cheap.
    pillLayouts.value = pillLayoutsRef.current.slice();
  }

  // Keep the active pill centred as the pager swipes, entirely on the UI
  // thread. The 0.005 threshold filters sub-pixel noise so `scrollTo` is not
  // spammed at rest. With two tabs this rarely has anywhere to scroll; it is
  // here so the strip still behaves when Line-ups and Statistics join it.
  useAnimatedReaction(
    () => pageOffset?.value ?? 0,
    (current, previous) => {
      'worklet';
      if (previous !== null && Math.abs(current - previous) < 0.005) return;
      const layouts = pillLayouts.value;
      const n = ALL_TABS.length;
      const clamped = Math.max(0, Math.min(current, n - 1));
      const lower = Math.floor(clamped);
      const upper = Math.min(lower + 1, n - 1);
      const alpha = clamped - lower;
      const a = layouts[lower];
      const b = layouts[upper];
      if (!a || !b) return;
      const centerA = a.x + a.width / 2;
      const centerB = b.x + b.width / 2;
      const targetCenter = centerA * (1 - alpha) + centerB * alpha;
      scrollTo(scrollRef, Math.max(0, targetCenter - screenWidth / 2), 0, false);
    },
    [screenWidth],
  );

  return (
    <Animated.ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.sm,
        alignItems: 'center',
      }}
      style={{
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: 'auto',
        backgroundColor: 'transparent',
      }}
    >
      {ALL_TABS.map((tab, i) => (
        <TabPill
          key={tab.key}
          tab={tab}
          index={i}
          pageOffset={pageOffset}
          activeIndex={activeIndex}
          onPress={() => onChange(tab.key)}
          onLayout={(e) => handlePillLayout(i, e)}
        />
      ))}
    </Animated.ScrollView>
  );
}
