// JS-rendered tab bar via Expo Router's <Tabs>. Tab icons specifically use
// Solar Icons (via react-native-solar-icons) — a soft-rounded icon set
// where every glyph ships in 6 styles. We use `linear` (clean stroke) for
// inactive tabs and `bold` (filled silhouette with internal details
// preserved) for the active tab. Rest of the app stays on Lucide via the
// existing Icon component.

import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { SolarIcon } from 'react-native-solar-icons';

import { useHomeData } from '@/lib/HomeDataProvider';
import { fontFamilies, useTheme } from '@/theme';

// Per-tab Solar icon name. Each renders in `linear` style when inactive
// and `bold` style when active — Solar handles both as variants of the
// same icon concept so the silhouette is consistent on focus.
const HOME_ICON = 'Home';
const POOLS_ICON = 'CupStar'; // soft rounded trophy cup with a star
const RESULTS_ICON = 'Football';
const ACTIVITY_ICON = 'Bell';
const PROFILE_ICON = 'UserCircle';

export default function TabLayout() {
  const theme = useTheme();
  const { data } = useHomeData();
  const totalUnread = (data?.pools ?? []).reduce((sum, p) => sum + p.unreadBanterCount, 0);

  // Solar's `linear` style is a clean soft-rounded stroke; `bold` is the
  // filled variant of the same shape with internal lines preserved (bell
  // clapper, person silhouette, etc). Toggle on focus.
  function renderTabIcon(iconName: string) {
    return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
      <SolarIcon name={iconName} type={focused ? 'bold' : 'linear'} size={size} color={color} />
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
