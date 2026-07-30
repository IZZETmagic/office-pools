// Back-chevron header for the /settings stack. Lifted out of the old
// notification-settings screen so all five settings pages draw an identical
// one instead of each hand-rolling it (which is what the eight pool/match
// detail screens still do — deliberately not retrofitted here).

import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { useTheme, withOpacity } from '@/theme';

export function SettingsHeader({ title }: { title: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        paddingTop: insets.top + theme.spacing.sm,
        paddingBottom: theme.spacing.sm,
        backgroundColor: theme.colors.snow,
      }}
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: withOpacity(theme.colors.ink, 0.06),
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Icon name="chevron.left" size={16} tint={theme.colors.ink} weight="semibold" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {title}
        </Text>
      </View>
    </View>
  );
}
