import { Pressable, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type PoolsHeaderProps = {
  titlePrefix: string;
  titleAccent: string;
  subtitle: string;
  showMenu?: boolean;
  /**
   * Called when the "+" menu button is tapped. Parent screens own the
   * bottom sheet that opens — keeps the header reusable and lets the
   * sheet mount at the screen root for proper positioning.
   */
  onMenuPress?: () => void;
};

export function PoolsHeader({
  titlePrefix,
  titleAccent,
  subtitle,
  showMenu = true,
  onMenuPress,
}: PoolsHeaderProps) {
  const theme = useTheme();

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
          onPress={onMenuPress}
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
