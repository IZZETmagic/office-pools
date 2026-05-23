import { LinearGradient } from 'expo-linear-gradient';
import { ActionSheetIOS, Alert, Image, Platform, Pressable, Share, Text as RNText, View } from 'react-native';

import { Icon, NotificationDot, Text } from '@/components/ui';
import { getLevel } from '@/lib/levels';
import { usePendingActionsOptional } from '@/lib/usePendingActions';
import type { FormResult, PoolSummary } from '@/lib/useHomeData';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type PoolListItemProps = {
  pool: PoolSummary;
  onPress?: () => void;
};

const MODE_LABEL: Record<string, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Progressive',
  bracket_picker: 'Bracket',
};

const MODE_GRADIENT: Record<string, [string, string]> = {
  full_tournament: ['#667EEA', '#3B6EFF'],
  progressive: ['#34D399', '#059669'],
  bracket_picker: ['#FBBF24', '#D97706'],
};

const FORM_COLOR: Record<FormResult, string> = {
  exact: '#E2B830',
  winner_gd: '#52D660',
  winner: '#30B7FF',
  miss: '#EF4444',
};

function brandHex(hex: string | null): string | null {
  if (!hex) return null;
  return hex.startsWith('#') ? hex : `#${hex}`;
}

export function PoolListItem({ pool, onPress }: PoolListItemProps) {
  const theme = useTheme();
  const pending = usePendingActionsOptional();
  // Unified per-pool indicator. The card shows a single red dot if EITHER
  // banter has unread messages OR the pool has any unacknowledged pending
  // actions (badge unlocks, deadline warnings, level ups). The banter
  // floating action button INSIDE the pool detail keeps its numeric count
  // — only this card-level callout consolidates everything into a dot.
  const hasNonBanterIndicator = pending?.poolHasAny?.(pool.poolId) === true;
  const hasIndicator = pool.unreadBanterCount > 0 || hasNonBanterIndicator;
  const brandColor = brandHex(pool.brandColor);
  const isBranded = Boolean(pool.brandName && brandColor);
  const modeLabel = pool.predictionMode ? MODE_LABEL[pool.predictionMode] ?? 'Pool' : 'Pool';
  const modeGradient = pool.predictionMode
    ? MODE_GRADIENT[pool.predictionMode] ?? MODE_GRADIENT.full_tournament
    : MODE_GRADIENT.full_tournament;
  const isAdmin = pool.role === 'admin';
  // Use the canonical needsPredictions flag from useHomeData (which
  // accounts for prediction mode + empty entry lists), not a local
  // recomputation. The previous `!pool.hasSubmittedPredictions` got two
  // edge cases wrong: progressive pools where an earlier round was
  // submitted but a new one opened, AND admin-style pools where the
  // user has deleted all their entries.
  const needsPredictions = pool.needsPredictions;
  const level = getLevel(pool.totalPoints);
  const progress =
    pool.predictionsTotal > 0
      ? Math.min(1, pool.predictionsCompleted / pool.predictionsTotal)
      : 0;
  const accentColor = isBranded && brandColor ? brandColor : modeGradient[1];

  async function shareInvite() {
    const url = `https://sportpool.io/join/${pool.poolCode}`;
    await Share.share({
      message: `Join my World Cup prediction pool on SportPool!\n\n${url}`,
      url,
    });
  }

  // Non-admin members of a private pool can't share its invite — only
  // the pool admin can. Public pools are shareable by anyone (the join
  // code already isn't a secret since the pool is discoverable).
  const canShareInvite = !pool.isPrivate || pool.role === 'admin';

  function showContextMenu() {
    if (Platform.OS !== 'ios') return;
    // Dynamic action list: drop "Share Invite" when the current user
    // doesn't have permission so the index handler downshifts the other
    // actions to compensate.
    const actions = canShareInvite
      ? ['Share Invite', 'View Leaderboard', 'Make Predictions', 'Cancel']
      : ['View Leaderboard', 'Make Predictions', 'Cancel'];
    const indices = canShareInvite
      ? { share: 0, leaderboard: 1, predictions: 2 }
      : { share: -1, leaderboard: 0, predictions: 1 };
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: pool.poolName,
        options: actions,
        cancelButtonIndex: actions.length - 1,
      },
      (i) => {
        if (i === indices.share) {
          shareInvite();
          return;
        }
        switch (i) {
          case indices.leaderboard:
            Alert.alert('Coming soon', 'Pool leaderboard ships in a future update.');
            break;
          case indices.predictions:
            Alert.alert('Coming soon', 'Make predictions ships in a future update.');
            break;
        }
      },
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={showContextMenu}
      delayLongPress={350}
      style={({ pressed }) => ({
        backgroundColor: isBranded && brandColor ? withOpacity(brandColor, 0.05) : theme.colors.surface,
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
            {pool.brandLogoUrl ? (
              <Image
                source={{ uri: pool.brandLogoUrl }}
                style={{ width: 16, height: 16, borderRadius: 3 }}
                resizeMode="cover"
              />
            ) : pool.brandEmoji ? (
              <RNText style={{ fontSize: 12 }}>{pool.brandEmoji}</RNText>
            ) : null}
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

        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          <View style={{ gap: theme.spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
                {pool.poolName}
              </Text>
              {hasIndicator ? <NotificationDot size="md" /> : null}
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                flexWrap: 'wrap',
              }}
            >
              {isAdmin ? <Badge label="ADMIN" tone="primary" /> : null}
              <Badge label={modeLabel} tone="neutral" />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="person.2.fill" color="slate" size={11} />
                <Text variant="detail" color="slate">
                  {pool.memberCount}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.colors.snow,
              borderRadius: theme.radii.md,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.md,
              gap: theme.spacing.sm,
            }}
          >
            <StatBlock label="Rank" value={pool.currentRank !== null ? `#${pool.currentRank}` : '—'} />
            <Divider />
            <StatBlock label="Points" value={pool.totalPoints.toLocaleString()} />
            <Divider />
            <LevelBlock levelNumber={level.number} levelName={level.name} />
            <Divider />
            <View style={{ flex: 1, alignItems: 'center', gap: theme.spacing.xs }}>
              <FormSparkline results={pool.formResults} />
              <Text variant="detail" color="slate">
                Form
              </Text>
            </View>
            <Divider />
            <View style={{ flex: 1, alignItems: 'center', gap: theme.spacing.xs }}>
              <ProgressCircle
                completed={pool.predictionsCompleted}
                total={pool.predictionsTotal}
                accent={accentColor}
                progress={progress}
              />
              <Text variant="detail" color="slate">
                Picks
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            {needsPredictions ? (
              <>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.colors.amber,
                  }}
                />
                <Text variant="caption" color="amber">
                  Predictions needed
                </Text>
              </>
            ) : (
              <>
                <Icon name="checkmark.circle.fill" color="green" size={14} />
                <Text variant="caption" color="slate">
                  Submitted
                </Text>
              </>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: theme.spacing.xs }}>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 13,
          fontWeight: '700',
          color: theme.colors.ink,
        }}
      >
        {value}
      </RNText>
      <Text variant="detail" color="slate">
        {label}
      </Text>
    </View>
  );
}

