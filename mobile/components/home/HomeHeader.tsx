import { router } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';

import { Icon, Text, Wordmark } from '@/components/ui';
import { getGreeting } from '@/lib/useHomeData';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type HomeHeaderProps = {
  fullName: string | null;
};

export function HomeHeader({ fullName }: HomeHeaderProps) {
  const theme = useTheme();
  const greeting = getGreeting();
  const firstName = (fullName ?? '').split(' ')[0]?.trim() || null;

  function showMenu() {
    Alert.alert(
      'Pool actions',
      'Create or join a pool',
      [
        { text: 'Create a Pool', onPress: () => router.navigate('/create-pool') },
        { text: 'Join with Code', onPress: () => router.navigate('/join-pool') },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: theme.spacing.lg,
        paddingHorizontal: theme.spacing.xl,
        paddingTop: theme.spacing.xl,
        paddingBottom: theme.spacing.md,
        backgroundColor: theme.colors.snow,
      }}
    >
      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        <Wordmark size={32} />
        <Text variant="body" color="slate" style={{ fontFamily: fontFamilies.semibold }}>
          {firstName ? `${greeting}, ${firstName}` : greeting}
        </Text>
      </View>

      <Pressable
        onPress={showMenu}
        hitSlop={8}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: theme.radii.pill,
          backgroundColor: withOpacity(theme.colors.ink, 0.06),
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Icon name="plus" color="ink" size={18} weight="semibold" />
      </Pressable>
    </View>
  );
}
