import { useRef } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  scrollTo,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useSharedValue,
} from 'react-native-reanimated';

import { Icon, NotificationDot } from '@/components/ui';
import { usePendingActionsOptional } from '@/lib/usePendingActions';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

/**
 * Euclidean RGB distance between two #RRGGBB hex strings (0..~441).
 * Used to detect when a brand color is too close to the surrounding bg
 * (in which case the active pill would visually disappear).
 */
function colorDistance(a: string, b: string): number {
  const parse = (hex: string) => {
    const c = hex.replace('#', '');
    return [
      parseInt(c.slice(0, 2), 16),
      parseInt(c.slice(2, 4), 16),
      parseInt(c.slice(4, 6), 16),
    ] as const;
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

export type PoolTabKey =
  | 'leaderboard'
  | 'predictions'
  | 'form'
  | 'scoring'
  | 'info'
  | 'rounds'
  | 'members'
  | 'fees'
  | 'settings';

type TabDef = {
  key: PoolTabKey;
  label: string;
  icon: string;
};

// Order matters — this drives the swipe sequence and tab-bar layout.
// 'info' sits AFTER Scoring (the last tab non-admins see today) so it
// becomes the natural "end-of-strip" surface for non-admins. Admins
// then continue into the admin-only Rounds / Members / Settings.
const ALL_TABS: TabDef[] = [
  { key: 'leaderboard', label: 'Leaderboard', icon: 'trophy.fill' },
  { key: 'predictions', label: 'Predictions', icon: 'pencil.line' },
  { key: 'form', label: 'Form', icon: 'chart.bar.xaxis' },
  { key: 'scoring', label: 'Scoring', icon: 'list.number' },
  { key: 'info', label: 'Info', icon: 'info.circle.fill' },
  { key: 'rounds', label: 'Rounds', icon: 'calendar.badge.clock' },
  { key: 'members', label: 'Members', icon: 'person.3.fill' },
  { key: 'fees', label: 'Fees', icon: 'dollarsign.circle.fill' },
  { key: 'settings', label: 'Settings', icon: 'gearshape.fill' },
];

type PoolTabBarProps = {
  active: PoolTabKey;
  onChange: (tab: PoolTabKey) => void;
  isAdmin: boolean;
  isProgressive: boolean;
  /**
   * Whether the pool has fee tracking turned on. Admin-only Fees tab is
   * gated on this — when the admin disables fee tracking in Settings
   * (entry_fee cleared to null), the tab disappears on next render.
   */
  feesEnabled: boolean;
  /**
   * Current fractional page offset of the swipe pager (0 = first page, 1 = second, etc).
   * Wired as a Reanimated SharedValue so the pool detail screen can write
   * to it on the UI thread via useAnimatedScrollHandler without triggering
   * a React re-render of the whole pool detail tree on every scroll frame.
   * This component subscribes via useAnimatedReaction and only fires an
   * imperative scrollTo on the inner ScrollView ref — no setState involved.
   */
  pageOffset?: SharedValue<number>;
  /** Overrides the active-pill color (used for branded pools). */
  accentColor?: string | null;
  /**
   * Pool the tab bar belongs to. Used to look up notification-dot state via
   * usePendingActions — e.g., Form tab gets a red dot when this pool has any
   * unacknowledged badge_unlock or level_up rows, Predictions tab gets one
   * when there's an unacknowledged deadline_warning. Optional: when omitted
   * (e.g., transitional render) the tab bar renders without dots.
   */
  poolId?: string;
};

export function getVisiblePoolTabs(
  isAdmin: boolean,
  isProgressive: boolean,
  feesEnabled: boolean,
): PoolTabKey[] {
  return ALL_TABS.filter((t) => {
    if (t.key === 'rounds') return isAdmin && isProgressive;
    if (t.key === 'fees') return isAdmin && feesEnabled;
    if (t.key === 'members' || t.key === 'settings') return isAdmin;
    return true;
  }).map((t) => t.key);
}

export function PoolTabBar({
  active,
  onChange,
  isAdmin,
  isProgressive,
  feesEnabled,
  pageOffset,
  accentColor,
  poolId,
}: PoolTabBarProps) {
  const theme = useTheme();
  const pending = usePendingActionsOptional();
  const { width: screenWidth } = useWindowDimensions();
  const visible = getVisiblePoolTabs(isAdmin, isProgressive, feesEnabled);
  const tabs = ALL_TABS.filter((t) => visible.includes(t.key));

  // Per-tab dot predicate. Form tab surfaces badge unlocks + level ups;
  // Predictions tab surfaces deadline warnings. Other tabs (Leaderboard,
  // Scoring, Info, etc.) don't currently have associated push notifications
  // in this alpha — so no dots for them.
  function tabHasIndicator(tabKey: PoolTabKey): boolean {
    if (!pending || !poolId) return false;
    if (tabKey === 'form') {
      return (
        pending.poolHasPending(poolId, 'badge_unlock') ||
        pending.poolHasPending(poolId, 'level_up')
      );
    }
    if (tabKey === 'predictions') {
      return pending.poolHasPending(poolId, 'deadline_warning');
    }
    return false;
  }
  // If the brand/primary color is visually indistinguishable from the bar's
  // background, fall back to the secondary accent so the active pill remains
  // legible (e.g. a near-white brand on light mode, or a deep navy on dark).
  const proposed = accentColor ?? theme.colors.primary;
  const activeColor =
    colorDistance(proposed, theme.colors.snow) < 80 ? theme.colors.accent : proposed;

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const pillLayoutsRef = useRef<{ x: number; width: number }[]>([]);
  // Mirror of the pill layouts as a shared value so the centering worklet can
  // read pill positions on the UI thread (a plain ref isn't worklet-readable).
  const pillLayouts = useSharedValue<{ x: number; width: number }[]>([]);

  function handlePillLayout(index: number, e: LayoutChangeEvent) {
    const { x, width } = e.nativeEvent.layout;
    pillLayoutsRef.current[index] = { x, width };
    // Fires once per pill on layout (not per frame), so copying the array to
    // the shared value here is cheap.
    pillLayouts.value = pillLayoutsRef.current.slice();
  }

  // Keep the active pill centered as the pager swipes — entirely on the UI
  // thread. This previously hopped to JS every frame (runOnJS → a JS
  // scrollTo), which visibly stuttered once the strip actually had to scroll
  // (i.e. past the first couple of tabs) whenever the JS thread was busy. The
  // same centering math now runs inside the reaction worklet and drives
  // Reanimated's UI-thread scrollTo, so the pills follow the content smoothly
  // regardless of JS-thread load. The 0.005 threshold still filters sub-pixel
  // noise so we don't spam scrollTo at rest.
  useAnimatedReaction(
    () => pageOffset?.value ?? 0,
    (current, previous) => {
      if (previous !== null && Math.abs(current - previous) < 0.005) return;
      const layouts = pillLayouts.value;
      const n = tabs.length;
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
      const targetX = Math.max(0, targetCenter - screenWidth / 2);
      scrollTo(scrollRef, targetX, 0, false);
    },
    [tabs.length, screenWidth],
  );

  return (
    <Animated.ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: theme.spacing.sm,
        paddingLeft: theme.spacing.xl,
        paddingRight: theme.spacing.xxl,
        paddingVertical: theme.spacing.sm,
        alignItems: 'center',
      }}
      style={{
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: 'auto',
        backgroundColor: theme.colors.snow,
      }}
    >
      {tabs.map((tab, i) => {
        const isActive = tab.key === active;
        const showDot = tabHasIndicator(tab.key);
        return (
          <View key={tab.key} onLayout={(e) => handlePillLayout(i, e)}>
            <Pressable
              onPress={() => onChange(tab.key)}
              style={({ pressed }) => ({
                flexShrink: 0,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.sm + 2,
                borderRadius: theme.radii.pill,
                backgroundColor: isActive
                  ? withOpacity(activeColor, 0.12)
                  : theme.colors.mist,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View>
                <Icon
                  name={tab.icon as never}
                  color={isActive ? undefined : 'slate'}
                  tint={isActive ? activeColor : undefined}
                  size={13}
                  weight="semibold"
                />
                {showDot ? <NotificationDot size="sm" top={-4} right={-6} /> : null}
              </View>
              <RNText
                numberOfLines={1}
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 13,
                  lineHeight: 16,
                  color: isActive ? activeColor : theme.colors.slate,
                  includeFontPadding: false,
                }}
              >
                {tab.label}
              </RNText>
            </Pressable>
          </View>
        );
      })}
    </Animated.ScrollView>
  );
}