function LevelBlock({ levelNumber, levelName }: { levelNumber: number; levelName: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: theme.spacing.xs }}>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 13,
          fontWeight: '700',
          color: theme.colors.ink,
        }}
      >
        Lv.{levelNumber}
      </RNText>
      <Text variant="detail" color="slate" numberOfLines={1}>
        {levelName}
      </Text>
    </View>
  );
}

function Divider() {
  const theme = useTheme();
  return (
    <View
      style={{
        width: theme.borders.thin,
        alignSelf: 'stretch',
        backgroundColor: withOpacity(theme.colors.silver, 0.25),
      }}
    />
  );
}

function FormSparkline({ results }: { results: FormResult[] }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', height: 18 }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const r = results[i];
        return (
          <View
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor: r ? FORM_COLOR[r] : theme.colors.mist,
            }}
          />
        );
      })}
    </View>
  );
}

function ProgressCircle({
  completed,
  total,
  accent,
  progress,
}: {
  completed: number;
  total: number;
  accent: string;
  progress: number;
}) {
  const theme = useTheme();
  const fullyDone = total > 0 && progress >= 1;
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: fullyDone ? accent : progress > 0 ? withOpacity(accent, 0.6) : theme.colors.mist,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 9,
          color: theme.colors.ink,
        }}
      >
        {completed}
      </RNText>
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: 'primary' | 'neutral' }) {
  const theme = useTheme();
  const bg = tone === 'primary' ? withOpacity(theme.colors.primary, 0.12) : theme.colors.mist;
  const fg = tone === 'primary' ? theme.colors.primary : theme.colors.slate;
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 2,
        borderRadius: theme.radii.pill,
        backgroundColor: bg,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          color: fg,
          letterSpacing: 0.5,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}
