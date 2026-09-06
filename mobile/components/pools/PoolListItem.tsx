import { ActionSheetIOS, Alert, Image, Platform, Pressable, Share, Text as RNText, View } from 'react-native';

import { CompetitionRail } from '@/components/CompetitionRail';
import { Icon, ProgressRing, Text } from '@/components/ui';
import { getCompetitionColor } from '@/lib/design/competition';
import { getModeChip, getModeName } from '@/lib/design/poolMode';
import { isPoolFinished, poolStatusDisplay } from '@/lib/poolStatus';
import { usePendingActionsOptional } from '@/lib/usePendingActions';
import type { FormResult, PoolSummary } from '@/lib/useHomeData';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// ⚠ MODE_LABEL AND MODE_GRADIENT ARE GONE, and neither was merely plainer than
// what replaced it. Both were three-entry tables keyed on `prediction_mode` —
// the World Cup's bracket modes — read with `?? 'Pool'` and
// `?? MODE_GRADIENT.full_tournament`. Every league pool therefore wore a badge
// reading the word "Pool" and a bar in the WORLD CUP'S BLUE. Measured against
// production on 2026-09-05: 17 pools, across five competitions, all wrong.
//
// The bar now carries the COMPETITION (CompetitionRail) and the mode moved to a
// coloured pill — the same two-part split the web made on 2026-08-29 and the
// home card took on 2026-09-02. This card is the last one to catch up.

