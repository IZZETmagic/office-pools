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
import { ALL_MATCH_TAB_KEYS, type MatchTabKey } from '@/lib/matchTabs';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// The match detail strip
// =============================================================
// The same object as `PoolTabBar`, at a smaller scale: pills, horizontal
// scroll, and an active highlight driven off the pager's
// `pageOffset` ON THE UI THREAD so it lands the moment you swipe rather than
// after a React commit.
//
// ⚠ ALWAYS ON A DARK BAND, so unlike `PoolTabBar` there is no `onDarkBand`
// flag. This strip only ever sits inside the competition band, which is dark in
// both app themes — so it takes its colours from the band, not from the device
// theme, and has no background of its own. An opaque strip here would cut the
// band's gradient off in a straight line where the tabs start.
// =============================================================

type TabDef = {
  key: MatchTabKey;
  label: string;
  icon: string;
};

// ⚠ LABELS AND ICONS ONLY. The ORDER and the SET live in `lib/matchTabs.ts`,
// where they can be unit tested — they drive every index into the pager, and an
// off-by-one there shows the wrong page rather than throwing.
const TAB_DEFS: Record<MatchTabKey, Omit<TabDef, 'key'>> = {
  facts: { label: 'Facts', icon: 'list.bullet' },
  lineups: { label: 'Line-ups', icon: 'person.3.fill' },
  stats: { label: 'Stats', icon: 'chart.bar.xaxis' },
  scouting: { label: 'Scouting', icon: 'binoculars' },
  predictions: { label: 'Predictions', icon: 'pencil.line' },
};

const ALL_TABS: TabDef[] = ALL_MATCH_TAB_KEYS.map((key) => ({ key, ...TAB_DEFS[key] }));

export { type MatchTabKey };

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
  tabs,
  onChange,
  pageOffset,
}: {
  active: MatchTabKey;
  /**
   * The tabs this match actually has, from `matchTabs()`. The strip renders
   * these and nothing else, so its indices line up with the pager's pages —
   * laying out `ALL_TABS` here would centre the highlight on the wrong pill the
   * moment a match lacks one.
   */
  tabs: MatchTabKey[];
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
  const shown = tabs.map((k) => ALL_TABS.find((t) => t.key === k)!).filter(Boolean);
  const activeIndex = shown.findIndex((t) => t.key === active);
  // ⚠ A PLAIN NUMBER, read by the centring worklet below. Capturing `shown`
  // itself would put a fresh array into a UI-thread closure on every render.
  const shownCount = shown.length;

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
  // spammed at rest. It was written before Line-ups and Statistics existed, for
  // the day they would — with four pills on a narrow phone the strip now does
  // genuinely scroll, which is what it was waiting for.
  useAnimatedReaction(
    () => pageOffset?.value ?? 0,
    (current, previous) => {
      'worklet';
      if (previous !== null && Math.abs(current - previous) < 0.005) return;
      const layouts = pillLayouts.value;
      const n = shownCount;
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
    [screenWidth, shownCount],
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
      {shown.map((tab, i) => (
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
