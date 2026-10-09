import { Platform, Text as RNText, View } from 'react-native';

import { CompetitionRail } from '@/components/CompetitionRail';
import { Icon, Text, Pressable } from '@/components/ui';
import { getModeChip, getModeName, isLeaguePoolMode } from '@/lib/design/poolMode';
import type { DiscoverPool } from '@/lib/useDiscoverPools';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type DiscoverPoolCardProps = {
  pool: DiscoverPool;
  onPress?: () => void;
};

// ⚠ THIS CARD WAS WORLD-CUP-ONLY UNTIL 2026-10-09 — the same bug the Pools
// tab card had until 2026-09-05. It held a three-entry MODE_LABEL read with
// `?? 'Pool'` and a gradient read with `?? full_tournament`, so every league
// pool wore the word "Pool" on a World Cup blue strip. That was BOTH public
// pools on Discover that day (Premier League Pick'em). It now names the game
// and the competition the way PoolListItem does.

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
  const modeLabel = getModeName(pool.predictionMode, pool.leagueMode);
  const modeChip = getModeChip(pool.predictionMode, pool.leagueMode, theme.mode === 'dark');
  // ⚠ NOT FOR A LEAGUE POOL. Its `prediction_deadline` is the end of the season
  // (May 2027 on both public pools, 2026-10-09), so the chip read "232d" —
  // true, and no use to someone deciding whether to join this week.
  const deadline = isLeaguePoolMode(pool.predictionMode)
    ? null
    : formatDeadline(pool.predictionDeadline);

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
      {/* The competition, named down the side — as on the My Pools card. A
          branded pool shows its banner instead; one identity per card. */}
      {!isBranded ? (
        <CompetitionRail externalLeagueId={pool.externalLeagueId} size="default" />
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
            <ModePill label={modeLabel} chip={modeChip} />
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

/** The game, in its identity colour — the same pill as the My Pools card. */
function ModePill({
  label,
  chip,
}: {
  label: string;
  chip: { base: string; ink: string; tint: number };
}) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: withOpacity(chip.base, chip.tint),
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 11,
          color: chip.ink,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}
