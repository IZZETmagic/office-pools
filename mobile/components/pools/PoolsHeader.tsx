import { router } from 'expo-router';
import { Alert, Pressable, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type PoolsHeaderProps = {
  titlePrefix: string;
  titleAccent: string;
  subtitle: string;
  showMenu?: boolean;
};

export function PoolsHeader({
  titlePrefix,
  titleAccent,
  subtitle,
  showMenu = true,
}: PoolsHeaderProps) {
  const theme = useTheme();

  function openMenu() {
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

  const titleStyle = {
    fontFamily: fontFamilies.black,
    fontSize: 32,
    lineHeight: 36,
  };

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
        <View style={{ flexDirection: 'row' }}>
          <RNText style={[titleStyle, { color: theme.colors.ink }]}>{titlePrefix}</RNText>
          <RNText style={[titleStyle, { color: theme.colors.primary }]}>{titleAccent}</RNText>
        </View>
        <Text variant="body" color="slate" style={{ fontFamily: fontFamilies.semibold }}>
          {subtitle}
        </Text>
      </View>

      {showMenu ? (
        <Pressable
          onPress={openMenu}
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
      ) : null}
    </View>
  );
}
