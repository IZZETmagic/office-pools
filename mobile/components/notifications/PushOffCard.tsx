// The notifications-off card at the top of Activity (lib/pushAsk.ts). It sits where the things
// notifications would have told the member already land, says plainly what turning them on brings,
// and closes for good with its ×. Deliberately NOT a Needs-you card: no primary border, and above
// that heading rather than in it — an open decision about a pool is not the same thing as a setting.

import { Text as RNText, View } from 'react-native';

import { Icon, Pressable } from '@/components/ui';
import type { PushAskMode } from '@/lib/pushAsk';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export function PushOffCard({
  mode,
  onTurnOn,
  onClose,
}: {
  mode: PushAskMode;
  onTurnOn: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        padding: theme.spacing.md + 2,
        gap: theme.spacing.sm + 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withOpacity(theme.colors.primary, 0.12),
          }}
        >
          <Icon name="bell.fill" tint={theme.colors.primary} size={17} weight="semibold" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, lineHeight: 20, color: theme.colors.ink }}>
            Notifications are off
          </RNText>
          <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 17, color: theme.colors.slate }}>
            Turn them on to hear when a matchweek opens, and before it locks if you haven’t picked.
          </RNText>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={({ pressed }) => ({
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.mist,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="xmark" tint={theme.colors.slate} size={11} weight="bold" />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        {/* The Needs-you card's own button, so the two read as one system. */}
        <Pressable
          onPress={() => {
            onTurnOn();
          }}
          hitSlop={6}
          accessibilityRole="button"
          style={({ pressed }) => ({
            paddingHorizontal: theme.spacing.md,
            paddingVertical: 6,
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.primary,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: '#FFFFFF' }}>
            {mode === 'settings' ? 'Open Settings' : 'Turn on'}
          </RNText>
        </Pressable>
      </View>
    </View>
  );
}
