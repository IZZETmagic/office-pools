import { useEffect, useRef } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';

import { Icon } from '@/components/ui';
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
  | 'rounds'
  | 'members'
  | 'settings';

type TabDef = {
  key: PoolTabKey;
  label: string;
  icon: string;
};

const ALL_TABS: TabDef[] = [
  { key: 'leaderboard', label: 'Leaderboard', icon: 'trophy.fill' },
  { key: 'predictions', label: 'Predictions', icon: 'pencil.line' },
  { key: 'form', label: 'Form', icon: 'chart.bar.xaxis' },
  { key: 'scoring', label: 'Scoring', icon: 'list.number' },
  { key: 'rounds', label: 'Rounds', icon: 'calendar.badge.clock' },
  { key: 'members', label: 'Members', icon: 'person.3.fill' },
  { key: 'settings', label: 'Settings', icon: 'gearshape.fill' },
];

type PoolTabBarProps = {
  active: PoolTabKey;
  onChange: (tab: PoolTabKey) => void;
  isAdmin: boolean;
  isProgressive: boolean;
  /**
   * Current fractional page offset of the swipe pager (0 = first page, 1 = second, etc).
   * When provided, the pill row slides smoothly in step with the swipe.
   */
  pageOffset?: number;
  /** Overrides the active-pill color (used for branded pools). */
  accentColor?: string | null;
};

export function getVisiblePoolTabs(isAdmin: boolean, isProgressive: boolean): PoolTabKey[] {
  return ALL_TABS.filter((t) => {
    if (t.key === 'rounds') return isAdmin && isProgressive;
    if (t.key === 'members' || t.key === 'settings') return isAdmin;
    return true;
  }).map((t) => t.key);
}

export function PoolTabBar({
  active,
  onChange,
  isAdmin,
  isProgressive,
  pageOffset,
  accentColor,
}: PoolTabBarProps) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const visible = getVisiblePoolTabs(isAdmin, isProgressive);
  const tabs = ALL_TABS.filter((t) => visible.includes(t.key));
  // If the brand/primary color is visually indistinguishable from the bar's
  // background, fall back to the secondary accent so the active pill remains
  // legible (e.g. a near-white brand on light mode, or a deep navy on dark).
  const proposed = accentColor ?? theme.colors.primary;
  const activeColor =
    colorDistance(proposed, theme.colors.snow) < 80 ? theme.colors.accent : proposed;

  const scrollRef = useRef<ScrollView | null>(null);
  const pillLayoutsRef = useRef<Array<{ x: number; width: number }>>([]);

  function handlePillLayout(index: number, e: LayoutChangeEvent) {
    const { x, width } = e.nativeEvent.layout;
    pillLayoutsRef.current[index] = { x, width };
  }

  useEffect(() => {
    if (pageOffset === undefined) return;
    const clamped = Math.max(0, Math.min(pageOffset, tabs.length - 1));
    const lower = Math.floor(clamped);
    const upper = Math.min(lower + 1, tabs.length - 1);
    const alpha = clamped - lower;
    const a = pillLayoutsRef.current[lower];
    const b = pillLayoutsRef.current[upper];
    if (!a || !b) return;
    const centerA = a.x + a.width / 2;
    const centerB = b.x + b.width / 2;
    const targetCenter = centerA * (1 - alpha) + centerB * alpha;
    const targetX = Math.max(0, targetCenter - screenWidth / 2);
    scrollRef.current?.scrollTo({ x: targetX, animated: false });
  }, [pageOffset, screenWidth, tabs.length]);

  return (
    <ScrollView
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
              <Icon
                name={tab.icon as never}
                color={isActive ? undefined : 'slate'}
                tint={isActive ? activeColor : undefined}
                size={13}
                weight="semibold"
              />
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
    </ScrollView>
  );
}
