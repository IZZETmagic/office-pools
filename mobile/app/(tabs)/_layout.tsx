// JS-rendered tab bar via Expo Router's <Tabs>. Tab icons specifically use
// Ionicons (via @expo/vector-icons) instead of our app-wide Lucide set
// because Ionicons ships a proper "outline → filled" pair per icon — the
// filled variant keeps internal detail (bell clapper, person silhouette,
// trophy handles) rather than turning the whole shape into a solid blob
// when the tab is active.

import { Ionicons } from '@expo/vector-icons';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { useHomeData } from '@/lib/HomeDataProvider';
import { fontFamilies, useTheme } from '@/theme';

// Each entry maps a tab to its Ionicons outline / filled glyph pair. Adding
// a new tab is one line here plus a Tabs.Screen below.
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type IconPair = { outline: IoniconName; filled: IoniconName };
const HOME_ICONS: IconPair = { outline: 'home-outline', filled: 'home' };
const POOLS_ICONS: IconPair = { outline: 'trophy-outline', filled: 'trophy' };
const RESULTS_ICONS: IconPair = { outline: 'football-outline', filled: 'football' };
const ACTIVITY_ICONS: IconPair = { outline: 'notifications-outline', filled: 'notifications' };
const PROFILE_ICONS: IconPair = {
  outline: 'person-circle-outline',
  filled: 'person-circle',
};

export default function TabLayout() {
  const theme = useTheme();
  const { data } = useHomeData();
  const totalUnread = (data?.pools ?? []).reduce((sum, p) => sum + p.unreadBanterCount, 0);

  // Pick the outline or filled glyph based on focus. Ionicons handles the
  // "internal lines stay visible when filled" treatment natively, so the
  // active tab reads as solid-but-detailed instead of a flat silhouette.
  function renderTabIcon(pair: IconPair) {
    return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
      <Ionicons name={focused ? pair.filled : pair.outline} size={size} color={color} />
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
          tabBarIcon: renderTabIcon(HOME_ICONS),
        }}
      />
      <Tabs.Screen
        name="pools"
        options={{
          title: 'Pools',
          tabBarIcon: renderTabIcon(POOLS_ICONS),
          tabBarBadge: totalUnread > 0 ? totalUnread : undefined,
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
