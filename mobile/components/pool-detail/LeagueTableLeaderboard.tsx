import { Image, Platform, Pressable, Text as RNText, View } from 'react-native';

import { rankColor } from './leaderboard-shared';
import { Icon, Text } from '@/components/ui';
import type { LeagueLeaderboardEntry, LeagueLeaderboardMeta } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// TABLE MODE — the leaderboard for a pool with no matchweeks
// =============================================================
// The World Cup leaderboard states nine things per row, and in Table mode seven
// of them are unwritable: there is no base/bonus split (the engine files the
// whole score under one column), no form (one prediction, made in August), no
// hit rate or exact count (there are no fixture picks at all), and no XP or
// level (the league outbox BLOCKS both rather than storing zeros). Rendering
// them anyway is not a cosmetic problem — it is seven confident zeros.
//
// What is left is what the mode is actually about: where you are, what you
// scored, and who you backed to win it. The champion pick is the sub-line
// because it is the one fact people argue about in November, and it is stored
// state — position 1 of the saved ordering — not something computed here.
//
// ⚠ Nothing in this file does arithmetic on points. Rank, movement and total all
// arrive from `league_entry_totals` via the route; the champion's actual
// position is the ingested `league_standings.rank`, never re-derived from points
// (a derived table cannot see a points deduction).
// =============================================================

type Props = {
  entries: LeagueLeaderboardEntry[];
  league: LeagueLeaderboardMeta;
  currentUserId: string | null;
  onEntryPress?: (entryId: string) => void;
};

export function LeagueTableLeaderboard({ entries, league, currentUserId, onEntryPress }: Props) {
  const theme = useTheme();

  if (entries.length === 0) {
    return (
      <View style={{ paddingVertical: theme.spacing.hero, paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md }}>
        <Text variant="sectionHeader" align="center">
          No Entries Yet
        </Text>
        <Text variant="body" color="slate" align="center">
          The leaderboard fills up once people predict the table.
        </Text>
      </View>
    );
  }

  const hasPodium = entries.length >= 3;
  const rest = hasPodium ? entries.slice(3) : entries;

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.lg,
      }}
    >
      <SettlementNote isFinal={league.is_final} />

      {hasPodium ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm, paddingTop: theme.spacing.sm }}>
          <PodiumColumn
            entry={entries[1]}
            pedestalHeight={110}
            ringColor={theme.colors.silver}
            bgTint={withOpacity(theme.colors.silver, 0.15)}
            medalIcon="medal.fill"
            isCurrentUser={entries[1].user_id === currentUserId}
            onPress={onEntryPress ? () => onEntryPress(entries[1].entry_id) : undefined}
          />
          <PodiumColumn
            entry={entries[0]}
            pedestalHeight={136}
            ringColor={theme.colors.accent}
            bgTint={withOpacity(theme.colors.accent, 0.1)}
            medalIcon="trophy.fill"
            isCurrentUser={entries[0].user_id === currentUserId}
            onPress={onEntryPress ? () => onEntryPress(entries[0].entry_id) : undefined}
          />
          <PodiumColumn
            entry={entries[2]}
            pedestalHeight={92}
            ringColor={theme.colors.bronze}
            bgTint={withOpacity(theme.colors.bronze, 0.1)}
            medalIcon="medal.fill"
            isCurrentUser={entries[2].user_id === currentUserId}
            onPress={onEntryPress ? () => onEntryPress(entries[2].entry_id) : undefined}
          />
        </View>
      ) : null}

      {rest.map((entry, i) => (
        <TableRow
          key={entry.entry_id}
          entry={entry}
          rank={entry.current_rank ?? ((hasPodium ? 4 : 1) + i)}
          isCurrentUser={entry.user_id === currentUserId}
          onPress={onEntryPress ? () => onEntryPress(entry.entry_id) : undefined}
        />
      ))}
    </View>
  );
}

/**
 * ⚠ The one thing this screen MUST say. `league_standings` is upserted current
 * state, so every total here moves as the real table moves and is not a result
 * until the season-end snapshot freezes it. A leaderboard that shows a winner in
 * November without saying "so far" is claiming an outcome.
 */
function SettlementNote({ isFinal }: { isFinal: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <Icon name={isFinal ? 'checkmark.seal.fill' : 'clock'} color={isFinal ? 'green' : 'slate'} size={11} />
      <Text variant="caption" color="slate" style={{ textTransform: 'none', letterSpacing: 0 }}>
        {isFinal ? 'Final — the season is settled' : 'Standing so far — settles when the season ends'}
      </Text>
    </View>
  );
}

function PodiumColumn({
  entry,
  pedestalHeight,
  ringColor,
  bgTint,
  medalIcon,
  isCurrentUser,
  onPress,
}: {
  entry: LeagueLeaderboardEntry;
  pedestalHeight: number;
  ringColor: string;
  bgTint: string;
  medalIcon: string;
  isCurrentUser: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const name = entry.entry_name?.trim() ? entry.entry_name : entry.full_name;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: theme.spacing.xs,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: '100%', alignItems: 'center', height: 60, justifyContent: 'center' }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            borderWidth: 3,
            borderColor: ringColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={medalIcon as never} color="slate" size={22} />
        </View>
        <MovementPill entry={entry} floating />
      </View>

      <Text variant="caption" color={isCurrentUser ? 'primary' : 'ink'} align="center" numberOfLines={1}>
        {name}
      </Text>
      <Text variant="detail" color="slate" numberOfLines={1}>
        @{entry.username}
      </Text>

      <View
        style={{
          alignSelf: 'stretch',
          height: pedestalHeight,
          borderRadius: theme.radii.md,
          backgroundColor: bgTint,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.sm,
          gap: 4,
        }}
      >
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 22,
            fontWeight: '900',
            color: theme.colors.primary,
          }}
        >
          {entry.total_points.toLocaleString()}
        </RNText>
        <ChampionLine entry={entry} align="center" />
      </View>
    </Pressable>
  );
}

