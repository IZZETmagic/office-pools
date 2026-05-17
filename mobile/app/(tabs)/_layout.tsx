// JS-rendered tab bar via Expo Router's <Tabs>. Used (instead of the native
// react-native-bottom-tabs) so we can render Lucide icons identically on iOS
// and Android. Trade-off: loses iOS UITabBar's native blur/spring; gains a
// single icon system for the whole app.

import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { Bell, Home, type LucideIcon, Trophy, UserCircle2, Volleyball } from 'lucide-react-native';
import { View } from 'react-native';

import { useHomeData } from '@/lib/HomeDataProvider';
import { fontFamilies, useTheme } from '@/theme';

export default function TabLayout() {
  const theme = useTheme();
  const { data } = useHomeData();
  const totalUnread = (data?.pools ?? []).reduce((sum, p) => sum + p.unreadBanterCount, 0);

  function renderTabIcon(IconComp: LucideIcon) {
    return ({ color, size }: { color: string; size: number; focused: boolean }) => (
      <IconComp color={color} size={size} strokeWidth={2.75} />
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
          tabBarIcon: renderTabIcon(Home),
        }}
      />
      <Tabs.Screen
        name="pools"
        options={{
          title: 'Pools',
          tabBarIcon: renderTabIcon(Trophy),
          tabBarBadge: totalUnread > 0 ? totalUnread : undefined,
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
          tabBarIcon: renderTabIcon(Volleyball),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: renderTabIcon(Bell),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: renderTabIcon(UserCircle2),
        }}
      />
    </Tabs>
  );
}
