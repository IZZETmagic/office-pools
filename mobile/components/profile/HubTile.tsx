import { Text as RNText, View } from 'react-native';

import { Icon, Pressable } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// One door on the Profile hub
// =============================================================
// Icon, title, and a one-line teaser read from the page it opens, so the hub
// says something before it is tapped.
//
// ⚠ A tile with no `onPress` is a page that is not built yet. It draws at full
// weight with a "Soon" chip and does nothing when tapped — visibly part of the
// plan, never a door into an empty screen.
//
// `chip` is the state of what the tile opens ("OFF" on Notifications while the
// phone has them off). It sits BESIDE the chevron, because unlike "Soon" the
// tile still opens.
// =============================================================

export function HubTile({
  icon,
  title,
  teaser,
  tint,
  chip,
  onPress,
}: {
  icon: string;
  title: string;
  teaser: string | null;
  tint: string;
  chip?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const soon = !onPress;

  return (
    <Pressable
      onPress={onPress}
      disabled={soon}
      accessibilityRole={soon ? undefined : 'button'}
      accessibilityLabel={soon ? `${title}, coming soon` : chip ? `${title}, ${chip.toLowerCase()}` : title}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 124,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        padding: theme.spacing.md,
        justifyContent: 'space-between',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            backgroundColor: withOpacity(tint, 0.12),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon as never} tint={tint} size={17} weight="semibold" />
        </View>
        {soon ? (
          <TileChip label="SOON" />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {chip ? <TileChip label={chip} /> : null}
            <Icon name="chevron.right" tint={theme.colors.slate} size={12} weight="semibold" />
          </View>
        )}
      </View>
      <View style={{ gap: 2 }}>
        <RNText style={{ fontFamily: fontFamilies.black, fontSize: 15, color: theme.colors.ink }}>
          {title}
        </RNText>
        <RNText
          numberOfLines={2}
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 11.5,
            lineHeight: 15,
            color: theme.colors.slate,
            minHeight: 15,
          }}
        >
          {teaser ?? ' '}
        </RNText>
      </View>
    </Pressable>
  );
}

/** The tile's small state label — "SOON", or what the page it opens is set to. */
function TileChip({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.mist,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.black,
          fontSize: 9,
          letterSpacing: 0.8,
          color: theme.colors.slate,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}
