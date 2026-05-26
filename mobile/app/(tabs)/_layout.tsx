// JS-rendered tab bar via Expo Router's <Tabs>. Tab icons swap variants
// based on focus:
//   - Inactive tab → stroke icon from @hugeicons/core-free-icons
//     (soft-rounded outlines, slate tint)
//   - Active tab   → solid icon from @hugeicons-pro/core-solid-rounded
//     (filled glyph, primary tint)
// The two icon families share the same naming convention so the swap is
// just a different module import — no per-tab logic. iOS/Android system
// tab bars typically do this same outline-to-filled swap on focus, and
// our purchase of the Pro pack lets us match that pattern natively.

import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  ChampionIcon,
  FootballPitchIcon,
  Home03Icon,
  Notification01Icon,
  UserCircleIcon,
} from '@hugeicons/core-free-icons';
import {
  ChampionIcon as ChampionSolidIcon,
  FootballPitchIcon as FootballPitchSolidIcon,
  Home03Icon as Home03SolidIcon,
  Notification01Icon as Notification01SolidIcon,
  UserCircleIcon as UserCircleSolidIcon,
} from '@hugeicons-pro/core-solid-rounded';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { NotificationDot } from '@/components/ui';
import { useHomeData } from '@/lib/HomeDataProvider';
import { usePendingActionsOptional } from '@/lib/usePendingActions';
import { fontFamilies, useTheme } from '@/theme';

// Per-tab icon pair: outline for inactive, solid for active. Hugeicons
// doesn't have a literal Trophy in either set, so the Pools tab uses
// Champion (a podium with a winner) — thematically aligned for a
// prediction pool app.
const HOME_ICONS = { outline: Home03Icon, solid: Home03SolidIcon };
const POOLS_ICONS = { outline: ChampionIcon, solid: ChampionSolidIcon };
const RESULTS_ICONS = { outline: FootballPitchIcon, solid: FootballPitchSolidIcon };
const ACTIVITY_ICONS = {
  outline: Notification01Icon,
  solid: Notification01SolidIcon,
};
const PROFILE_ICONS = { outline: UserCircleIcon, solid: UserCircleSolidIcon };

type IconPair = { outline: typeof Home03Icon; solid: typeof Home03Icon };

export default function TabLayout() {
  const theme = useTheme();
  const { data } = useHomeData();
  const pending = usePendingActionsOptional();
  // Pools tab indicator combines unread banter messages (HomeData) and any
  // unacknowledged pending actions (usePendingActions). When either is > 0,
  // we surface a small red dot — replacing the old numeric badge. The user
  // explicitly asked for dots (no numbers) at this level; only the banter
  // FAB inside a pool keeps numeric counts.
  const totalUnread = (data?.pools ?? []).reduce((sum, p) => sum + p.unreadBanterCount, 0);
  const poolsTabHasIndicator =
    totalUnread > 0 || (pending !== null && pending.totalIndicator > 0);

  // Picks the outline icon for inactive tabs and the solid icon for the
  // focused tab. strokeWidth only matters for the outline variant — solid
  // icons render as filled glyphs and ignore it. Both variants honor the
  // `color` tint (primary on focus, slate otherwise) injected by Tabs via
  // tabBarActiveTintColor / tabBarInactiveTintColor below.
  function renderTabIcon(icons: IconPair, hasDot = false) {
    return ({
      color,
      size,
      focused,
    }: {
      color: string;
      size: number;
      focused: boolean;
    }) => (
      <View
        style={{
          width: size + 8,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <HugeiconsIcon
          icon={focused ? icons.solid : icons.outline}
          color={color}
          size={size}
          strokeWidth={focused ? undefined : 2.5}
        />
        {hasDot ? <NotificationDot size="md" top={-2} right={-2} /> : null}
      </View>
    );
  }

  /**
   * Tab bar wrapped so the top border has a short coloured stub centred above
   * the focused tab's icon. The mist hairline still spans the full bar; the
   * blue segment overlays just the focused cell with icon-width.
   */
  const ACTIVE_INDICATOR_WIDTH = 44;
  function renderTabBar(props: BottomTabBarProps) {
    const focusedIndex = props.state.index;
    const tabCount = props.state.routes.length;
    return (
      <View>
        <View
          style={{
            flexDirection: 'row',
            height: 2,
            backgroundColor: theme.colors.surface,
          }}
        >
          {Array.from({ length: tabCount }).map((_, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              {i === focusedIndex ? (
                <View
                  style={{
                    width: ACTIVE_INDICATOR_WIDTH,
                    height: 2,
                    backgroundColor: theme.colors.primary,
                  }}
                />
              ) : null}
            </View>
          ))}
        </View>
        <BottomTabBar {...props} />
      </View>
    );
  }

  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.slate,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: 0, // we render our own segmented border above
        },
        tabBarLabelStyle: { fontFamily: fontFamilies.semibold, fontSize: 11 },
        // Mount all five tab screens in JS upfront (behind the splash)
        // rather than lazily on first focus. Pairs with enableScreens(false)
        // in app/_layout.tsx so that by the time the splash dismisses,
        // every tab is fully mounted and measured — tab switches are a
        // pure visibility flip with no perceivable mount work.
        lazy: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: renderTabIcon(HOME_ICONS),
        }}
      />
      <Tabs.Screen
        name="pools"
        options={{
          title: 'Pools',
          tabBarIcon: renderTabIcon(POOLS_ICONS, poolsTabHasIndicator),
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
          tabBarIcon: renderTabIcon(RESULTS_ICONS),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: renderTabIcon(ACTIVITY_ICONS),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: renderTabIcon(PROFILE_ICONS),
        }}
      />
    </Tabs>
  );
}
