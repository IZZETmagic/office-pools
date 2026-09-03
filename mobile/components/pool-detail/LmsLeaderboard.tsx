import { Platform, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { LeagueLeaderboardEntry, LeagueLeaderboardMeta } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// LAST MAN STANDING — who is left, and who has taken a round
// =============================================================
// This mode has no points. `total_points` is 0 for every entry in it and always
// will be, so a leaderboard with a score column would be a column of zeros: the
// exact shape of wrongness the Table-mode pass existed to remove. What people
// actually come here to read is whether they are still in.
//
// ## Two truths at once, and the season leads
//
// Ryan, 2026-09-03. A round is a few matchweeks; a season is a run of rounds.
// The season score is `rounds_won` and the round's question is binary. So the
// list is ordered rounds won first — done server-side in `compareLms` — and each
// row states its own round position. A two-time winner sitting top in a week
// they are out is correct, and the `OUT · MW6` chip is what stops it reading as
// a claim to still be alive.
//
// ⚠ In round one every `rounds_won` is 0, so the order collapses to pure
// survival: standing above out, and the out ordered by who lasted longer. That
// is the common case, and it is meant to look like the simple thing.
//
// ## No rank numbers
//
// Survival is binary — three survivors are equally alive, and numbering them
// #1/#2/#3 would invent a hierarchy the football has not produced and tell
// somebody they are last of the survivors when they are not. The eliminated do
// not get numbers either: the matchweek they went out in is the number that
// means something, and it is already on the row.
//
// ## The trophy is the whole memory of a round
//
// `league_lms_settle` opens the next round in the same transaction that closes
// one (087:266), so the instant a round is won everybody is back in and the
// survival column resets. Nothing else on this screen records that the round
// happened. That is why `rounds_won` is on the row and not tucked into a
// season summary somewhere.
//
// ## Nothing here decides anything
//
// Survival, elimination and round winners are all `league_lms_settle`'s. The
// ordering is the route's. This renders the record.
// =============================================================

type Props = {
  entries: LeagueLeaderboardEntry[];
  league: LeagueLeaderboardMeta;
  currentUserId: string | null;
};

export function LmsLeaderboard({ entries, league, currentUserId }: Props) {
  const theme = useTheme();
  const round = league.lms;

  if (entries.length === 0) {
    return (
      <View style={{ paddingVertical: theme.spacing.hero, paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md }}>
        <Text variant="sectionHeader" align="center">
          No Entries Yet
        </Text>
        <Text variant="body" color="slate" align="center">
          The leaderboard fills up once people join and start picking.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.md,
      }}
    >
      <RoundStrip round={round} />

      {entries.map((entry) => (
        <SurvivorRow
          key={entry.entry_id}
          entry={entry}
          isCurrentUser={entry.user_id === currentUserId}
        />
      ))}
    </View>
  );
}

/**
 * The round, and how many are left in it.
 *
 * ⚠ "of N" is the number IN THE ROUND, not the pool's membership. Someone who
 * joined after the round opened is not in it — counting them would make the
 * pool look like it had lost more people than it has.
 */
function RoundStrip({ round }: { round: LeagueLeaderboardMeta['lms'] }) {
  const theme = useTheme();

  if (!round) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xs }}>
        <Text variant="caption" color="slate" style={{ textTransform: 'none', letterSpacing: 0 }}>
          No round has opened yet
        </Text>
      </View>
    );
  }

  const isOver = round.last_matchweek !== null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: withOpacity(theme.colors.primary, 0.07),
      }}
    >
      <Icon name={isOver ? 'checkmark.seal.fill' : 'flame.fill'} color={isOver ? 'green' : 'primary'} size={12} />
      <Text variant="caption" color="ink" style={{ textTransform: 'none', letterSpacing: 0 }}>
        {isOver
          ? `Round ${round.round_number} is over`
          : `Round ${round.round_number} · ${round.standing} still standing of ${round.in_round}`}
      </Text>
    </View>
  );
}

function SurvivorRow({
  entry,
  isCurrentUser,
}: {
  entry: LeagueLeaderboardEntry;
  isCurrentUser: boolean;
}) {
  const theme = useTheme();
  const name = entry.entry_name?.trim() ? entry.entry_name : entry.full_name;
  const lms = entry.lms;
  const isStanding = !!lms?.in_round && lms.eliminated_matchweek === null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md + 2,
        borderRadius: theme.radii.lg,
        // Matches LeaderboardRow and LeagueTableLeaderboard's current-user
        // treatment exactly, including the pre-blended Android hexes — see the
        // note there for why alpha over elevation reads as a double ring.
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
        // Eliminated rows recede rather than disappear. They are still part of
        // the pool and still worth reading — the round happened to them too.
        opacity: isStanding ? 1 : 0.72,
        ...theme.shadows.card,
      }}
    >
      <StateDot lms={lms} />

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
        <Text variant="detail" color="slate" numberOfLines={1}>
          @{entry.username}
        </Text>
      </View>

      <RoundsWon count={lms?.rounds_won ?? 0} />
      <StateChip lms={lms} />
    </View>
  );
}

/** A colour before any words — the row's state readable at a glance down the list. */
function StateDot({ lms }: { lms: LeagueLeaderboardEntry['lms'] }) {
  const theme = useTheme();
  const color = !lms?.in_round
    ? theme.colors.slate
    : lms.eliminated_matchweek === null
      ? theme.colors.green
      : theme.colors.red;

  return (
    <View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: color,
      }}
    />
  );
}

/**
 * Rounds taken this season.
 *
 * ⚠ Rendered only when there is at least one. A "0×" beside every name in round
 * one would be a column of zeros with extra steps, and it is the thing this
 * screen exists to avoid.
 */
function RoundsWon({ count }: { count: number }) {
  const theme = useTheme();
  if (count < 1) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Icon name="trophy.fill" color="accent" size={13} />
      {count > 1 ? (
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            color: theme.colors.accent,
          }}
        >
          ×{count}
        </RNText>
      ) : null}
    </View>
  );
}

/**
 * Three states, not two.
 *
 * ⚠ "Joined late" is NOT an elimination. Somebody who came in after the round
 * opened enters the next one — everybody already in it has spent clubs, and a
 * newcomer with a full twenty would have an advantage nobody else had. Painting
 * them the same red as the eliminated would accuse them of losing a round they
 * were never allowed to play.
 */
function StateChip({ lms }: { lms: LeagueLeaderboardEntry['lms'] }) {
  const theme = useTheme();
  if (!lms) return null;

  const { label, color } = !lms.in_round
    ? { label: 'NEXT ROUND', color: theme.colors.slate }
    : lms.eliminated_matchweek === null
      ? { label: 'STILL IN', color: theme.colors.green }
      : { label: `OUT · MW${lms.eliminated_matchweek}`, color: theme.colors.red };

  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: theme.radii.pill,
        backgroundColor: withOpacity(color, 0.14),
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 9,
          color,
          letterSpacing: 0.5,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}
