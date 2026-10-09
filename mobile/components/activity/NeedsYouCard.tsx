// A decision still open — the top of the Activity tab. The whole card is the
// button; the pill on it only says what tapping does. It leaves the list on the
// next fetch after the pick is made (derived server-side, see
// lib/activity/needsYou.ts on web).

import { Pressable, Text as RNText, View } from 'react-native';

import type { NeedsYouItem } from '@/lib/useActivity';
import { hapticCardTap } from '@/lib/haptics';
import { fontFamilies, useTheme } from '@/theme';

/** "45m left", "5h left", else "Sat 7:30 am" in the device's time zone. */
export function deadlineLabel(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso) - now;
  if (Number.isNaN(ms)) return '';
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m left`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h left`;
  // 12-hour with am/pm, built by hand so it reads the same on every device
  // regardless of the phone's 24-hour setting: "Sat 7:30 am".
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

export function NeedsYouCard({ item, onPress }: { item: NeedsYouItem; onPress: () => void }) {
  const theme = useTheme();
  // Crew cards (no clock) are drawn by CrewNeedsCard; this guard only keeps a NULL from drawing an
  // empty pill if one ever arrives here.
  const urgent = item.deadline_at !== null && Date.parse(item.deadline_at) - Date.now() < 86_400_000;
  const progress = item.total > 1 ? item.made / item.total : null;

  return (
    <Pressable
      onPress={() => {
        hapticCardTap();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.subtitle}. ${item.cta}`}
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        borderWidth: 1.5,
        borderColor: theme.colors.primary,
        padding: theme.spacing.md + 2,
        gap: theme.spacing.sm + 2,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}>
            {item.title}
          </RNText>
          <RNText
            numberOfLines={1}
            style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}
          >
            {item.subtitle}
          </RNText>
        </View>
        {item.deadline_at !== null ? (
          <View
            style={{
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 3,
              borderRadius: theme.radii.pill,
              backgroundColor: urgent ? theme.colors.redLight : theme.colors.amberLight,
            }}
          >
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 11,
                color: urgent ? theme.colors.red : theme.colors.amber,
              }}
            >
              {deadlineLabel(item.deadline_at)}
            </RNText>
          </View>
        ) : null}
      </View>

      {progress !== null ? (
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.colors.mist,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.round(progress * 100)}%`,
              height: '100%',
              backgroundColor: theme.colors.primary,
            }}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}>
          {item.total > 1 ? `${item.made} of ${item.total} picked` : 'Not done yet'}
        </RNText>
        <View
          style={{
            paddingHorizontal: theme.spacing.md,
            paddingVertical: 6,
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.primary,
          }}
        >
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: '#FFFFFF' }}>
            {item.cta}
          </RNText>
        </View>
      </View>
    </Pressable>
  );
}
