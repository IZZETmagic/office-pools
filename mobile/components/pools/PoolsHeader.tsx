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
  /**
   * Replaces the "+" with a view toggle, for a screen that has two views.
   *
   * ⚠ The label names WHERE THE TAP GOES, not where you are. An icon alone
   * cannot say which of those it means — people split about evenly on reading a
   * table glyph as "you are on tables" versus "tap for tables" — and the word
   * settles it. Reading the CURRENT view off the control is not needed here
   * because the content says it instantly: a fixture list and a table look
   * nothing alike.
   *
   * Takes the "+" slot rather than sitting beside it: create-and-join is on
   * Pools and Home too, and it is the odd thing out on a screen about football.
   */
  toggle?: {
    /** Where the tap goes, e.g. "Tables". */
    label: string;
    icon: string;
    onPress: () => void;
  } | null;
};

export function PoolsHeader({
  titlePrefix,
  titleAccent,
  subtitle,
  showMenu = true,
  onMenuPress,
  toggle = null,
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

      {toggle ? (
        <Pressable
          onPress={toggle.onPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Show ${toggle.label.toLowerCase()}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            borderRadius: theme.radii.pill,
            backgroundColor: withOpacity(theme.colors.ink, 0.06),
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name={toggle.icon as never} color="ink" size={15} weight="semibold" />
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 13, color: theme.colors.ink }}>
            {toggle.label}
          </RNText>
        </Pressable>
      ) : showMenu ? (
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