type PoolListItemProps = {
  pool: PoolSummary;
  onPress?: () => void;
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
  // Unified per-pool notification count. Combines unread banter messages
  // with unacknowledged pending actions (badge unlocks, level ups,
  // deadline warnings) into a single "things to do for this pool" number.
  // Renders as a small red pill on the card. Displays `99+` past two
  // digits so the badge stays compact.
  const banterUnread = pool.unreadBanterCount;
  const pendingActions = pending?.poolPendingCount?.(pool.poolId) ?? 0;
  const totalCount = banterUnread + pendingActions;
  const countLabel = totalCount > 99 ? '99+' : String(totalCount);
  const brandColor = brandHex(pool.brandColor);
  const isBranded = Boolean(pool.brandName && brandColor);
  // ⚠ BOTH ARGUMENTS, ALWAYS. `predictionMode` alone cannot name a league pool
  // — all four league games carry `league_pickem` and the game itself is only
  // in `leagueMode`. Passing one is what produced "Pool".
  const modeLabel = getModeName(pool.predictionMode, pool.leagueMode);
  const modeChip = getModeChip(pool.predictionMode, pool.leagueMode, theme.mode === 'dark');
  const isAdmin = pool.role === 'admin';
  // Use the canonical needsPredictions flag from useHomeData (which
  // accounts for prediction mode + empty entry lists), not a local
  // recomputation. The previous `!pool.hasSubmittedPredictions` got two
  // edge cases wrong: progressive pools where an earlier round was
  // submitted but a new one opened, AND admin-style pools where the
  // user has deleted all their entries.
  const needsPredictions = pool.needsPredictions;
  // Pool lifecycle state. Once a pool is finished its footer must stop
  // reporting prediction status: "Predictions needed" (amber) is actively
  // misleading on a pool that can no longer be predicted, and "Submitted"
  // is stale trivia. Surface the pool's own state instead. Completed pools
  // only reach this card because the Pools tab shows every status — the
  // home dashboard's list is active-only.
  //
  // Label and finished-ness both come from lib/poolStatus so this card cannot
  // drift from the rest of the app. The previous hand-rolled version branched
  // on status === 'archived', a value nothing has ever written and that
  // migration 025b forbids outright.
  const isFinished = isPoolFinished(pool);
  const finishedLabel = poolStatusDisplay(pool).label;
  // The ring's colour. A branded pool keeps its own brand — that is the whole
  // point of branding it — and everything else takes the COMPETITION's, so the
  // ring and the rail agree. It used to take the mode gradient's second stop,
  // which is why a Premier League ring was World Cup blue.
  const accentColor =
    isBranded && brandColor ? brandColor : getCompetitionColor(pool.externalLeagueId);

  async function shareInvite() {
    const url = `https://sportpool.io/join/${pool.poolCode}`;
    await Share.share({
      // Not "World Cup" — this card now renders Premier League, La Liga, Serie
      // A, Bundesliga and Ligue 1 pools too, and the invite is the first thing
      // a stranger reads.
      message: `Join my prediction pool on SportPool!\n\n${url}`,
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
      {/* A branded pool shows its banner instead of the rail, as the web card
          does — two competing identities on one card is one too many.

          ⚠ `default` (46px), NOT the home card's `compact` (30px). At compact's
          22px mark the three wordmark lockups — La Liga, the Bundesliga and
          Ligue 1 — resolve as a shape rather than a readable word; the home
          card accepts that because it is a 244px tile in a horizontal scroller.
          This is a FULL-WIDTH list row and is the one surface that can afford
          the readable mark, so it takes it. The width it costs is paid for
          below. */}
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

        {/* ⚠ `md` PADDING, NOT `lg`, AND THE STRIP BELOW IS TIGHTER STILL —
            this is where the rail's extra 41px is paid back. Ryan chose to keep
            all five stats (2026-09-05), and five blocks only survive the wider
            rail if the chrome around them gives ground. Budget on a 393pt
            phone: 345 card − 46 rail − 24 padding − 16 strip padding − 4
            dividers − 32 gaps = 223, or ~45pt per block. The card it replaced
            had ~43pt, so nothing here is tighter than what shipped. */}
        <View style={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
          <View style={{ gap: theme.spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
                {pool.poolName}
              </Text>
              {totalCount > 0 ? (
                <View
                  style={{
                    minWidth: 22,
                    height: 20,
                    paddingHorizontal: 6,
                    borderRadius: 10,
                    backgroundColor: theme.colors.red,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <RNText
                    style={{
                      fontFamily: fontFamilies.bold,
                      fontSize: 11,
                      color: '#FFFFFF',
                      includeFontPadding: false,
                    }}
                  >
                    {countLabel}
                  </RNText>
                </View>
              ) : null}
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
              {isFinished ? <Badge label={finishedLabel.toUpperCase()} tone="success" /> : null}
              <ModePill label={modeLabel} chip={modeChip} />
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
              paddingHorizontal: theme.spacing.sm,
              gap: theme.spacing.xs,
            }}
          >
            <RankBlock
              currentRank={pool.currentRank}
              totalEntries={pool.totalEntries}
              hasScoringStarted={pool.hasScoringStarted}
            />
            <Divider />
            <StatBlock label="Points" value={pool.totalPoints.toLocaleString()} />
            {/* No level on a league pool — `pool.level` is NULL there because
                XP is World Cup machinery and does not apply. Its Divider goes
                with it so the row does not end up with two rules in a row. */}
            {pool.level ? (
              <>
                <Divider />
                <LevelBlock levelNumber={pool.level.number} levelName={pool.level.name} />
              </>
            ) : null}
            <Divider />
            <View style={{ flex: 1, alignItems: 'center', gap: theme.spacing.xs }}>
              <FormSparkline results={pool.formResults} />
              <Text variant="detail" color="slate">
                Form
              </Text>
            </View>
            <Divider />
            <View style={{ flex: 1, alignItems: 'center', gap: theme.spacing.xs }}>
              {/* ⚠ AN ARC, NOT A BORDER. What this replaced drew a full circle
                  whose BORDER COLOUR changed across three states with the count
                  inside, so 3 of 10 and 9 of 10 rendered identically. It also
                  had no idea about `isSingleDecision`, so a Predict-the-Table
                  or Last Man Standing pool — one decision for the whole season
                  — showed a bogus fraction. Shared with the home card so the
                  two cannot say different things about the same number. */}
              <ProgressRing
                completed={pool.predictionsCompleted}
                total={pool.predictionsTotal}
                singleDecision={pool.isSingleDecision}
                accent={accentColor}
                size={22}
                stroke={2.5}
              />
              <Text variant="detail" color="slate">
                Picks
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            {isFinished ? (
              <>
                <Icon name="trophy.fill" color="slate" size={14} />
                <Text variant="caption" color="slate">
                  {finishedLabel} &middot; final standings
                </Text>
              </>
            ) : needsPredictions ? (
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
        numberOfLines={1}
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

/**
 * The member's position, and the size of the field it is a position in.
 *
 * ⚠ "of N" IS THE LABEL, not a second value on the rank's baseline. It used to
 * sit beside `#4` in a `flexDirection: 'row'` — `#12` plus `of 623` plus the
 * gap is ~70pt of text in a block that has never been wider than ~45, and
 * nothing shrank or clipped it, so a big pool's rank ran into Points. Stacking
 * it costs nothing: `#4` over `of 30` still reads as a rank, and the word
 * "Rank" is only needed in the state where there is no number to read.
 */
function RankBlock({
  currentRank,
  totalEntries,
  hasScoringStarted,
}: {
  currentRank: number | null;
  totalEntries: number;
  hasScoringStarted: boolean;
}) {
  const theme = useTheme();
  const showRank = hasScoringStarted && currentRank !== null && totalEntries > 0;
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: theme.spacing.xs }}>
      <RNText
        numberOfLines={1}
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 13,
          fontWeight: '700',
          color: showRank ? theme.colors.ink : theme.colors.slate,
        }}
      >
        {showRank ? `#${currentRank}` : '—'}
      </RNText>
      <Text variant="detail" color="slate" numberOfLines={1}>
        {showRank ? `of ${totalEntries.toLocaleString()}` : 'Rank'}
      </Text>
    </View>
  );
}

function LevelBlock({ levelNumber, levelName }: { levelNumber: number; levelName: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: theme.spacing.xs }}>
      <RNText
        numberOfLines={1}
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

/**
 * The pool's game, in the game's own colour.
 *
 * ⚠ THIS IS THE ONLY PLACE THE MODE IS COLOURED, now that the rail carries the
 * competition — so telling a Showdown pool from a Last Man Standing one at a
 * glance depends entirely on it. Colours and treatment both mirror the web's
 * `.mode-pill`; see lib/design/poolMode.
 */
function ModePill({
  label,
  chip,
}: {
  label: string;
  chip: { base: string; ink: string; tint: number };
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 2,
        borderRadius: theme.radii.pill,
        backgroundColor: withOpacity(chip.base, chip.tint),
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          color: chip.ink,
          letterSpacing: 0.5,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: 'primary' | 'success' }) {
  const theme = useTheme();
  const bg =
    tone === 'primary'
      ? withOpacity(theme.colors.primary, 0.12)
      : withOpacity(theme.colors.green, 0.14);
  const fg = tone === 'primary' ? theme.colors.primary : theme.colors.green;
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
