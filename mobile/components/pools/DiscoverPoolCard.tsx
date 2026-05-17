import { LinearGradient } from 'expo-linear-gradient';
import { Platform, Pressable, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { DiscoverPool } from '@/lib/useDiscoverPools';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type DiscoverPoolCardProps = {
  pool: DiscoverPool;
  onPress?: () => void;
};

const MODE_LABEL: Record<string, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Progressive',
  bracket_picker: 'Bracket Picker',
};

const MODE_GRADIENT: Record<string, [string, string]> = {
  full_tournament: ['#667EEA', '#3B6EFF'],
  progressive: ['#34D399', '#059669'],
  bracket_picker: ['#FBBF24', '#D97706'],
};

const MODE_COLOR: Record<string, string> = {
  full_tournament: '#3B6EFF',
  progressive: '#059669',
  bracket_picker: '#D97706',
};

function brandHex(hex: string | null): string | null {
  if (!hex) return null;
  return hex.startsWith('#') ? hex : `#${hex}`;
}

function formatDeadline(iso: string | null): { text: string; urgent: boolean } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return { text: 'Soon', urgent: true };
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days >= 1) return { text: `${days}d`, urgent: days <= 3 };
  return { text: 'Soon', urgent: true };
}

export function DiscoverPoolCard({ pool, onPress }: DiscoverPoolCardProps) {
  const theme = useTheme();
  const brandColor = brandHex(pool.brandColor);
  const isBranded = Boolean(pool.brandName && brandColor);
  const mode = pool.predictionMode ?? 'full_tournament';
  const modeLabel = MODE_LABEL[mode] ?? 'Pool';
  const modeColor = MODE_COLOR[mode] ?? theme.colors.primary;
  const modeGradient = MODE_GRADIENT[mode] ?? MODE_GRADIENT.full_tournament;
  const deadline = formatDeadline(pool.predictionDeadline);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        flexDirection: 'row',
        opacity: pressed ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      {!isBranded ? (
        <LinearGradient
          colors={modeGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ width: 5 }}
        />
      ) : null}

      <View style={{ flex: 1 }}>
        {isBranded && brandColor ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.xs,
              backgroundColor: brandColor,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.xs + 2,
            }}
          >
            {pool.brandEmoji ? <RNText style={{ fontSize: 12 }}>{pool.brandEmoji}</RNText> : null}
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 11,
                color: '#FFFFFF',
                letterSpacing: 0.3,
              }}
              numberOfLines={1}
            >
              {pool.brandName}
            </RNText>
          </View>
        ) : null}

        <View style={{ padding: theme.spacing.md + 2, gap: theme.spacing.sm + 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
              {pool.poolName}
            </Text>
            {pool.alreadyJoined ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="checkmark.circle.fill" color="green" size={16} />
                <RNText
                  style={{
                    fontFamily: fontFamilies.semibold,
                    fontSize: 12,
                    color: theme.colors.green,
                  }}
                >
                  Joined
                </RNText>
              </View>
            ) : (
              <Icon name="chevron.right" color="slate" size={14} weight="semibold" />
            )}
          </View>

          {pool.description ? (
            <Text variant="body" color="slate" numberOfLines={2}>
              {pool.description}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}
          >
            <ModePill label={modeLabel} color={modeColor} />
            <View style={{ flex: 1 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="person.2.fill" color="slate" size={14} />
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 12,
                  color: theme.colors.slate,
                  letterSpacing: 0.3,
                }}
              >
                {pool.memberCount}
              </RNText>
            </View>
            {deadline ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="clock" color={deadline.urgent ? 'red' : 'slate'} size={14} />
                <RNText
                  style={{
                    fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                    fontSize: 12,
                    fontWeight: '700',
                    color: deadline.urgent ? theme.colors.red : theme.colors.slate,
                  }}
                >
                  {deadline.text}
                </RNText>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ModePill({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: withOpacity(color, 0.1),
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 11,
          color,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}