function TableRow({
  entry,
  rank,
  isCurrentUser,
  onPress,
}: {
  entry: LeagueLeaderboardEntry;
  rank: number;
  isCurrentUser: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const name = entry.entry_name?.trim() ? entry.entry_name : entry.full_name;
  const rankFg = rankColor(rank, theme);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md + 2,
        borderRadius: theme.radii.lg,
        // Matches LeaderboardRow's current-user treatment exactly, including the
        // pre-blended Android hexes — see the note there for why alpha over
        // elevation reads as a double ring on Android.
        backgroundColor: isCurrentUser
          ? Platform.OS === 'android'
            ? '#E2E6FA'
            : withOpacity(theme.colors.primary, 0.08)
          : theme.colors.surface,
        borderWidth: isCurrentUser ? (Platform.OS === 'android' ? 2 : theme.borders.accent) : 0,
        borderColor: isCurrentUser
          ? Platform.OS === 'android'
            ? '#B1BDF1'
            : withOpacity(theme.colors.primary, 0.25)
          : 'transparent',
        opacity: pressed ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      <View style={{ width: 36, alignItems: 'center' }}>
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 14,
            fontWeight: '900',
            color: rankFg,
          }}
        >
          #{rank}
        </RNText>
        <MovementPill entry={entry} />
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="cardTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
            {name}
          </Text>
          {isCurrentUser ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: theme.radii.pill,
                backgroundColor: withOpacity(theme.colors.primary, 0.15),
              }}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 9,
                  color: theme.colors.primary,
                  letterSpacing: 0.5,
                }}
              >
                YOU
              </RNText>
            </View>
          ) : null}
        </View>
        <Text variant="detail" color="slate">
          @{entry.username}
        </Text>
        <ChampionLine entry={entry} />
      </View>

      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 17,
          fontWeight: '900',
          color: theme.colors.primary,
        }}
      >
        {entry.total_points.toLocaleString()}
      </RNText>

      <Icon name="chevron.right" color="slate" size={11} />
    </Pressable>
  );
}

/**
 * Movement since the last time the table moved. Both ranks come from the engine;
 * a null on either side means it has not scored twice yet, which is a blank
 * rather than a zero.
 */
function MovementPill({ entry, floating = false }: { entry: LeagueLeaderboardEntry; floating?: boolean }) {
  const theme = useTheme();
  const delta =
    entry.previous_rank !== null && entry.current_rank !== null
      ? entry.previous_rank - entry.current_rank
      : 0;
  if (delta === 0) return null;

  const up = delta > 0;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1,
        marginTop: floating ? 0 : 2,
        ...(floating
          ? {
              position: 'absolute' as const,
              right: '12%' as const,
              bottom: -2,
              paddingHorizontal: 5,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: up ? theme.colors.green : theme.colors.red,
            }
          : {}),
      }}
    >
      <Icon
        name={up ? 'arrowtriangle.up.fill' : 'arrowtriangle.down.fill'}
        color={floating ? 'ink' : up ? 'green' : 'red'}
        size={floating ? 7 : 8}
      />
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: floating ? 8 : 9,
          color: floating ? '#FFFFFF' : up ? theme.colors.green : theme.colors.red,
        }}
      >
        {Math.abs(delta)}
      </RNText>
    </View>
  );
}

/**
 * Who they backed to win it, and where that club sits today.
 *
 * ⚠ "Never filed" and "backed the club sitting 12th" deserve different
 * sentences. Someone who joined after the deadline scores nothing through no
 * fault of their own, and a blank sub-line under a 0 reads as playing badly.
 */
function ChampionLine({
  entry,
  align = 'left',
}: {
  entry: LeagueLeaderboardEntry;
  align?: 'left' | 'center';
}) {
  const theme = useTheme();

  if (!entry.has_filed || !entry.champion) {
    return (
      <Text
        variant="detail"
        color="slate"
        align={align === 'center' ? 'center' : undefined}
        numberOfLines={1}
      >
        No table filed
      </Text>
    );
  }

  const { club_name, crest_url, actual_rank } = entry.champion;
  // Right so far — the club they picked for first is top of the real table.
  const leading = actual_rank === 1;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        justifyContent: align === 'center' ? 'center' : 'flex-start',
      }}
    >
      {crest_url ? (
        <Image source={{ uri: crest_url }} style={{ width: 13, height: 13 }} resizeMode="contain" />
      ) : null}
      <Text variant="detail" color="slate" numberOfLines={1} style={{ flexShrink: 1 }}>
        {club_name}
      </Text>
      {leading ? (
        <Icon name="checkmark.circle.fill" color="green" size={10} />
      ) : actual_rank !== null ? (
        <Text variant="detail" color="slate">
          {ordinal(actual_rank)}
        </Text>
      ) : null}
    </View>
  );
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
