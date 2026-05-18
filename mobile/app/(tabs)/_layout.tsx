// JS-rendered tab bar via Expo Router's <Tabs>. Tab icons use Hugeicons'
// free set — soft-rounded stroke style across all glyphs. The free tier
// doesn't include filled variants, so we signal the active tab via a
// thicker strokeWidth instead of fill (color also changes to primary,
// handled by tabBarActiveTintColor below). If we ever buy the Pro icon
// pack with bulk/duotone variants, the active state can switch to a
// true filled icon then.

import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  ChampionIcon,
  FootballIcon,
  Home03Icon,
  Notification01Icon,
  UserCircleIcon,
} from '@hugeicons/core-free-icons';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { useHomeData } from '@/lib/HomeDataProvider';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// Per-tab icon constant. Hugeicons doesn't have a literal Trophy in its
// free set, so the Pools tab uses Champion (a podium with a winner) —
// thematically aligned for a prediction pool app.
const HOME_ICON = Home03Icon;
const POOLS_ICON = ChampionIcon;
const RESULTS_ICON = FootballIcon;
const ACTIVITY_ICON = Notification01Icon; // closest free Hugeicons equivalent to a bell
const PROFILE_ICON = UserCircleIcon;

export default function TabLayout() {
  const theme = useTheme();
  const { data } = useHomeData();
  const totalUnread = (data?.pools ?? []).reduce((sum, p) => sum + p.unreadBanterCount, 0);

  // All tab icons render at the same stroke weight (2.5). The active-state
  // signal is (a) the primary color tint via tabBarActiveTintColor and
  // (b) a soft pill background behind the icon — Material 3 / iOS-26
  // pattern. Pill sizing is padding-based so it adapts to whatever icon
  // size React Navigation passes in.
  function renderTabIcon(icon: typeof Home03Icon) {
    return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: focused
            ? withOpacity(theme.colors.primary, 0.14)
            : 'transparent',
        }}
      >
        <HugeiconsIcon icon={icon} color={color} size={size} strokeWidth={2.5} />
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
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: renderTabIcon(HOME_ICON),
        }}
      />
      <Tabs.Screen
        name="pools"
        options={{
          title: 'Pools',
          tabBarIcon: renderTabIcon(POOLS_ICON),
          tabBarBadge: totalUnread > 0 ? totalUnread : undefined,
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
          tabBarIcon: renderTabIcon(RESULTS_ICON),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: renderTabIcon(ACTIVITY_ICON),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: renderTabIcon(PROFILE_ICON),
        }}
      />
    </Tabs>
  );
}
