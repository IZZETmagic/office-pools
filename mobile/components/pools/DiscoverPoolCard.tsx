import { Text as RNText, View } from 'react-native';

import { BlockShell, Divider } from './PoolListItem';
import { CompetitionRail } from '@/components/CompetitionRail';
import { Icon, Text, Pressable } from '@/components/ui';
import {
  discoverCardFacts,
  formatCountdown,
  formatSince,
  predictionStyleOf,
  PREDICTION_STYLE_LABEL,
} from '@/lib/discoverCard';
import { withLightness } from '@/lib/design/oklch';
import { getModeChip, getModeName } from '@/lib/design/poolMode';
import type { DiscoverPool } from '@/lib/useDiscoverPools';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type DiscoverPoolCardProps = {
  pool: DiscoverPool;
  onPress?: () => void;
};

// =============================================================
// A public pool, as someone deciding whether to join sees it
// =============================================================
// Card A (Ryan, 2026-10-09): the My Pools card's family — the competition down
// the side, the game as a pill, a stats strip, a footer — answering what a
// joiner needs: how many are in it, where the season is, and how long until
// picks lock.
//
// ⚠ IT WAS WORLD-CUP-ONLY UNTIL 2026-10-09, the bug the My Pools card had until
// 2026-09-05: a three-entry MODE_LABEL read with `?? 'Pool'`, so both public
// pools that day (Premier League Pick'em) wore the word "Pool" on a World Cup
// blue strip, beside a "232d" deadline that was the end of the season.
//
// ⚠ AND ITS PLAYER COUNT WAS ALWAYS 0 to anyone outside the pool — see
// migration 184 and `useDiscoverPools`.
// =============================================================

function brandHex(hex: string | null): string | null {
  if (!hex) return null;
  return hex.startsWith('#') ? hex : `#${hex}`;
}

export function DiscoverPoolCard({ pool, onPress }: DiscoverPoolCardProps) {
  const theme = useTheme();
  const isDark = theme.mode === 'dark';
  const brandColor = brandHex(pool.brandColor);
  const isBranded = Boolean(pool.brandName && brandColor);
  const modeLabel = getModeName(pool.predictionMode, pool.leagueMode);
  const modeChip = getModeChip(pool.predictionMode, pool.leagueMode, isDark);
  const style = predictionStyleOf(pool);
  const depth = style ? PREDICTION_STYLE_LABEL[style] : null;

  const now = new Date();
  const facts = discoverCardFacts(pool, pool.seasonClock, now);
  const countdown = formatCountdown(facts.lockAt, now);
  // Under a day, the countdown takes the amber the app uses for "picks needed",
  // lifted or deepened so it reads on the strip in either theme.
  const soonColor = withLightness(theme.colors.amber, isDark ? 0.82 : 0.52);

  const since = formatSince(pool.createdAt);
  const footer = pool.adminName ? `Run by ${pool.adminName} · since ${since}` : `Since ${since}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${pool.poolName}, ${modeLabel}, ${pool.memberCount} ${pool.memberCount === 1 ? 'player' : 'players'}`}
      style={({ pressed }) => ({
        backgroundColor: isBranded && brandColor ? withOpacity(brandColor, 0.05) : theme.colors.surface,
        borderRadius: theme.radii.lg,
        borderCurve: 'continuous',
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

        <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text
              numberOfLines={1}
              style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 18, lineHeight: 24, color: theme.colors.ink }}
            >
              {pool.poolName}
            </Text>
            <Icon name="chevron.right" color="slate" size={14} weight="semibold" />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            <Pill label={modeLabel} background={withOpacity(modeChip.base, modeChip.tint)} color={modeChip.ink} />
            {depth ? <Pill label={depth} background={theme.colors.mist} color={theme.colors.slate} /> : null}
          </View>

          {pool.description ? (
            <Text variant="body" color="slate" numberOfLines={2}>
              {pool.description}
            </Text>
          ) : null}

          {/* The same strip, blocks and dividers as the My Pools card. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.colors.snow,
              borderRadius: theme.radii.md,
              borderCurve: 'continuous',
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.sm,
              gap: theme.spacing.xs,
            }}
          >
            <BlockShell
              value={String(pool.memberCount)}
              valueColor={theme.colors.ink}
              label={pool.memberCount === 1 ? 'Player' : 'Players'}
            />
            {facts.matchweek ? (
              <>
                <Divider />
                {/* A pool that starts later than the open week says so, rather
                    than implying you would be picking this weekend. */}
                <BlockShell
                  value={`${facts.matchweek.startsAt ?? facts.matchweek.current}/${facts.matchweek.total}`}
                  valueColor={theme.colors.ink}
                  label={facts.matchweek.startsAt != null ? 'Starts' : 'Matchweek'}
                />
              </>
            ) : null}
            {countdown ? (
              <>
                <Divider />
                <BlockShell
                  value={countdown.text}
                  valueColor={countdown.soon ? soonColor : theme.colors.ink}
                  label={pool.leagueMode === 'table' ? 'Table locks' : 'Picks lock'}
                />
              </>
            ) : null}
          </View>

          <Text variant="caption" color="slate" numberOfLines={1}>
            {footer}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function Pill({ label, background, color }: { label: string; background: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: background }}>
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 11, color }}>{label}</RNText>
    </View>
  );
}
