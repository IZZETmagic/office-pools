// One tappable row: icon tile, title, optional subtitle, chevron. Replaces
// three near-identical hand-rolled Pressables that used to live in the profile
// tab (Change Password, the legal links, and the danger-zone buttons).
//
// `tone="danger"` recolours the tile + title red for Sign Out / Delete Account
// rather than those growing their own component again.

import { Pressable, Text as RNText, View } from 'react-native';

import { Icon } from '@/components/ui';
import { fontFamilies, useTheme } from '@/theme';

export function SettingsRow({
  icon,
  title,
  subtitle,
  tone = 'default',
  accessory = 'chevron',
  onPress,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  tone?: 'default' | 'danger';
  accessory?: 'chevron' | 'external' | 'none';
  onPress: () => void;
}) {
  const theme = useTheme();
  const danger = tone === 'danger';
  const tint = danger ? theme.colors.red : theme.colors.primary;
  const tileBg = danger ? theme.colors.redLight : theme.colors.primaryLight;
  const titleColor = danger ? theme.colors.red : theme.colors.ink;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm + 4,
        paddingHorizontal: theme.spacing.md - 2,
        paddingVertical: theme.spacing.sm + 2,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: tileBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon as never} tint={tint} size={14} weight="semibold" />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: titleColor }}>
          {title}
        </RNText>
        {subtitle ? (
          <RNText
            style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.slate }}
          >
            {subtitle}
          </RNText>
        ) : null}
      </View>
      {accessory === 'chevron' ? (
        <Icon name="chevron.right" tint={theme.colors.slate} size={12} weight="semibold" />
      ) : accessory === 'external' ? (
        <Icon name="arrow.up.right" tint={theme.colors.slate} size={11} weight="semibold" />
      ) : null}
    </Pressable>
  );
}
