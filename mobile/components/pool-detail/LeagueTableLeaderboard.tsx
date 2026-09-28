import { Platform, Pressable, Text as RNText, View } from 'react-native';

import { LeaderboardAvatar } from './LeaderboardAvatar';
import { MovementPill, rankColor } from './leaderboard-shared';
import { ClubBar, Icon, Text } from '@/components/ui';
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
  /**
   * Open somebody's table. ⚠ The CALLER decides whether a rival's is openable —
   * before the deadline only your own is, which is enforced in the database by
   * RLS (078/104) and stated by the sheet rather than discovered as an empty
   * result.
   */
  onEntryPress?: (entry: LeagueLeaderboardEntry) => void;
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
            bgTint={withOpacity(theme.colors.silver, 0.15)}
            isCurrentUser={entries[1].user_id === currentUserId}
            onPress={onEntryPress ? () => onEntryPress(entries[1]) : undefined}
          />
          <PodiumColumn
            entry={entries[0]}
            pedestalHeight={136}
            bgTint={withOpacity(theme.colors.accent, 0.1)}
            isCurrentUser={entries[0].user_id === currentUserId}
            onPress={onEntryPress ? () => onEntryPress(entries[0]) : undefined}
          />
          <PodiumColumn
            entry={entries[2]}
            pedestalHeight={92}
            bgTint={withOpacity(theme.colors.bronze, 0.1)}
            isCurrentUser={entries[2].user_id === currentUserId}
            onPress={onEntryPress ? () => onEntryPress(entries[2]) : undefined}
          />
        </View>
      ) : null}

      {rest.map((entry, i) => (
        <TableRow
          key={entry.entry_id}
          entry={entry}
          rank={entry.current_rank ?? ((hasPodium ? 4 : 1) + i)}
          isCurrentUser={entry.user_id === currentUserId}
          onPress={onEntryPress ? () => onEntryPress(entry) : undefined}
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
  bgTint,
  isCurrentUser,
  onPress,
}: {
  entry: LeagueLeaderboardEntry;
  pedestalHeight: number;
  bgTint: string;
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
      <View style={{ width: '100%', alignItems: 'center', height: 68, justifyContent: 'center' }}>
        {/*
          ⚠⚠ NO RING. It used to be a 3pt gold/silver/bronze border and it was the last
          thing on the podium naming the place, after the medal glyph was replaced by the
          face. Ryan asked for it gone and the face bigger — so placement is now carried by
          the PEDESTAL: its height, its tint, and the 2nd-1st-3rd column order. Losing the
          border is also what buys the extra 10pt, since the face no longer sits inside it.

          ⚠ `rank={1}`: a podium is never the tail of a long list, so FACE_LIMIT must not gate it.
        */}
        <LeaderboardAvatar
          userId={entry.user_id ?? null}
          name={name}
          avatarBuild={entry.avatar_build ?? null}
          avatarColour={entry.avatar_colour ?? null}
          size={64}
          rank={1}
        />
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
      {/*
        ⚠⚠ THE NUMBER DOES NOT MOVE — Ryan, having had to say it twice: "Don't move the position
        number. Keep it where it is." An earlier go at the gap below right-aligned this column,
        which shifted the number. That was the wrong side of the problem: what had to move was
        everything AFTER it.

        ⭐ SO THE FIX IS A NEGATIVE `marginRight`, not an alignment change. The column stays 36pt
        with its content CENTRED — the glyph sits exactly where it always did — and the negative
        margin only shortens the space the column consumes after itself, pulling the face, the
        name and the rest leftwards.

        ⚠ 8 is measured, not guessed. Menlo-Bold at 14 advances ~8.4pt a character, so "#1" is
        ~17pt inside a 36pt box and leaves ~9.6pt to its right; "#12" leaves ~5.4. Ranks past #99
        are rare — p95 across every pool is 35 entries — so 8 recovers the common case and the
        remainder is under a point either way.
      */}
      <View style={{ width: 36, alignItems: 'center', marginRight: -theme.spacing.sm }}>
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

      {/* ⭐ Between the position and the name — the order Ryan asked for: position, avatar,
          name, username. Its own fixed column rather than inside the `flex: 1` block, so a long
          entry name cannot squeeze it. */}
      <LeaderboardAvatar
        userId={entry.user_id ?? null}
        name={name}
        avatarBuild={entry.avatar_build ?? null}
        avatarColour={entry.avatar_colour ?? null}
        size={40}
        rank={rank}
      />

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
        <ClubBar url={crest_url} height={14} />
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
